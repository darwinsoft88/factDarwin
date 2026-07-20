const nodemailer = require("nodemailer");
const config = require("./config");

async function sendInvoiceEmail({ to, subject, html, xml, pdfBase64 = "", documentType, documentNumber, senderName = "", replyTo = "" }) {
  const transporter = createTransporter();
  assertValidRecipient(to);
  const fileLabel = documentType === "nota_credito" ? "nota-credito" : "factura";
  const fileSuffix = documentNumber ? `-${sanitizeFilename(documentNumber)}` : "";

  const result = await sendAndValidate(transporter, {
    from: formatFrom(senderName),
    replyTo: validEmail(replyTo) ? replyTo : undefined,
    to,
    subject,
    html,
    attachments: [
      rideAttachment({ fileLabel, fileSuffix, html, pdfBase64 }),
      {
        filename: `${fileLabel}-autorizada${fileSuffix}.xml`,
        content: xml || "",
        contentType: "application/xml"
      }
    ].filter(Boolean)
  });

  return result;
}

async function sendTestEmail({ to, senderName = "", replyTo = "" }) {
  const transporter = createTransporter();
  assertValidRecipient(to);
  const result = await sendAndValidate(transporter, {
    from: formatFrom(senderName),
    replyTo: validEmail(replyTo) ? replyTo : undefined,
    to,
    subject: "Prueba de correo - Facturacion electronica",
    html: [
      "<p>Correo de prueba enviado correctamente.</p>",
      `<p>Empresa: <strong>${escapeHtml(senderName || "Facturacion electronica")}</strong></p>`,
      replyTo ? `<p>Responder a: ${escapeHtml(replyTo)}</p>` : ""
    ].join("")
  });

  return result;
}

async function sendPasswordResetEmail({ to, name = "", temporaryPassword = "", companyName = "" }) {
  const transporter = createTransporter();
  assertValidRecipient(to);
  const result = await sendAndValidate(transporter, {
    from: formatFrom(companyName || "FactuDarwin"),
    to,
    subject: "Recuperacion de contrasena - FactuDarwin",
    html: [
      `<p>Hola${name ? ` ${escapeHtml(name)}` : ""},</p>`,
      "<p>Se genero una clave temporal para ingresar a FactuDarwin.</p>",
      `<p><strong>Clave temporal:</strong> ${escapeHtml(temporaryPassword)}</p>`,
      "<p>Despues de ingresar, la app le pedira crear una nueva contrasena antes de continuar.</p>",
      "<p>Si usted no solicito este cambio, contacte al administrador inmediatamente.</p>"
    ].join("")
  });

  return result;
}

function createTransporter() {
  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass || !config.smtp.from) {
    const error = new Error("Falta configurar SMTP_HOST, SMTP_USER, SMTP_PASS y SMTP_FROM en backend/.env");
    error.statusCode = 400;
    throw error;
  }

  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass
    }
  });
}

async function sendAndValidate(transporter, message) {
  const info = await transporter.sendMail(message);
  const accepted = normalizeAddressList(info.accepted);
  const rejected = normalizeAddressList(info.rejected);

  if (!accepted.length) {
    const error = new Error(rejected.length ? `El proveedor de correo rechazo el destinatario: ${rejected.join(", ")}` : "El proveedor de correo no confirmo destinatarios aceptados.");
    error.statusCode = 502;
    error.smtp = summarizeSmtpInfo(info);
    throw error;
  }

  return {
    ok: true,
    messageId: info.messageId || "",
    accepted,
    rejected,
    response: String(info.response || "").slice(0, 300)
  };
}

function sanitizeFilename(value) {
  return String(value || "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
}

function rideAttachment({ fileLabel, fileSuffix, html, pdfBase64 }) {
  const cleanPdf = String(pdfBase64 || "").replace(/^data:application\/pdf;base64,/, "");
  if (cleanPdf) {
    return {
      filename: `ride-${fileLabel}${fileSuffix}.pdf`,
      content: Buffer.from(cleanPdf, "base64"),
      contentType: "application/pdf"
    };
  }
  return {
    filename: `ride-${fileLabel}${fileSuffix}.html`,
    content: html || "",
    contentType: "text/html"
  };
}

function formatFrom(senderName) {
  const address = extractEmail(config.smtp.from);
  const name = sanitizeHeader(senderName);
  if (!name || !address) return config.smtp.from;
  return `"${name.replace(/"/g, "'")}" <${address}>`;
}

function extractEmail(value) {
  const text = String(value || "").trim();
  const match = /<([^>]+)>/.exec(text);
  return match ? match[1].trim() : text;
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function assertValidRecipient(value) {
  if (!validEmail(value)) {
    const error = new Error("El correo del destinatario no es valido.");
    error.statusCode = 400;
    throw error;
  }
}

function normalizeAddressList(value) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function summarizeSmtpInfo(info = {}) {
  return {
    messageId: info.messageId || "",
    accepted: normalizeAddressList(info.accepted),
    rejected: normalizeAddressList(info.rejected),
    response: String(info.response || "").slice(0, 300)
  };
}

function sanitizeHeader(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim().slice(0, 120);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

module.exports = { sendInvoiceEmail, sendPasswordResetEmail, sendTestEmail };
