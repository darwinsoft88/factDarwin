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

test("el modo send permanece bloqueado en la Fase 2", () => {
  assert.equal(config.resolveAutomaticEmailMode("off"), "off");
  assert.equal(config.resolveAutomaticEmailMode("simulate"), "simulate");
  assert.equal(config.resolveAutomaticEmailMode("send"), "off");
  assert.equal(config.resolveAutomaticEmailMode("SEND"), "off");
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
    schedule() {
      scheduled = true;
      return 1;
    },
    cancelSchedule() {}
  });

  worker.start();
  await new Promise((resolve) => setImmediate(resolve));
  await worker.stop();

  assert.equal(complete, true);
  assert.equal(closed, true);
  assert.equal(scheduled, false);
});
