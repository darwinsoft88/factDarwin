const crypto = require("node:crypto");
const { DOMParser } = require("@xmldom/xmldom");
const config = require("./config");
const { buildRidePdf } = require("./ride-pdf");
const { getTenantLogo } = require("./tenant-assets");

class EmailBuildError extends Error {
  constructor(code, message, retryable = false) {
    super(message);
    this.name = "EmailBuildError";
    this.code = code;
    this.retryable = retryable;
  }
}

async function buildDocumentEmail(operation, options = {}) {
  const startedAt = Date.now();
  const limits = options.limits || config.emailBuildLimits;
  const emit = typeof options.onEvent === "function" ? options.onEvent : () => undefined;
  emit("email_build_started", { durationMs: 0 });

  try {
    const documentType = normalizeDocumentType(operation.documentType);
    const snapshot = operation.payload?.authorizationSnapshot || {};
    const document = snapshot.document || {};
    const client = snapshot.client || {};
    const issuer = snapshot.issuer || {};
    const tenantLogo = resolveTenantLogo(operation.companyId);
    const recipient = normalizeRecipient(operation.recipientEmail || operation.payload?.delivery?.recipientEmail);
    const xmlAttachment = buildXmlAttachment(documentType, document, limits);
    emit("email_xml_validated", attachmentLog(xmlAttachment, startedAt));

    const pdfAttachment = await buildDocumentRide(operation, { limits });
    emit("email_ride_generated", attachmentLog(pdfAttachment, startedAt));

    const totalAttachmentSize = xmlAttachment.size + pdfAttachment.size;
    assertAttachmentSize(totalAttachmentSize, limits.maxTotalAttachmentBytes, "conjunto de adjuntos");
    const message = buildMessage({ documentType, document, client, issuer, recipient });
    assertAttachmentSize(Buffer.byteLength(message.html, "utf8"), limits.maxHtmlBytes, "contenido HTML");

    const result = {
      recipient,
      subject: message.subject,
      html: message.html,
      text: message.text,
      attachments: [pdfAttachment, xmlAttachment],
      metadata: {
        documentType,
        documentId: operation.documentId,
        documentNumber: documentNumber(document, issuer),
        totalAttachmentSize,
        builtAt: new Date().toISOString()
      }
    };
    emit("email_build_validated", {
      durationMs: Date.now() - startedAt,
      totalAttachmentSize,
      attachments: result.attachments.map(logAttachmentMetadata)
    });
    return result;
  } catch (error) {
    const buildError = normalizeBuildError(error);
    emit("email_build_failed", {
      durationMs: Date.now() - startedAt,
      errorCode: buildError.code,
      retryable: buildError.retryable
    });
    throw buildError;
  }
}

async function buildDocumentRide(operation, options = {}) {
  const limits = options.limits || config.emailBuildLimits;
  const documentType = normalizeDocumentType(operation.documentType);
  const snapshot = operation.payload?.authorizationSnapshot || {};
  const document = snapshot.document || {};
  const issuer = snapshot.issuer || {};
  const tenantLogo = resolveTenantLogo(operation.companyId);
  let pdf;
  try {
    pdf = await buildRidePdf({
      documentType,
      document,
      client: snapshot.client || {},
      issuer: tenantLogo ? { ...issuer, logoPath: tenantLogo.filePath } : issuer,
      sourceDocument: snapshot.sourceDocument || null
    });
  } catch (error) {
    if (error?.code === "RIDE_DATA_INCOMPLETE") throw error;
    throw new EmailBuildError("RIDE_GENERATION_FAILED", "No se pudo generar el RIDE PDF.", true);
  }
  assertAttachmentSize(pdf.length, limits.maxPdfBytes, "RIDE PDF");
  assertPdf(pdf);
  return attachment(rideFilename(documentType, document), "application/pdf", pdf);
}

function resolveTenantLogo(companyId) {
  try {
    return companyId ? getTenantLogo(companyId) : null;
  } catch {
    return null;
  }
}

function buildXmlAttachment(documentType, document, limits) {
  const xml = String(document.authorizedXml || "").trim();
  if (!xml) {
    throw new EmailBuildError(
      "AUTHORIZED_XML_MISSING",
      "El snapshot durable no contiene el XML autorizado.",
      false
    );
  }
  const content = Buffer.from(xml, "utf8");
  assertAttachmentSize(content.length, limits.maxXmlBytes, "XML autorizado");

  const parseErrors = [];
  const parsed = new DOMParser({
    errorHandler: {
      warning: (message) => parseErrors.push(message),
      error: (message) => parseErrors.push(message),
      fatalError: (message) => parseErrors.push(message)
    }
  }).parseFromString(xml, "application/xml");
  if (parseErrors.length || !parsed?.documentElement || !parsed.documentElement.nodeName) {
    throw new EmailBuildError("AUTHORIZED_XML_INVALID", "El XML autorizado no tiene una estructura XML valida.");
  }
  const accessKey = String(document.accessKey || "").trim();
  if (accessKey && !xml.includes(accessKey)) {
    throw new EmailBuildError("ACCESS_KEY_MISMATCH", "El XML autorizado no corresponde a la clave de acceso esperada.");
  }
  const expectedCode = documentType === "nota_credito" ? "04" : "01";
  const codeNodes = parsed.getElementsByTagName("codDoc");
  if (codeNodes.length && String(codeNodes.item(0)?.textContent || "").trim() !== expectedCode) {
    throw new EmailBuildError("AUTHORIZED_XML_INVALID", "El tipo tributario del XML no corresponde al documento.");
  }
  return attachment(xmlFilename(documentType, document), "application/xml", content);
}

function buildMessage({ documentType, document, client, issuer, recipient }) {
  const typeLabel = documentType === "nota_credito" ? "Nota de crédito" : "Factura";
  const number = documentNumber(document, issuer);
  const company = cleanText(issuer.tradeName || issuer.businessName);
  const customer = cleanText(client.name);
  const subject = `${typeLabel} ${number} - ${company}`;
  const values = {
    company: escapeHtml(company),
    type: escapeHtml(typeLabel),
    number: escapeHtml(number),
    date: escapeHtml(formatDate(document.createdAt)),
    customer: escapeHtml(customer),
    total: escapeHtml(money(document.total)),
    accessKey: escapeHtml(document.accessKey)
  };
  const html = `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#172033">
  <h2>${values.company}</h2>
  <p>Estimado/a ${values.customer}:</p>
  <p>Se ha preparado su ${values.type.toLowerCase()} electrónica autorizada.</p>
  <table>
    <tr><td><strong>Documento:</strong></td><td>${values.type} ${values.number}</td></tr>
    <tr><td><strong>Fecha de emisión:</strong></td><td>${values.date}</td></tr>
    <tr><td><strong>Total:</strong></td><td>$${values.total}</td></tr>
    <tr><td><strong>Clave de acceso:</strong></td><td>${values.accessKey}</td></tr>
  </table>
  <p>Se adjuntan el XML autorizado y el RIDE en formato PDF.</p>
  <p style="color:#64748b">Este es un correo automático. No confirma entrega ni lectura por el destinatario.</p>
</body></html>`;
  const text = [
    company,
    `Estimado/a ${customer}:`,
    `Se ha preparado su ${typeLabel.toLowerCase()} electrónica autorizada.`,
    `Documento: ${typeLabel} ${number}`,
    `Fecha de emisión: ${formatDate(document.createdAt)}`,
    `Total: $${money(document.total)}`,
    `Clave de acceso: ${cleanText(document.accessKey)}`,
    "Se adjuntan el XML autorizado y el RIDE en formato PDF.",
    "Este es un correo automático. No confirma entrega ni lectura por el destinatario."
  ].join("\n");
  return { recipient, subject, html, text };
}

function normalizeRecipient(value) {
  const raw = String(value || "");
  if (!raw.trim()) throw new EmailBuildError("RECIPIENT_MISSING", "El destinatario no tiene correo.");
  if (/[\r\n]/.test(raw) || /%0a|%0d/i.test(raw)) {
    throw new EmailBuildError("RECIPIENT_HEADER_INJECTION", "El correo contiene caracteres de encabezado no permitidos.");
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized.includes(",") || normalized.includes(";") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new EmailBuildError("RECIPIENT_INVALID", "El correo del destinatario no es valido.");
  }
  return normalized;
}

function normalizeDocumentType(value) {
  if (value === "factura" || value === "nota_credito") return value;
  throw new EmailBuildError("DOCUMENT_TYPE_UNSUPPORTED", "El tipo documental no esta soportado por la cola de correo.");
}

function attachment(filename, contentType, content) {
  return {
    filename,
    contentType,
    content,
    size: content.length,
    sha256: sha256(content)
  };
}

function safeAttachmentMetadata(value) {
  return {
    filename: value.filename,
    contentType: value.contentType,
    size: value.size,
    sha256: value.sha256
  };
}

function attachmentLog(value, startedAt) {
  return {
    durationMs: Date.now() - startedAt,
    ...logAttachmentMetadata(value)
  };
}

function logAttachmentMetadata(value) {
  return {
    filename: value.filename,
    contentType: value.contentType,
    size: value.size,
    sha256: value.sha256.slice(0, 12)
  };
}

function assertPdf(value) {
  if (!Buffer.isBuffer(value) || value.length === 0 || value.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new EmailBuildError("RIDE_GENERATION_FAILED", "El RIDE generado no es un PDF valido.", true);
  }
}

function assertAttachmentSize(size, maximum, label) {
  if (size > maximum) {
    throw new EmailBuildError("ATTACHMENT_TOO_LARGE", `El ${label} supera el limite permitido.`);
  }
}

function simulationResult(build) {
  return {
    valid: true,
    retryable: false,
    resultCode: "EMAIL_BUILD_VALIDATED",
    recipientMasked: maskEmail(build.recipient),
    subject: build.subject,
    attachments: build.attachments.map(safeAttachmentMetadata),
    totalAttachmentSize: build.metadata.totalAttachmentSize
  };
}

function normalizeBuildError(error) {
  if (error instanceof EmailBuildError) return error;
  if (error?.code === "RIDE_DATA_INCOMPLETE") {
    return new EmailBuildError("RIDE_DATA_INCOMPLETE", error.message, false);
  }
  return new EmailBuildError("TECHNICAL_TEMPORARY_ERROR", "Ocurrio un error tecnico al construir el correo.", true);
}

function xmlFilename(documentType, document) {
  return `${documentType === "nota_credito" ? "NOTA-CREDITO" : "FACTURA"}-${safeFilename(document.accessKey || document.id)}.xml`;
}

function rideFilename(documentType, document) {
  return `RIDE-${documentType === "nota_credito" ? "NOTA-CREDITO" : "FACTURA"}-${safeFilename(document.accessKey || document.id)}.pdf`;
}

function documentNumber(document, issuer) {
  return [
    document.establishment || issuer.establishment,
    document.emissionPoint || issuer.emissionPoint,
    document.sequence
  ].filter(Boolean).join("-");
}

function safeFilename(value) {
  return String(value || "documento").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

function cleanText(value) {
  return String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return cleanText(value);
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function money(value) {
  return Number(value || 0).toFixed(2);
}

function maskEmail(value) {
  const [name, domain] = String(value || "").split("@");
  if (!name || !domain) return "";
  return `${name.slice(0, 1)}***@${domain}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

module.exports = {
  EmailBuildError,
  buildDocumentEmail,
  buildDocumentRide,
  buildMessage,
  buildXmlAttachment,
  maskEmail,
  normalizeRecipient,
  safeAttachmentMetadata,
  sha256,
  simulationResult
};
