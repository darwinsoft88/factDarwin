const crypto = require("node:crypto");
const nodemailer = require("nodemailer");
const config = require("./config");

const MAX_SMTP_RESPONSE = 300;

class EmailSendError extends Error {
  constructor(code, message, { retryable = false, uncertain = false, smtpCode = "", stage = "connect" } = {}) {
    super(message);
    this.name = "EmailSendError";
    this.code = code;
    this.retryable = retryable;
    this.uncertain = uncertain;
    this.smtpCode = String(smtpCode || "");
    this.stage = stage;
  }
}

function deterministicMessageId(operation) {
  const digest = crypto.createHash("sha256")
    .update(`${operation.id}:${operation.companyId}:${operation.origin}`)
    .digest("hex");
  return `<document-email-${digest}@email.factudarwin.com>`;
}

function validateSmtpConfiguration(smtp = config.smtp) {
  const required = ["host", "port", "user", "pass", "from"];
  if (required.some((key) => !smtp[key])) {
    throw new EmailSendError("SMTP_CONFIGURATION_INVALID", "La configuracion SMTP del backend esta incompleta.");
  }
  if (!Number.isInteger(Number(smtp.port)) || Number(smtp.port) < 1 || Number(smtp.port) > 65535) {
    throw new EmailSendError("SMTP_CONFIGURATION_INVALID", "El puerto SMTP no es valido.");
  }
  for (const value of [smtp.from, smtp.user]) assertHeaderSafe(value);
  const fromAddress = extractAddress(smtp.from);
  if (!validEmail(fromAddress) || !fromAddress.split("@")[1]) {
    throw new EmailSendError("SMTP_CONFIGURATION_INVALID", "El remitente SMTP no contiene un dominio valido.");
  }
  return { ...smtp, fromAddress };
}

function assertHeaderSafe(value) {
  if (/[\r\n]/.test(String(value || ""))) {
    throw new EmailSendError("SMTP_CONFIGURATION_INVALID", "La configuracion SMTP contiene encabezados no permitidos.");
  }
}

function createTransport(smtp, factory = nodemailer.createTransport) {
  return factory({
    host: smtp.host,
    port: Number(smtp.port),
    secure: Boolean(smtp.secure),
    requireTLS: !smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
    tls: { rejectUnauthorized: true },
    connectionTimeout: smtp.connectionTimeoutMs,
    greetingTimeout: smtp.greetingTimeoutMs,
    socketTimeout: smtp.socketTimeoutMs
  });
}

async function sendDocumentEmail({ built, messageId, smtp = config.smtp, transportFactory }) {
  const checked = validateSmtpConfiguration(smtp);
  assertHeaderSafe(built.subject);
  const expected = normalizeAddress(built.recipient);
  const startedAt = Date.now();
  let stage = "connect";
  try {
    const transport = createTransport(checked, transportFactory);
    stage = "transmit";
    const info = await transport.sendMail({
      from: checked.from,
      to: expected,
      subject: built.subject,
      html: built.html,
      text: built.text,
      messageId,
      attachments: built.attachments.map(({ filename, contentType, content }) => ({ filename, contentType, content }))
    });
    stage = "response";
    const accepted = normalizeAddresses(info.accepted);
    const rejected = normalizeAddresses(info.rejected);
    if (!accepted.includes(expected) || rejected.includes(expected)) {
      throw new EmailSendError("SMTP_RECIPIENT_REJECTED", "El servidor SMTP rechazo al destinatario esperado.", {
        smtpCode: info.responseCode,
        stage: "response"
      });
    }
    return {
      messageId,
      accepted,
      rejected,
      response: sanitizeResponse(info.response),
      envelope: sanitizeEnvelope(info.envelope),
      elapsedMs: Date.now() - startedAt
    };
  } catch (error) {
    if (error instanceof EmailSendError) throw error;
    throw classifyTransportError(error, stage);
  }
}

function classifyTransportError(error, stage) {
  const responseCode = Number(error?.responseCode || 0);
  const code = String(error?.code || "");
  const command = String(error?.command || "").toUpperCase();
  const beforeData = ["CONN", "EHLO", "HELO", "STARTTLS", "AUTH", "MAIL", "RCPT"].some((value) => command.startsWith(value));
  const afterData = command === "DATA" || command === "." || stage === "response"
    || (stage !== "connect" && !beforeData && (code === "ETIMEDOUT" || code === "ECONNRESET"));
  if (afterData) return new EmailSendError("SMTP_DELIVERY_OUTCOME_UNCERTAIN", "No fue posible confirmar el resultado final del servidor SMTP.", { uncertain: true, smtpCode: responseCode || code, stage });
  if (code === "EAUTH" || responseCode === 535) return new EmailSendError("SMTP_AUTHENTICATION_FAILED", "El servidor SMTP rechazo las credenciales.", { smtpCode: responseCode, stage });
  if (code === "EDNS") return new EmailSendError("SMTP_DNS_FAILED", "No se pudo resolver el servidor SMTP.", { retryable: true, smtpCode: code, stage });
  if (responseCode === 552) return new EmailSendError("SMTP_MESSAGE_TOO_LARGE", "El servidor SMTP rechazo el tamano del mensaje.", { smtpCode: responseCode, stage });
  if (responseCode === 429 || responseCode === 421) return new EmailSendError(responseCode === 429 ? "SMTP_RATE_LIMITED" : "SMTP_SERVICE_UNAVAILABLE", "El servidor SMTP no esta disponible temporalmente.", { retryable: true, smtpCode: responseCode, stage });
  if (responseCode >= 400 && responseCode < 500) return new EmailSendError("SMTP_TEMPORARY_REJECTION", "El servidor SMTP rechazo temporalmente el mensaje.", { retryable: true, smtpCode: responseCode, stage });
  if (responseCode >= 500) return new EmailSendError("SMTP_RECIPIENT_REJECTED", "El servidor SMTP rechazo el mensaje.", { smtpCode: responseCode, stage });
  return new EmailSendError("SMTP_CONNECTION_FAILED", "No se pudo establecer la conexion SMTP.", { retryable: true, smtpCode: code, stage });
}

function sanitizeResponse(value) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\s<>]+@[^\s<>]+/g, "[correo]")
    .replace(/\b(?:AUTH|Bearer)\s+\S+/gi, "[credencial]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SMTP_RESPONSE);
}

function sanitizeEnvelope(value = {}) {
  return {
    fromDomain: extractAddress(value.from).split("@")[1] || "",
    toCount: normalizeAddresses(value.to).length
  };
}

function normalizeAddresses(value) {
  return (Array.isArray(value) ? value : []).map((item) => normalizeAddress(typeof item === "object" ? item.address : item)).filter(Boolean);
}

function normalizeAddress(value) {
  return extractAddress(value).toLowerCase();
}

function extractAddress(value) {
  const text = String(value || "").trim();
  const match = /<([^>]+)>/.exec(text);
  return (match ? match[1] : text).trim();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

module.exports = {
  EmailSendError,
  classifyTransportError,
  deterministicMessageId,
  sanitizeResponse,
  sendDocumentEmail,
  validateSmtpConfiguration
};
