const crypto = require("node:crypto");
const os = require("node:os");
const config = require("./config");
const { buildDocumentEmail, EmailBuildError, simulationResult } = require("./document-email-builder");
const { createDocumentEmailQueueRepository } = require("./document-email-queue");
const { EmailSendError, deterministicMessageId, sendDocumentEmail } = require("./document-email-sender");

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
  const buildEmail = options.buildEmail || buildDocumentEmail;
  const sendEmail = options.sendEmail || sendDocumentEmail;
  let stopped = true;
  let timer = null;
  let activeCycle = null;

  async function processOperation(operation) {
    try {
      const built = await buildEmail(operation, {
        onEvent(event, details) {
          queueLog(event, operation, workerId, details);
        }
      });
      if (config.automaticAuthorizationEmailMode === "send") {
        await processSend(operation, built);
        return;
      }
      const simulation = simulationResult(built);
      await repository.completeSimulation(operation, workerId, simulation);
      queueLog("email_queue_simulated", operation, workerId, { resultCode: simulation.resultCode });
    } catch (error) {
      if (error instanceof EmailBuildError) {
        const result = {
          valid: false,
          retryable: error.retryable,
          resultCode: "EMAIL_BUILD_FAILED",
          errorCode: error.code,
          errorMessage: error.message
        };
        if (config.automaticAuthorizationEmailMode === "send") {
          await repository.failSend(operation, workerId, {
            code: error.code,
            message: error.message,
            retryable: error.retryable
          });
        } else {
          await repository.completeSimulation(operation, workerId, result);
        }
        queueLog("email_queue_failed", operation, workerId, { errorCode: error.code, retryable: error.retryable });
        if (error.retryable) queueLog("email_queue_requeued", operation, workerId, { retryable: true });
        return;
      }
      if (config.automaticAuthorizationEmailMode === "send") {
        queueLog("email_send_persistence_uncertain", operation, workerId, {
          errorCode: "SMTP_ACCEPTED_PERSISTENCE_UNCERTAIN",
          stage: "persistence"
        });
        return;
      }
      const failed = await repository.failTemporary(operation, workerId, error);
      queueLog("email_queue_failed", operation, workerId, { errorCode: "TECHNICAL_TEMPORARY_ERROR" });
      if (failed && failed.attempts < failed.maxAttempts) {
        queueLog("email_queue_requeued", failed, workerId, { retryable: true });
      }
    }
  }

  async function processSend(operation, built) {
    const messageId = operation.smtpMessageId || deterministicMessageId(operation);
    const prepared = await repository.prepareSend(operation, workerId, messageId);
    if (!prepared) {
      queueLog("email_send_failed", operation, workerId, { errorCode: "COMPANY_SEND_NOT_ENABLED", stage: "prepare" });
      return;
    }
    queueLog("email_send_started", prepared, workerId, { messageId, stage: "transmit" });
    try {
      const smtp = await sendEmail({ operation: prepared, built, messageId });
      try {
        const accepted = await repository.completeAccepted(prepared, workerId, smtp);
        if (!accepted) throw new Error("La aceptacion SMTP no pudo persistirse.");
        queueLog("email_send_accepted", accepted, workerId, {
          messageId,
          durationMs: smtp.elapsedMs,
          stage: "response"
        });
      } catch {
        queueLog("email_send_persistence_uncertain", prepared, workerId, {
          errorCode: "SMTP_ACCEPTED_PERSISTENCE_UNCERTAIN",
          messageId,
          durationMs: smtp.elapsedMs,
          stage: "persistence"
        });
        await repository.markUncertain(
          prepared,
          workerId,
          "SMTP_ACCEPTED_PERSISTENCE_UNCERTAIN",
          "SMTP acepto el mensaje, pero no fue posible persistir la aceptacion."
        );
      }
    } catch (error) {
      const sendError = error instanceof EmailSendError
        ? error
        : new EmailSendError("SMTP_CONNECTION_FAILED", "Fallo tecnico del transporte SMTP.", { retryable: true });
      if (sendError.uncertain) {
        await repository.markUncertain(prepared, workerId, sendError.code, sendError.message);
        queueLog("email_send_uncertain", prepared, workerId, {
          errorCode: sendError.code, smtpCode: sendError.smtpCode, messageId, stage: sendError.stage
        });
        return;
      }
      const failed = await repository.failSend(prepared, workerId, sendError);
      queueLog(sendError.code === "SMTP_RECIPIENT_REJECTED" ? "email_send_rejected" : "email_send_failed", prepared, workerId, {
        errorCode: sendError.code, smtpCode: sendError.smtpCode, messageId, stage: sendError.stage
      });
      if (failed?.retryable) {
        queueLog("email_send_retry_scheduled", failed, workerId, { errorCode: sendError.code, messageId });
      }
    }
  }

  async function cycle() {
    if (stopped || activeCycle) return activeCycle;
    activeCycle = (async () => {
      const blocked = await repository.markBlockedSendOperations?.();
      blocked?.forEach((operation) => {
        queueLog("email_send_failed", operation, workerId, {
          errorCode: operation.lastErrorCode || "COMPANY_SEND_NOT_ENABLED",
          stage: "eligibility"
        });
      });
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
