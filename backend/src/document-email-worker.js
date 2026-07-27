const crypto = require("node:crypto");
const os = require("node:os");
const config = require("./config");
const { createDocumentEmailQueueRepository } = require("./document-email-queue");

const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_POLL_MS = 45 * 1000;

function createWorkerId() {
  return `${os.hostname()}:${process.pid}:${crypto.randomUUID()}`;
}

function maskEmail(value) {
  const [name, domain] = String(value || "").split("@");
  if (!name || !domain) return "";
  return `${name.slice(0, Math.min(2, name.length))}***@${domain}`;
}

function queueLog(event, operation, workerId, details = {}) {
  console.log(JSON.stringify({
    event,
    companyId: operation.companyId,
    documentType: operation.documentType,
    documentId: operation.documentId,
    operationId: operation.id,
    attempt: operation.attempts,
    workerId,
    recipient: maskEmail(operation.recipientEmail),
    ...details
  }));
}

function validateSimulation(operation) {
  const snapshot = operation.payload?.authorizationSnapshot || {};
  const document = snapshot.document || {};
  const issuer = snapshot.issuer || {};
  const recipient = String(operation.recipientEmail || operation.payload?.delivery?.recipientEmail || "").trim();

  if (!recipient) return { valid: false, errorCode: "RECIPIENT_MISSING", errorMessage: "El destinatario no tiene correo." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return { valid: false, errorCode: "RECIPIENT_INVALID", errorMessage: "El correo del destinatario no es valido." };
  }
  if (!String(document.authorizedXml || "").trim()) {
    return { valid: false, errorCode: "AUTHORIZED_XML_MISSING", errorMessage: "No esta disponible el XML autorizado." };
  }
  if (!issuer.ruc || !issuer.businessName || !issuer.address) {
    return { valid: false, errorCode: "ISSUER_DATA_INCOMPLETE", errorMessage: "Los datos del emisor estan incompletos." };
  }
  if (!Array.isArray(document.items) || document.items.length === 0) {
    return { valid: false, errorCode: "DOCUMENT_INCOMPLETE", errorMessage: "El documento no contiene el detalle requerido." };
  }
  return { valid: true, resultCode: "SIMULATION_VALIDATED", message: "Operacion validada en modo simulacion. No se contacto a SMTP." };
}

function createDocumentEmailWorker(options = {}) {
  const repository = options.repository || createDocumentEmailQueueRepository({
    connectionString: options.connectionString || config.databaseUrl
  });
  const workerId = options.workerId || createWorkerId();
  const batchSize = Math.max(1, Number(options.batchSize || DEFAULT_BATCH_SIZE));
  const pollMs = Math.max(1000, Number(options.pollMs || DEFAULT_POLL_MS));
  const schedule = options.schedule || ((callback, delay) => setTimeout(callback, delay));
  const cancelSchedule = options.cancelSchedule || clearTimeout;
  let stopped = true;
  let timer = null;
  let activeCycle = null;

  async function processOperation(operation) {
    try {
      const simulation = validateSimulation(operation);
      await repository.completeSimulation(operation, workerId, simulation);
      queueLog(simulation.valid ? "email_queue_simulated" : "email_queue_failed", operation, workerId, simulation.valid
        ? { resultCode: simulation.resultCode }
        : { errorCode: simulation.errorCode });
    } catch (error) {
      const failed = await repository.failTemporary(operation, workerId, error);
      queueLog("email_queue_failed", operation, workerId, { errorCode: "TECHNICAL_TEMPORARY_ERROR" });
      if (failed && failed.attempts < failed.maxAttempts) {
        queueLog("email_queue_requeued", failed, workerId, { retryable: true });
      }
    }
  }

  async function cycle() {
    if (stopped || activeCycle) return activeCycle;
    activeCycle = (async () => {
      const recovered = await repository.recoverExpiredLeases(workerId);
      recovered.forEach((operation) => {
        queueLog("email_queue_lease_recovered", operation, workerId, { errorCode: "PROCESSING_LEASE_EXPIRED" });
        queueLog("email_queue_requeued", operation, workerId, { retryable: operation.attempts < operation.maxAttempts });
      });
      const operations = await repository.claim(workerId, batchSize);
      operations.forEach((operation) => queueLog("email_queue_claimed", operation, workerId));
      for (const operation of operations) {
        await processOperation(operation);
      }
    })();
    try {
      await activeCycle;
    } finally {
      activeCycle = null;
      if (!stopped) timer = schedule(triggerCycle, pollMs);
    }
  }

  function triggerCycle() {
    void cycle().catch((error) => {
      console.error(JSON.stringify({
        event: "email_queue_failed",
        errorCode: "TECHNICAL_TEMPORARY_ERROR",
        workerId,
        message: String(error?.message || error || "Error tecnico temporal del trabajador.")
      }));
    });
  }

  function start() {
    if (!stopped) return;
    stopped = false;
    triggerCycle();
  }

  function wake() {
    if (stopped || activeCycle) return;
    if (timer) {
      cancelSchedule(timer);
      timer = null;
    }
    triggerCycle();
  }

  async function stop() {
    stopped = true;
    if (timer) {
      cancelSchedule(timer);
      timer = null;
    }
    if (activeCycle) await activeCycle;
    await repository.close();
  }

  return { cycle, start, stop, wake, workerId };
}

module.exports = {
  DEFAULT_BATCH_SIZE,
  DEFAULT_POLL_MS,
  createDocumentEmailWorker,
  maskEmail,
  validateSimulation
};
