const assert = require("node:assert/strict");
const test = require("node:test");
const config = require("../config");
const { RETRY_DELAYS_MS, retryDelayMs } = require("../document-email-queue");
const { createDocumentEmailWorker, maskEmail, validateSimulation } = require("../document-email-worker");

function operation(overrides = {}) {
  return {
    id: "operation-1",
    companyId: "company-1",
    documentType: "factura",
    documentId: "document-1",
    origin: "automatic_authorization",
    status: "processing",
    recipientEmail: "cliente@example.com",
    attempts: 1,
    maxAttempts: 5,
    payload: {
      delivery: { recipientEmail: "cliente@example.com" },
      authorizationSnapshot: {
        document: { status: "AUTORIZADA", authorizedXml: "<autorizacion />", items: [{ id: "line-1" }] },
        issuer: { ruc: "1790012345001", businessName: "Empresa", address: "Quito" }
      }
    },
    ...overrides
  };
}

test("acepta los tres modos y conserva off ante valores invalidos", () => {
  assert.equal(config.resolveAutomaticEmailMode("off"), "off");
  assert.equal(config.resolveAutomaticEmailMode("simulate"), "simulate");
  assert.equal(config.resolveAutomaticEmailMode("send"), "send");
  assert.equal(config.resolveAutomaticEmailMode("SEND"), "send");
  assert.equal(config.resolveAutomaticEmailMode("otro"), "off");
});

test("la simulacion valida datos sin afirmar aceptacion SMTP", () => {
  const result = validateSimulation(operation());
  assert.equal(result.valid, true);
  assert.equal(result.resultCode, "SIMULATION_VALIDATED");
  assert.equal(Object.prototype.hasOwnProperty.call(result, "accepted"), false);
});

test("clasifica datos incompletos con codigos especificos", () => {
  assert.equal(validateSimulation(operation({
    recipientEmail: "",
    payload: { delivery: {}, authorizationSnapshot: operation().payload.authorizationSnapshot }
  })).errorCode, "RECIPIENT_MISSING");
  assert.equal(validateSimulation(operation({
    recipientEmail: "correo-invalido",
    payload: { delivery: { recipientEmail: "correo-invalido" }, authorizationSnapshot: operation().payload.authorizationSnapshot }
  })).errorCode, "RECIPIENT_INVALID");
  assert.equal(validateSimulation(operation({
    payload: { authorizationSnapshot: { document: { authorizedXml: "", items: [{}] }, issuer: { ruc: "1", businessName: "E", address: "Q" } } }
  })).errorCode, "AUTHORIZED_XML_MISSING");
  assert.equal(validateSimulation(operation({
    payload: { authorizationSnapshot: { document: { authorizedXml: "<xml />", items: [{}] }, issuer: {} } }
  })).errorCode, "ISSUER_DATA_INCOMPLETE");
  assert.equal(validateSimulation(operation({
    payload: { authorizationSnapshot: { document: { authorizedXml: "<xml />", items: [] }, issuer: { ruc: "1", businessName: "E", address: "Q" } } }
  })).errorCode, "DOCUMENT_INCOMPLETE");
});

test("aplica la politica de reintentos aprobada", () => {
  assert.deepEqual(RETRY_DELAYS_MS, [60000, 300000, 900000, 3600000, 21600000]);
  assert.equal(retryDelayMs(1), 60000);
  assert.equal(retryDelayMs(5), 21600000);
  assert.equal(retryDelayMs(20), 21600000);
});

test("los logs enmascaran el correo", () => {
  assert.equal(maskEmail("cliente@example.com"), "cl***@example.com");
  assert.equal(maskEmail(""), "");
});

test("la parada espera el lote activo y cierra el repositorio", async () => {
  const previousMode = config.automaticAuthorizationEmailMode;
  config.automaticAuthorizationEmailMode = "simulate";
  let complete = false;
  let closed = false;
  let scheduled = false;
  const repository = {
    async recoverExpiredLeases() {
      return [];
    },
    async claim() {
      return [operation()];
    },
    async completeSimulation() {
      await new Promise((resolve) => setImmediate(resolve));
      complete = true;
    },
    async failTemporary() {
      throw new Error("No esperado");
    },
    async close() {
      closed = true;
    }
  };
  const worker = createDocumentEmailWorker({
    repository,
    workerId: "worker-test",
    async buildEmail() {
      return {
        recipient: "cliente@example.com",
        subject: "Factura 001-001-000000001 - Empresa",
        html: "<p>Mensaje</p>",
        text: "Mensaje",
        attachments: [{
          filename: "RIDE-FACTURA-1.pdf",
          contentType: "application/pdf",
          content: Buffer.from("%PDF-1.4"),
          size: 8,
          sha256: "a".repeat(64)
        }],
        metadata: { totalAttachmentSize: 8 }
      };
    },
    schedule() {
      scheduled = true;
      return 1;
    },
    cancelSchedule() {}
  });

  try {
    worker.start();
    await new Promise((resolve) => setImmediate(resolve));
    await worker.stop();

    assert.equal(complete, true);
    assert.equal(closed, true);
    assert.equal(scheduled, false);
  } finally {
    config.automaticAuthorizationEmailMode = previousMode;
  }
});

test("send prepara una vez y persiste accepted", async () => {
  const previousMode = config.automaticAuthorizationEmailMode;
  config.automaticAuthorizationEmailMode = "send";
  let sends = 0;
  let accepted = 0;
  const repository = {
    markBlockedSendOperations: async () => [],
    recoverExpiredLeases: async () => [],
    claim: async () => [operation()],
    async prepareSend(value, workerId, messageId) {
      return { ...value, lockedBy: workerId, smtpMessageId: messageId, sendStartedAt: new Date().toISOString() };
    },
    async completeAccepted(value) {
      accepted += 1;
      return { ...value, status: "accepted" };
    },
    markUncertain: async () => { throw new Error("No esperado"); },
    failSend: async () => { throw new Error("No esperado"); },
    close: async () => undefined
  };
  const worker = createDocumentEmailWorker({
    repository,
    workerId: "worker-send",
    buildEmail: async () => ({
      recipient: "cliente@example.com", subject: "Factura", html: "<p>Factura</p>", text: "Factura",
      attachments: [], metadata: { totalAttachmentSize: 0 }
    }),
    sendEmail: async ({ messageId }) => {
      sends += 1;
      return { messageId, accepted: ["cliente@example.com"], rejected: [], response: "250 queued", envelope: {}, elapsedMs: 5 };
    }
  });
  try {
    worker.start();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(sends, 1);
    assert.equal(accepted, 1);
  } finally {
    config.automaticAuthorizationEmailMode = previousMode;
    await worker.stop();
  }
});

test("simulate nunca llama al sender", async () => {
  const previousMode = config.automaticAuthorizationEmailMode;
  config.automaticAuthorizationEmailMode = "simulate";
  let sends = 0;
  const repository = {
    markBlockedSendOperations: async () => [],
    recoverExpiredLeases: async () => [],
    claim: async () => [operation()],
    completeSimulation: async (value) => value,
    failTemporary: async () => undefined,
    close: async () => undefined
  };
  const worker = createDocumentEmailWorker({
    repository,
    buildEmail: async () => ({
      recipient: "cliente@example.com", subject: "Factura", html: "", text: "",
      attachments: [], metadata: { totalAttachmentSize: 0 }
    }),
    sendEmail: async () => { sends += 1; }
  });
  try {
    worker.start();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(sends, 0);
  } finally {
    config.automaticAuthorizationEmailMode = previousMode;
    await worker.stop();
  }
});

test("aceptacion SMTP con fallo PostgreSQL queda incierta y no se reintenta", async () => {
  const previousMode = config.automaticAuthorizationEmailMode;
  config.automaticAuthorizationEmailMode = "send";
  let uncertainCode = "";
  let retries = 0;
  const repository = {
    markBlockedSendOperations: async () => [],
    recoverExpiredLeases: async () => [],
    claim: async () => [operation()],
    prepareSend: async (value, workerId, messageId) => ({ ...value, lockedBy: workerId, smtpMessageId: messageId }),
    completeAccepted: async () => { throw new Error("postgres unavailable"); },
    markUncertain: async (_value, _worker, code) => { uncertainCode = code; return operation({ status: "uncertain" }); },
    failSend: async () => { retries += 1; },
    close: async () => undefined
  };
  const worker = createDocumentEmailWorker({
    repository,
    buildEmail: async () => ({
      recipient: "cliente@example.com", subject: "Factura", html: "", text: "",
      attachments: [], metadata: { totalAttachmentSize: 0 }
    }),
    sendEmail: async ({ messageId }) => ({
      messageId, accepted: ["cliente@example.com"], rejected: [], response: "250 queued", envelope: {}, elapsedMs: 2
    })
  });
  try {
    worker.start();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(uncertainCode, "SMTP_ACCEPTED_PERSISTENCE_UNCERTAIN");
    assert.equal(retries, 0);
  } finally {
    config.automaticAuthorizationEmailMode = previousMode;
    await worker.stop();
  }
});
