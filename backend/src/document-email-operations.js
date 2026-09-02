const crypto = require("node:crypto");
const config = require("./config");

const AUTOMATIC_EMAIL_FEATURE = "automatic_authorization_email";
const AUTOMATIC_ORIGIN = "automatic_authorization";

function normalizeDocumentType(document = {}) {
  if (document.documentType === "nota_credito") return "nota_credito";
  if (!document.documentType || document.documentType === "factura") return "factura";
  return "";
}

function documentIdentity(document = {}) {
  const documentType = normalizeDocumentType(document);
  const documentId = String(document.id || "").trim();
  return documentType && documentId ? `${documentType}:${documentId}` : "";
}

function detectAutomaticEmailTransitions(currentData, finalData) {
  const previousByIdentity = new Map();
  for (const document of currentData?.sales || []) {
    const identity = documentIdentity(document);
    if (identity) previousByIdentity.set(identity, document);
  }

  const transitions = [];
  for (const document of finalData?.sales || []) {
    const identity = documentIdentity(document);
    if (!identity || document.status !== "AUTORIZADA") continue;
    const previous = previousByIdentity.get(identity);
    if (previous?.status === "AUTORIZADA") continue;
    transitions.push({ document, documentType: normalizeDocumentType(document), previous });
  }
  return transitions;
}

function buildAutomaticEmailOperation(companyId, finalData, transition, createdAt = new Date().toISOString()) {
  const { document, documentType } = transition;
  const client = (finalData.clients || []).find((item) => item.id === document.clientId);
  const sourceDocument = documentType === "nota_credito" && document.sourceSaleId
    ? (finalData.sales || []).find((item) => item.id === document.sourceSaleId)
    : undefined;
  const issuer = finalData.issuer || {};
  const recipientEmail = String(client?.email || "").trim().toLowerCase();
  const missing = [];

  if (!client) missing.push({ code: "CLIENT_NOT_FOUND", message: "No se encontro el cliente asociado al documento autorizado." });
  if (!recipientEmail) {
    missing.push({ code: "RECIPIENT_MISSING", message: "El cliente no tenia correo al momento de la autorizacion." });
  } else if (!isValidEmail(recipientEmail)) {
    missing.push({ code: "RECIPIENT_INVALID", message: "El correo del cliente no era valido al momento de la autorizacion." });
  }
  if (!String(document.authorizedXml || "").trim()) {
    missing.push({ code: "AUTHORIZED_XML_MISSING", message: "El documento autorizado no contiene el XML autorizado." });
  }
  if (!issuer.ruc || !issuer.businessName || !issuer.address) {
    missing.push({ code: "ISSUER_DATA_INCOMPLETE", message: "Faltan datos del emisor necesarios para preparar el RIDE." });
  }
  if (!Array.isArray(document.items) || document.items.length === 0) {
    missing.push({ code: "RIDE_DATA_INCOMPLETE", message: "Falta el detalle necesario para preparar el RIDE." });
  }

  const documentNumber = [
    document.establishment || issuer.establishment,
    document.emissionPoint || issuer.emissionPoint,
    document.sequence
  ].filter(Boolean).join("-");
  const payload = {
    schemaVersion: 1,
    authorizationSnapshot: {
      capturedAt: createdAt,
      document,
      client: client || null,
      issuer,
      sourceDocument: sourceDocument || null,
      recipientEmailAtAuthorization: recipientEmail,
      missing
    },
    delivery: {
      recipientEmail
    }
  };
  const identity = `${companyId}:${documentType}:${document.id}:${AUTOMATIC_ORIGIN}`;
  const payloadJson = stableStringify(payload);
  const firstError = missing[0];

  return {
    id: `emailop_${sha256(identity).slice(0, 40)}`,
    companyId,
    documentType,
    documentId: document.id,
    clientId: document.clientId || null,
    origin: AUTOMATIC_ORIGIN,
    status: missing.length ? "failed" : "pending",
    recipientEmail: recipientEmail || null,
    documentNumber,
    authorizationNumber: document.authorizationNumber || null,
    authorizationDate: document.authorizationDate || null,
    accessKey: document.accessKey || null,
    payload,
    payloadHash: sha256(payloadJson),
    attempts: 0,
    maxAttempts: 5,
    nextAttemptAt: createdAt,
    failedAt: missing.length ? createdAt : null,
    lastErrorCode: firstError?.code || null,
    lastErrorMessage: missing.map((item) => item.message).join(" "),
    retryable: missing.length === 0,
    createdAt,
    updatedAt: createdAt
  };
}

function buildManualEmailOperation(companyId, data, request = {}, createdAt = new Date().toISOString()) {
  const documentId = String(request.documentId || "").trim();
  const requestedType = String(request.documentType || "").trim();
  const document = (data?.sales || []).find((item) => {
    if (String(item?.id || "") !== documentId) return false;
    return !requestedType || normalizeDocumentType(item) === requestedType;
  });
  if (!document) throw operationError("No se encontro el documento solicitado.", 404);
  if (document.status !== "AUTORIZADA") {
    throw operationError("Solo se puede enviar un documento autorizado.", 409);
  }

  const documentType = normalizeDocumentType(document);
  if (!documentType) throw operationError("El tipo documental no permite envio por correo.", 400);
  const client = (data.clients || []).find((item) => item.id === document.clientId);
  if (!client) throw operationError("No se encontro el cliente asociado al documento.", 404);
  const recipientEmail = String(request.recipientEmail || client.email || "").trim().toLowerCase();
  if (!recipientEmail || !isValidEmail(recipientEmail)) {
    throw operationError("El correo del destinatario no es valido.", 400);
  }
  const sourceDocument = documentType === "nota_credito" && document.sourceSaleId
    ? (data.sales || []).find((item) => item.id === document.sourceSaleId)
    : undefined;
  const issuer = data.issuer || {};
  const requestId = String(request.requestId || crypto.randomUUID()).trim();

  return {
    id: `manual_email_${sha256(`${companyId}:${documentType}:${documentId}:${recipientEmail}:${requestId}`).slice(0, 40)}`,
    companyId,
    documentType,
    documentId,
    clientId: document.clientId || null,
    origin: "manual_resend",
    recipientEmail,
    payload: {
      schemaVersion: 1,
      authorizationSnapshot: {
        capturedAt: createdAt,
        document,
        client,
        issuer,
        sourceDocument: sourceDocument || null,
        recipientEmailAtAuthorization: recipientEmail,
        missing: []
      },
      delivery: { recipientEmail }
    }
  };
}

function buildManualRideOperation(companyId, data, request = {}, createdAt = new Date().toISOString()) {
  const documentId = String(request.documentId || "").trim();
  const requestedType = String(request.documentType || "").trim();
  const document = (data?.sales || []).find((item) => {
    if (String(item?.id || "") !== documentId) return false;
    return !requestedType || normalizeDocumentType(item) === requestedType;
  });
  if (!document) throw operationError("No se encontro el documento solicitado.", 404);
  if (document.status !== "AUTORIZADA") {
    throw operationError("El RIDE solo esta disponible para documentos autorizados.", 409);
  }

  const documentType = normalizeDocumentType(document);
  if (!documentType) throw operationError("El tipo documental no dispone de RIDE.", 400);
  const client = (data.clients || []).find((item) => item.id === document.clientId);
  if (!client) throw operationError("No se encontro el cliente asociado al documento.", 404);
  const sourceDocument = documentType === "nota_credito" && document.sourceSaleId
    ? (data.sales || []).find((item) => item.id === document.sourceSaleId)
    : undefined;

  return {
    id: `manual_ride_${sha256(`${companyId}:${documentType}:${documentId}`).slice(0, 40)}`,
    companyId,
    documentType,
    documentId,
    origin: "manual_ride",
    payload: {
      schemaVersion: 1,
      authorizationSnapshot: {
        capturedAt: createdAt,
        document,
        client,
        issuer: data.issuer || {},
        sourceDocument: sourceDocument || null,
        missing: []
      }
    }
  };
}

function operationError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function insertAutomaticEmailOperation(client, operation) {
  const result = await client.query(
    `INSERT INTO document_email_operations (
       id, company_id, document_type, document_id, client_id, origin, status,
       recipient_email, document_number, authorization_number, authorization_date,
       access_key, payload_json, payload_hash, attempts, max_attempts,
       next_attempt_at, failed_at, last_error_code, last_error_message, retryable,
       created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7,
       $8, $9, $10, $11, $12, $13::jsonb, $14, $15, $16,
       $17, $18, $19, $20, $21, $22, $23
     )
     ON CONFLICT (company_id, document_type, document_id, origin)
       WHERE origin = 'automatic_authorization'
     DO NOTHING
     RETURNING id`,
    [
      operation.id,
      operation.companyId,
      operation.documentType,
      operation.documentId,
      operation.clientId,
      operation.origin,
      operation.status,
      operation.recipientEmail,
      operation.documentNumber,
      operation.authorizationNumber,
      operation.authorizationDate,
      operation.accessKey,
      JSON.stringify(operation.payload),
      operation.payloadHash,
      operation.attempts,
      operation.maxAttempts,
      operation.nextAttemptAt,
      operation.failedAt,
      operation.lastErrorCode,
      operation.lastErrorMessage,
      operation.retryable,
      operation.createdAt,
      operation.updatedAt
    ]
  );
  return result.rowCount === 1;
}

async function createAutomaticEmailOperations(client, companyId, currentData, finalData, createdAt = new Date().toISOString()) {
  const transitions = detectAutomaticEmailTransitions(currentData, finalData);
  let created = 0;
  for (const transition of transitions) {
    const operation = buildAutomaticEmailOperation(companyId, finalData, transition, createdAt);
    if (await insertAutomaticEmailOperation(client, operation)) created += 1;
  }
  return { created, transitions: transitions.length };
}

async function automaticEmailFeatureMode(client, companyId) {
  if (config.automaticAuthorizationEmailMode === "off") return "off";
  const result = await client.query(
    `SELECT mode FROM company_feature_flags
     WHERE company_id = $1 AND feature = $2`,
    [companyId, AUTOMATIC_EMAIL_FEATURE]
  );
  const mode = result.rows[0]?.mode;
  return mode === "simulate" || mode === "send" ? mode : "off";
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

module.exports = {
  AUTOMATIC_EMAIL_FEATURE,
  automaticEmailFeatureMode,
  buildAutomaticEmailOperation,
  buildManualEmailOperation,
  buildManualRideOperation,
  createAutomaticEmailOperations,
  detectAutomaticEmailTransitions,
  insertAutomaticEmailOperation
};
