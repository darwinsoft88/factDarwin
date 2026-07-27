const assert = require("node:assert/strict");
const test = require("node:test");
const {
  EmailSendError,
  classifyTransportError,
  deterministicMessageId,
  sanitizeResponse,
  sendDocumentEmail,
  validateSmtpConfiguration
} = require("../document-email-sender");

const smtp = {
  host: "127.0.0.1", port: 2525, secure: false,
  user: "mailer", pass: "secret", from: "FactuDarwin <mailer@example.test>",
  connectionTimeoutMs: 1000, greetingTimeoutMs: 1000, socketTimeoutMs: 1000
};
const operation = { id: "operation-1", companyId: "company-1", origin: "automatic_authorization" };
const built = {
  recipient: "cliente@example.test",
  subject: "Factura autorizada",
  html: "<p>Factura</p>",
  text: "Factura",
  attachments: [
    { filename: "RIDE.pdf", contentType: "application/pdf", content: Buffer.from("%PDF-1.4") },
    { filename: "FACTURA.xml", contentType: "application/xml", content: Buffer.from("<xml />") }
  ]
};

test("Message-ID es deterministico por operacion", () => {
  assert.equal(deterministicMessageId(operation), deterministicMessageId(operation));
  assert.notEqual(deterministicMessageId(operation), deterministicMessageId({ ...operation, id: "operation-2" }));
});

test("rechaza configuracion incompleta e inyeccion de cabeceras", () => {
  assert.throws(() => validateSmtpConfiguration({ ...smtp, pass: "" }), (error) => error.code === "SMTP_CONFIGURATION_INVALID");
  assert.throws(() => validateSmtpConfiguration({ ...smtp, from: "ok@example.test\r\nBcc: x@example.test" }), (error) => error.code === "SMTP_CONFIGURATION_INVALID");
});

test("acepta solo cuando SMTP acepta al destinatario esperado", async () => {
  let captured;
  const result = await sendDocumentEmail({
    operation, built, smtp, messageId: deterministicMessageId(operation),
    transportFactory(options) {
      assert.equal(options.tls.rejectUnauthorized, true);
      return { async sendMail(message) {
        captured = message;
        return {
          accepted: ["cliente@example.test"], rejected: [], response: "250 queued\r\nsecret removed",
          envelope: { from: "mailer@example.test", to: ["cliente@example.test"] }
        };
      } };
    }
  });
  assert.equal(result.messageId, deterministicMessageId(operation));
  assert.equal(captured.messageId, result.messageId);
  assert.equal(captured.attachments.length, 2);
  assert.deepEqual(result.envelope, { fromDomain: "example.test", toCount: 1 });
  assert(!result.response.includes("\n"));
});

test("rechazo explicito no produce aceptacion", async () => {
  await assert.rejects(sendDocumentEmail({
    operation, built, smtp, messageId: deterministicMessageId(operation),
    transportFactory: () => ({ sendMail: async () => ({
      accepted: [], rejected: ["cliente@example.test"], responseCode: 550
    }) })
  }), (error) => error instanceof EmailSendError && error.code === "SMTP_RECIPIENT_REJECTED");
});

test("diferencia timeout previo y posterior a transmision", () => {
  assert.equal(classifyTransportError({ code: "ECONNREFUSED" }, "connect").retryable, true);
  assert.equal(classifyTransportError({ code: "ETIMEDOUT", command: "CONN" }, "transmit").retryable, true);
  const ambiguous = classifyTransportError({ code: "ETIMEDOUT", command: "DATA" }, "transmit");
  assert.equal(ambiguous.uncertain, true);
  assert.equal(ambiguous.code, "SMTP_DELIVERY_OUTCOME_UNCERTAIN");
});

test("sanitiza y limita respuestas", () => {
  assert.equal(sanitizeResponse(`250 ok\r\n${"x".repeat(500)}`).length, 300);
});
