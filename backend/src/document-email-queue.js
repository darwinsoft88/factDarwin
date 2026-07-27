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
    ${alias}.locked_at AS "lockedAt", ${alias}.locked_by AS "lockedBy"`;
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
    lockedBy: row.lockedBy
  };
}

function createDocumentEmailQueueRepository(options = {}) {
  const pool = options.pool || new Pool({
    connectionString: options.connectionString || config.databaseUrl,
    ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined
  });
  const ownsPool = !options.pool;

  async function claim(workerId, batchSize, now = new Date().toISOString()) {
    if (config.automaticAuthorizationEmailMode !== "simulate") return [];
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `WITH candidates AS (
           SELECT operation.id
           FROM document_email_operations operation
           LEFT JOIN company_feature_flags flag
             ON flag.company_id = operation.company_id
            AND flag.feature = 'automatic_authorization_email'
           WHERE operation.simulated_at IS NULL
             AND operation.retryable = TRUE
             AND operation.attempts < operation.max_attempts
             AND operation.next_attempt_at <= $1
             AND operation.status IN ('pending', 'failed')
             AND COALESCE(flag.mode, 'simulate') = 'simulate'
           ORDER BY operation.next_attempt_at, operation.created_at
           FOR UPDATE OF operation SKIP LOCKED
           LIMIT $2
         )
         UPDATE document_email_operations operation
         SET status = 'processing',
             attempts = operation.attempts + 1,
             locked_at = $1,
             locked_by = $3,
             updated_at = $1
         FROM candidates
         WHERE operation.id = candidates.id
         RETURNING ${returningColumns("operation")}`,
        [now, Math.max(1, Number(batchSize || 1)), workerId]
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

  async function completeSimulation(operation, workerId, result, now = new Date().toISOString()) {
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
           locked_at = NULL,
           locked_by = NULL,
           updated_at = $3
       WHERE id = $9 AND status = 'processing' AND locked_by = $5
       RETURNING ${returningColumns()}`,
      [
        result.valid ? "pending" : "failed",
        result.valid,
        now,
        JSON.stringify(result),
        workerId,
        result.valid ? null : now,
        result.errorCode || null,
        result.errorMessage || null,
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
    if (config.automaticAuthorizationEmailMode !== "simulate") return [];
    const expiredBefore = new Date(new Date(now).getTime() - LEASE_MS).toISOString();
    const result = await pool.query(
      `UPDATE document_email_operations
       SET status = 'failed',
           retryable = attempts < max_attempts,
           next_attempt_at = CASE WHEN attempts < max_attempts THEN $1 ELSE next_attempt_at END,
           failed_at = $1,
           last_error_code = 'PROCESSING_LEASE_EXPIRED',
           last_error_message = 'El trabajador anterior no completo la operacion antes de vencer el lease.',
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

  return { claim, close, completeSimulation, failTemporary, recoverExpiredLeases };
}

module.exports = {
  LEASE_MS,
  RETRY_DELAYS_MS,
  createDocumentEmailQueueRepository,
  nextAttemptAt,
  retryDelayMs
};
