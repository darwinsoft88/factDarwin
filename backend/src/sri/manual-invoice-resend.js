const { DOMParser } = require("@xmldom/xmldom");
const {
  fiscalSnapshot,
  prevalidateManualRecovery,
  removeXmlDsigSignature
} = require("./manual-recovery-preflight");

const AUTHORIZATION_POLL_ATTEMPTS = 3;
const AUTHORIZATION_POLL_DELAY_MS = 3000;

async function executeManualInvoiceResend(options) {
  const {
    sale,
    companyId,
    signXml,
    askAuthorization,
    sendToReception,
    persistAuthorized,
    persistPending,
    recordAudit,
    sleep = delay,
    apply = false,
    confirmation = "",
    authorizationPollAttempts = AUTHORIZATION_POLL_ATTEMPTS,
    authorizationPollDelayMs = AUTHORIZATION_POLL_DELAY_MS
  } = options;
  if (Array.isArray(sale?.manualResendHistory) && sale.manualResendHistory.length > 0) {
    throw resendError("MANUAL_RESEND_ALREADY_ATTEMPTED", "La factura ya registra un intento de reenvio manual controlado. Solo se permite una recepcion.");
  }
  const preflightWithXml = await prevalidateManualRecovery({ sale, companyId, signXml, includeResignedXml: true });
  const { resignedXml, ...preflight } = preflightWithXml;
  if (!preflight.fiscalContentIdentical || !preflight.technicallyEligible || preflight.originalFingerprint !== preflight.resignedFingerprint) {
    throw resendError("MANUAL_RESEND_FISCAL_DIFFERENCE", "La prevalidacion detecto diferencias fiscales. Reenvio bloqueado.");
  }

  const sequence = normalizeSequence(sale.sequence);
  const expectedConfirmation = confirmationForSequence(sequence);
  const dryRun = {
    ok: true,
    mode: "DRY_RUN",
    sequence,
    sentToReception: false,
    authorizationQueried: false,
    persisted: false,
    expectedConfirmation,
    preflight
  };
  if (!apply) return dryRun;

  if (confirmation !== expectedConfirmation) {
    throw resendError("MANUAL_RESEND_CONFIRMATION_REQUIRED", `Se requiere confirmacion exacta: ${expectedConfirmation}`);
  }
  requireFunction(askAuthorization, "askAuthorization");
  requireFunction(sendToReception, "sendToReception");
  requireFunction(persistAuthorized, "persistAuthorized");
  requireFunction(persistPending, "persistPending");
  requireFunction(recordAudit, "recordAudit");

  const accessKey = preflight.invariants.claveAcceso.original;
  const sriEnvironment = xmlEnvironment(sale.signedXml);
  assertResignedXmlMatchesPreflight(resignedXml, preflight);

  const before = parseAuthorizationResponse(await askAuthorization(accessKey, sriEnvironment));
  if (before.status === "AUTORIZADO") {
    assertAuthorizedFiscalIdentity(before.authorizedXml, preflight);
    const audit = auditEvent({ sale, preflight, before, sentToReception: false, result: "RECOVERED_EXISTING_AUTHORIZATION" });
    const persisted = await persistAuthorized({ sale, signedXml: resignedXml, authorization: before, preflight, recoveryPath: "AUTHORIZATION_QUERY_ONLY", audit });
    return { ok: true, mode: "APPLY", sequence, sentToReception: false, authorizationQueried: true, persisted: true, status: "AUTORIZADA", persistence: persisted, preflight };
  }
  assertEligibleCode39Authorization(before);

  let receptionCalls = 0;
  receptionCalls += 1;
  const reception = parseReceptionResponse(await sendToReception(resignedXml, sriEnvironment));
  if (receptionCalls !== 1) throw resendError("MANUAL_RESEND_RECEPTION_COUNT_INVALID", "La herramienta excedio una llamada de recepcion.");
  if (reception.status !== "RECIBIDA") {
    await recordAudit(auditEvent({ sale, preflight, before, reception, sentToReception: true, result: "RECEPTION_REJECTED" }));
    throw resendError("MANUAL_RESEND_RECEPTION_REJECTED", `Recepcion SRI no aceptada: ${reception.status || "sin estado"}. ${reception.message}`.trim());
  }

  let after = null;
  const attempts = boundedAttempts(authorizationPollAttempts);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1) await sleep(authorizationPollDelayMs);
    after = parseAuthorizationResponse(await askAuthorization(accessKey, sriEnvironment));
    if (after.status === "AUTORIZADO" || after.status === "NO AUTORIZADO") break;
  }

  if (after?.status === "AUTORIZADO") {
    assertAuthorizedFiscalIdentity(after.authorizedXml, preflight);
    const audit = auditEvent({ sale, preflight, before, reception, after, sentToReception: true, result: "AUTHORIZED_AFTER_SINGLE_RECEPTION" });
    const persisted = await persistAuthorized({ sale, signedXml: resignedXml, authorization: after, preflight, recoveryPath: "RESIGNED_SINGLE_RECEPTION", audit });
    return { ok: true, mode: "APPLY", sequence, sentToReception: true, receptionCalls, authorizationQueried: true, persisted: true, status: "AUTORIZADA", persistence: persisted, preflight };
  }

  const result = after?.status === "NO AUTORIZADO" ? "NO_AUTORIZADO_AFTER_RESEND" : "AUTHORIZATION_PENDING_AFTER_RECEPTION";
  const audit = auditEvent({ sale, preflight, before, reception, after, sentToReception: true, result });
  const persisted = await persistPending({ sale, signedXml: resignedXml, authorization: after, reception, preflight, audit });
  return {
    ok: false,
    mode: "APPLY",
    sequence,
    sentToReception: true,
    receptionCalls,
    authorizationQueried: true,
    persisted: true,
    status: after?.status || "ENVIADA",
    persistence: persisted,
    preflight,
    message: after?.message || "Recepcion aceptada; autorizacion aun pendiente. No reenviar nuevamente."
  };
}

function assertResignedXmlMatchesPreflight(resignedXml, preflight) {
  const snapshot = fiscalSnapshot(removeXmlDsigSignature(resignedXml));
  if (snapshot.fingerprint !== preflight.originalFingerprint || snapshot.fingerprint !== preflight.resignedFingerprint) {
    throw resendError("MANUAL_RESEND_FISCAL_DIFFERENCE", "El XML preparado para recepcion no coincide con el fingerprint prevalidado.");
  }
}

function assertAuthorizedFiscalIdentity(authorizedXml, preflight) {
  if (!authorizedXml) throw resendError("MANUAL_RESEND_AUTHORIZED_XML_MISSING", "SRI indico AUTORIZADO sin devolver el comprobante para validar identidad fiscal.");
  const fingerprint = fiscalSnapshot(removeXmlDsigSignature(authorizedXml)).fingerprint;
  if (fingerprint !== preflight.originalFingerprint) {
    throw resendError("MANUAL_RESEND_AUTHORIZED_XML_MISMATCH", "El comprobante autorizado por SRI no coincide con el contenido fiscal prevalidado.");
  }
}

function assertEligibleCode39Authorization(result) {
  if (result.status === "PROCESAMIENTO" || result.codes.includes("70")) {
    throw resendError("MANUAL_RESEND_ACCESS_KEY_PROCESSING", "La clave esta en procesamiento (codigo 70). No se debe reenviar.");
  }
  if (result.status !== "NO AUTORIZADO" || !result.codes.includes("39")) {
    throw resendError("MANUAL_RESEND_CODE_39_REQUIRED", `La consulta previa debe devolver NO AUTORIZADO codigo 39; recibido: ${result.status || "sin estado"} ${result.codes.join(",")}.`);
  }
}

function parseAuthorizationResponse(response) {
  const body = String(response?.body || response || "");
  const numberOfDocuments = integerText(body, "numeroComprobantes");
  const authorization = firstElementXml(body, "autorizacion");
  const source = authorization || body;
  const status = xmlText(source, "estado") || (numberOfDocuments === 0 ? "SIN_COMPROBANTES" : "");
  const messages = sriMessages(source);
  return {
    transportOk: response?.ok !== false,
    numberOfDocuments,
    status,
    authorizationNumber: xmlText(source, "numeroAutorizacion"),
    authorizationDate: xmlText(source, "fechaAutorizacion"),
    sriEnvironment: xmlText(source, "ambiente"),
    authorizedXml: decodeXml(xmlText(source, "comprobante")),
    codes: messages.codes,
    message: messages.message,
    rawStatus: response?.status
  };
}

function parseReceptionResponse(response) {
  const body = String(response?.body || response || "");
  const messages = sriMessages(body);
  return { transportOk: response?.ok !== false, status: xmlText(body, "estado"), codes: messages.codes, message: messages.message, rawStatus: response?.status };
}

function sriMessages(xml) {
  const document = parseXml(xml);
  const codes = elementTexts(document, "identificador");
  const messages = elementTexts(document, "mensaje");
  const additional = elementTexts(document, "informacionAdicional");
  return { codes: [...new Set(codes)], message: [...new Set([...messages, ...additional])].join(" | ") };
}

function auditEvent({ sale, preflight, before, reception, after, sentToReception, result }) {
  return {
    event: "MANUAL_INVOICE_RESEND_CONTROLLED",
    entity: "sale",
    entityId: sale.id,
    summary: `Recuperacion manual controlada factura ${normalizeSequence(sale.sequence)}: ${result}`,
    metadata: {
      sequence: normalizeSequence(sale.sequence),
      originalStatus: sale.status,
      originalInventoryState: sale.inventoryState,
      retryHistoryPreserved: true,
      originalFingerprint: preflight.originalFingerprint,
      resignedFingerprint: preflight.resignedFingerprint,
      originalSigningTime: preflight.originalSigningTime,
      newSigningTime: preflight.newSigningTime,
      fiscalContentIdentical: preflight.fiscalContentIdentical,
      sentToReception,
      receptionCallCount: sentToReception ? 1 : 0,
      authorizationBefore: summaryResponse(before),
      reception: summaryResponse(reception),
      authorizationAfter: summaryResponse(after),
      result,
      inventoryApplied: false
    }
  };
}

function summaryResponse(value) { return value ? { status: value.status, codes: value.codes || [], message: value.message || "", authorizationNumber: value.authorizationNumber || "" } : null; }
function confirmationForSequence(sequence) { return `RESEND-${Number(sequence)}-AFTER-PREFLIGHT`; }
function boundedAttempts(value) { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 5) : AUTHORIZATION_POLL_ATTEMPTS; }
function xmlEnvironment(xml) { const value = xmlText(xml, "ambiente"); if (value === "1") return "test"; if (value === "2") return "production"; throw resendError("MANUAL_RESEND_ENVIRONMENT_INVALID", `Ambiente XML invalido: ${value || "vacio"}.`); }
function integerText(xml, name) { const value = xmlText(xml, name); return /^\d+$/.test(value) ? Number(value) : null; }
function xmlText(xml, name) { const document = parseXml(xml); return elementTexts(document, name)[0] || ""; }
function elementTexts(document, name) { const nodes = document.getElementsByTagNameNS("*", name); return Array.from({ length: nodes.length }, (_, index) => String(nodes.item(index).textContent || "").trim()).filter(Boolean); }
function firstElementXml(xml, name) { const match = String(xml || "").match(new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>[\\s\\S]*?<\\/(?:\\w+:)?${name}>`, "i")); return match ? match[0] : ""; }
function parseXml(xml) { const document = new DOMParser().parseFromString(String(xml || "<empty/>"), "text/xml"); if (!document.documentElement || document.getElementsByTagName("parsererror").length) throw resendError("MANUAL_RESEND_SRI_XML_INVALID", "Respuesta XML SRI invalida."); return document; }
function decodeXml(value) { return String(value || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&"); }
function normalizeSequence(value) { const digits = String(value || "").replace(/\D/g, ""); return digits ? digits.padStart(9, "0").slice(-9) : ""; }
function requireFunction(value, name) { if (typeof value !== "function") throw resendError("MANUAL_RESEND_DEPENDENCY_MISSING", `Falta dependencia ${name}.`); }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function resendError(code, message) { const error = new Error(message); error.code = code; return error; }

module.exports = {
  AUTHORIZATION_POLL_ATTEMPTS,
  AUTHORIZATION_POLL_DELAY_MS,
  assertEligibleCode39Authorization,
  confirmationForSequence,
  executeManualInvoiceResend,
  parseAuthorizationResponse,
  parseReceptionResponse
};
