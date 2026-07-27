const { Pool } = require("pg");
const config = require("./config");

const LEASE_MS = 10 * 60 * 1000;
const RETRY_DELAYS_MS = [60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000, 60 * 60 * 1000, 6 * 60 * 60 * 1000];

function retryDelayMs(attempts) {
  const index = Math.max(0, Math.min(RETRY_DELAYS_MS.length - 1, Number(attempts || 1) - 1));
  return RETRY_DELAYS_MS[index];
}

function nextAttemptAt(now, attempts) {
  return new Date(new Date(now).getTime() + retryDelayMs(attempts)).toISOString();
}

function returningColumns(alias = "document_email_operations") {
  return `${alias}.id, ${alias}.company_id AS "companyId", ${alias}.document_type AS "documentType",
    ${alias}.document_id AS "documentId", ${alias}.origin, ${alias}.status,
    ${alias}.recipient_email AS "recipientEmail", ${alias}.payload_json AS payload,
    ${alias}.attempts, ${alias}.max_attempts AS "maxAttempts",
    ${alias}.locked_at AS "lockedAt", ${alias}.locked_by AS "lockedBy",
    ${alias}.smtp_message_id AS "smtpMessageId", ${alias}.send_started_at AS "sendStartedAt",
    ${alias}.last_error_code AS "lastErrorCode"`;
}

function mapOperation(row) {
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.companyId,
    documentType: row.documentType,
    documentId: row.documentId,
    origin: row.origin,
    status: row.status,
    recipientEmail: row.recipientEmail,
    payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
    attempts: Number(row.attempts || 0),
    maxAttempts: Number(row.maxAttempts || 0),
    lockedAt: row.lockedAt ? new Date(row.lockedAt).toISOString() : null,
    lockedBy: row.lockedBy,
    smtpMessageId: row.smtpMessageId || null,
    sendStartedAt: row.sendStartedAt ? new Date(row.sendStartedAt).toISOString() : null,
    lastErrorCode: row.lastErrorCode || null
  };
}

function createDocumentEmailQueueRepository(options = {}) {
  const pool = options.pool || new Pool({
    connectionString: options.connectionString || config.databaseUrl,
    ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined
  });
  const ownsPool = !options.pool;

  async function claim(workerId, batchSize, now = new Date().toISOString()) {
    const mode = config.automaticAuthorizationEmailMode;
    if (!["simulate", "send"].includes(mode)) return [];
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `WITH candidates AS (
           SELECT operation.id
           FROM document_email_operations operation
           LEFT JOIN company_feature_flags simulation_flag
             ON simulation_flag.company_id = operation.company_id
            AND simulation_flag.feature = 'automatic_authorization_email'
           LEFT JOIN company_feature_flags send_flag
             ON send_flag.company_id = operation.company_id
            AND send_flag.feature = 'automatic_authorized_document_email_send_enabled'
           LEFT JOIN company_feature_flags legacy_flag
             ON legacy_flag.company_id = operation.company_id
            AND legacy_flag.feature = 'legacy_automatic_credit_note_email'
           WHERE operation.simulated_at IS NULL
             AND operation.retryable = TRUE
             AND operation.attempts < operation.max_attempts
             AND operation.next_attempt_at <= $1
             AND operation.status IN ('pending', 'failed')
             AND (
               ($4 = 'simulate' AND COALESCE(simulation_flag.mode, 'simulate') = 'simulate')
               OR ($4 = 'send' AND send_flag.mode = 'send' AND legacy_flag.mode = 'off')
             )
           ORDER BY operation.next_attempt_at, operation.created_at
           FOR UPDATE OF operation SKIP LOCKED
           LIMIT $2
         )
         UPDATE document_email_operations operation
         SET status = 'processing',
             attempts = operation.attempts + 1,
             send_started_at = NULL,
             locked_at = $1,
             locked_by = $3,
             updated_at = $1
         FROM candidates
         WHERE operation.id = candidates.id
         RETURNING ${returningColumns("operation")}`,
        [now, Math.max(1, Number(batchSize || 1)), workerId, mode]
      );
      await client.query("COMMIT");
      return result.rows.map(mapOperation);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function markBlockedSendOperations(now = new Date().toISOString()) {
    if (config.automaticAuthorizationEmailMode !== "send") return [];
    const result = await pool.query(
      `UPDATE document_email_operations operation
       SET last_error_code = CASE
             WHEN NOT EXISTS (
               SELECT 1 FROM company_feature_flags send_flag
               WHERE send_flag.company_id = operation.company_id
                 AND send_flag.feature = 'automatic_authorized_document_email_send_enabled'
                 AND send_flag.mode = 'send'
             )
               THEN 'COMPANY_SEND_NOT_ENABLED'
             WHEN NOT EXISTS (
               SELECT 1 FROM company_feature_flags legacy_flag
               WHERE legacy_flag.company_id = operation.company_id
                 AND legacy_flag.feature = 'legacy_automatic_credit_note_email'
                 AND legacy_flag.mode = 'off'
             )
               THEN 'LEGACY_AUTOMATIC_SEND_CONFLICT'
             ELSE 'COMPANY_SEND_NOT_ENABLED'
           END,
           last_error_message = CASE
             WHEN NOT EXISTS (
               SELECT 1 FROM company_feature_flags send_flag
               WHERE send_flag.company_id = operation.company_id
                 AND send_flag.feature = 'automatic_authorized_document_email_send_enabled'
                 AND send_flag.mode = 'send'
             )
               THEN 'La empresa no esta habilitada para envio automatico real.'
             WHEN NOT EXISTS (
               SELECT 1 FROM company_feature_flags legacy_flag
               WHERE legacy_flag.company_id = operation.company_id
                 AND legacy_flag.feature = 'legacy_automatic_credit_note_email'
                 AND legacy_flag.mode = 'off'
             )
               THEN 'No existe confirmacion durable de que el envio automatico legacy este apagado.'
             ELSE 'La empresa no esta habilitada para envio automatico real.'
           END,
           updated_at = $1
       WHERE operation.status IN ('pending', 'failed')
         AND operation.retryable = TRUE
         AND operation.accepted_at IS NULL
         AND (
           NOT EXISTS (
             SELECT 1 FROM company_feature_flags send_flag
             WHERE send_flag.company_id = operation.company_id
               AND send_flag.feature = 'automatic_authorized_document_email_send_enabled'
               AND send_flag.mode = 'send'
           )
           OR NOT EXISTS (
             SELECT 1 FROM company_feature_flags legacy_flag
             WHERE legacy_flag.company_id = operation.company_id
               AND legacy_flag.feature = 'legacy_automatic_credit_note_email'
               AND legacy_flag.mode = 'off'
           )
         )
         AND operation.last_error_code IS DISTINCT FROM CASE
           WHEN NOT EXISTS (
             SELECT 1 FROM company_feature_flags send_flag
             WHERE send_flag.company_id = operation.company_id
               AND send_flag.feature = 'automatic_authorized_document_email_send_enabled'
               AND send_flag.mode = 'send'
           ) THEN 'COMPANY_SEND_NOT_ENABLED'
           ELSE 'LEGACY_AUTOMATIC_SEND_CONFLICT'
         END
       RETURNING ${returningColumns("operation")}`,
      [now]
    );
    return result.rows.map(mapOperation);
  }

  async function prepareSend(operation, workerId, messageId, now = new Date().toISOString()) {
    const result = await pool.query(
      `UPDATE document_email_operations operation
       SET smtp_message_id = COALESCE(operation.smtp_message_id, $1),
           send_started_at = $2,
           sent_worker_id = $3,
           updated_at = $2
       FROM company_feature_flags send_flag, company_feature_flags legacy_flag
       WHERE operation.id = $4
         AND operation.status = 'processing'
         AND operation.locked_by = $3
         AND operation.accepted_at IS NULL
         AND send_flag.company_id = operation.company_id
         AND send_flag.feature = 'automatic_authorized_document_email_send_enabled'
         AND send_flag.mode = 'send'
         AND legacy_flag.company_id = operation.company_id
         AND legacy_flag.feature = 'legacy_automatic_credit_note_email'
         AND legacy_flag.mode = 'off'
       RETURNING ${returningColumns("operation")}`,
      [messageId, now, workerId, operation.id]
    );
    return mapOperation(result.rows[0]);
  }

  async function completeAccepted(operation, workerId, smtp, now = new Date().toISOString()) {
    const result = await pool.query(
      `UPDATE document_email_operations
       SET status = 'accepted', retryable = FALSE, accepted_at = $1,
           send_completed_at = $1, smtp_response = $2,
           smtp_accepted_recipients = $3::jsonb, smtp_rejected_recipients = $4::jsonb,
           accepted_recipients = $3::jsonb, rejected_recipients = $4::jsonb,
           smtp_envelope = $5::jsonb, smtp_elapsed_ms = $6, sent_worker_id = $7,
           last_error_code = NULL, last_error_message = NULL,
           locked_at = NULL, locked_by = NULL, updated_at = $1
       WHERE id = $8 AND status = 'processing' AND locked_by = $7
         AND smtp_message_id = $9 AND accepted_at IS NULL
       RETURNING ${returningColumns()}`,
      [now, smtp.response, JSON.stringify(smtp.accepted), JSON.stringify(smtp.rejected),
        JSON.stringify(smtp.envelope), smtp.elapsedMs, workerId, operation.id, smtp.messageId]
    );
    return mapOperation(result.rows[0]);
  }

  async function markUncertain(operation, workerId, code, message, now = new Date().toISOString()) {
    const result = await pool.query(
      `UPDATE document_email_operations
       SET status = 'uncertain', retryable = FALSE, failed_at = $1,
           send_completed_at = $1, last_error_code = $2, last_error_message = $3,
           sent_worker_id = $4, locked_at = NULL, locked_by = NULL, updated_at = $1
       WHERE id = $5 AND status = 'processing'
         AND (locked_by = $4 OR locked_by IS NULL)
       RETURNING ${returningColumns()}`,
      [now, code, String(message || "").slice(0, 500), workerId, operation.id]
    );
    return mapOperation(result.rows[0]);
  }

  async function failSend(operation, workerId, error, now = new Date().toISOString()) {
    const retryable = Boolean(error.retryable) && operation.attempts < operation.maxAttempts;
    const result = await pool.query(
      `UPDATE document_email_operations
       SET status = 'failed', retryable = $1, failed_at = $2,
           send_started_at = NULL,
           next_attempt_at = CASE WHEN $1 THEN $3 ELSE next_attempt_at END,
           last_error_code = $4, last_error_message = $5,
           locked_at = NULL, locked_by = NULL, updated_at = $2
       WHERE id = $6 AND status = 'processing' AND locked_by = $7
       RETURNING ${returningColumns()}`,
      [retryable, now, nextAttemptAt(now, operation.attempts), error.code,
        String(error.message || "").slice(0, 500), operation.id, workerId]
    );
    return mapOperation(result.rows[0]);
  }

  async function completeSimulation(operation, workerId, result, now = new Date().toISOString()) {
    const retryable = result.valid ? true : Boolean(result.retryable);
    const simulatedAt = result.valid || !retryable ? now : null;
    const updated = await pool.query(
      `UPDATE document_email_operations
       SET status = $1,
           retryable = $2,
           simulated_at = $3,
           simulation_result = $4::jsonb,
           simulation_worker_id = $5,
           failed_at = $6,
           last_error_code = $7,
           last_error_message = $8,
           next_attempt_at = CASE WHEN $1 = 'failed' AND $2 = TRUE THEN $9 ELSE next_attempt_at END,
           locked_at = NULL,
           locked_by = NULL,
           updated_at = $10
       WHERE id = $11 AND status = 'processing' AND locked_by = $5
       RETURNING ${returningColumns()}`,
      [
        result.valid ? "pending" : "failed",
        retryable,
        simulatedAt,
        JSON.stringify(result),
        workerId,
        result.valid ? null : now,
        result.errorCode || null,
        result.errorMessage || null,
        nextAttemptAt(now, operation.attempts),
        now,
        operation.id
      ]
    );
    return mapOperation(updated.rows[0]);
  }

  async function failTemporary(operation, workerId, error, now = new Date().toISOString()) {
    const retryable = operation.attempts < operation.maxAttempts;
    const updated = await pool.query(
      `UPDATE document_email_operations
       SET status = 'failed',
           retryable = $1,
           next_attempt_at = $2,
           failed_at = $3,
           last_error_code = 'TECHNICAL_TEMPORARY_ERROR',
           last_error_message = $4,
           locked_at = NULL,
           locked_by = NULL,
           updated_at = $3
       WHERE id = $5 AND status = 'processing' AND locked_by = $6
       RETURNING ${returningColumns()}`,
      [retryable, nextAttemptAt(now, operation.attempts), now, String(error?.message || error || "Error tecnico temporal."), operation.id, workerId]
    );
    return mapOperation(updated.rows[0]);
  }

  async function recoverExpiredLeases(workerId, now = new Date().toISOString()) {
    if (!["simulate", "send"].includes(config.automaticAuthorizationEmailMode)) return [];
    const expiredBefore = new Date(new Date(now).getTime() - LEASE_MS).toISOString();
    const result = await pool.query(
      `UPDATE document_email_operations
       SET status = CASE WHEN send_started_at IS NOT NULL THEN 'uncertain' ELSE 'failed' END,
           next_attempt_at = CASE WHEN attempts < max_attempts THEN $1 ELSE next_attempt_at END,
           failed_at = $1,
           retryable = CASE WHEN send_started_at IS NOT NULL THEN FALSE ELSE attempts < max_attempts END,
           last_error_code = CASE WHEN send_started_at IS NOT NULL THEN 'SMTP_DELIVERY_OUTCOME_UNCERTAIN' ELSE 'PROCESSING_LEASE_EXPIRED' END,
           last_error_message = CASE WHEN send_started_at IS NOT NULL
             THEN 'El lease vencio despues de iniciar la transmision SMTP; requiere reconciliacion.'
             ELSE 'El trabajador anterior no completo la operacion antes de vencer el lease.' END,
           locked_at = NULL,
           locked_by = NULL,
           updated_at = $1
       WHERE status = 'processing'
         AND locked_at < $2
       RETURNING ${returningColumns()}`,
      [now, expiredBefore]
    );
    return result.rows.map((row) => ({ ...mapOperation(row), recoveredBy: workerId }));
  }

  async function close() {
    if (ownsPool) await pool.end();
  }

  return { claim, close, completeAccepted, completeSimulation, failSend, failTemporary, markBlockedSendOperations, markUncertain, prepareSend, recoverExpiredLeases };
}

module.exports = {
  LEASE_MS,
  RETRY_DELAYS_MS,
  createDocumentEmailQueueRepository,
  nextAttemptAt,
  retryDelayMs
};
