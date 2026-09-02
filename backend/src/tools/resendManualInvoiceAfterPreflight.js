const crypto = require("node:crypto");
const { Client } = require("pg");
const config = require("../config");
const db = require("../db-postgres");
const { hashSyncPayload } = require("../db-utils");
const { askAuthorization, sendToReception } = require("../sri/client");
const { signXmlWithP12 } = require("../sri/signXml");
const { confirmationForSequence, executeManualInvoiceResend } = require("../sri/manual-invoice-resend");
const { buildAuthorizedRecoverySale, buildPendingRecoverySale } = require("../admin/manual-invoice-resend-persistence");

const args = parseArgs(process.argv.slice(2));
const companyId = String(args.companyId || "").trim();
const sequence = normalizeSequence(args.sequence);
const apply = args.apply === true;
const confirmation = String(args.confirmation || "");

if (!companyId || !sequence) fail("Uso: node src/tools/resendManualInvoiceAfterPreflight.js --company-id=co_x --sequence=364");
if (process.env.TZ !== "America/Guayaquil") fail("TZ debe ser exactamente America/Guayaquil.");
if (apply && !config.allowSriSend) fail("SRI_ALLOW_SEND=true es obligatorio para modo --apply.");

main().catch(async (error) => {
  console.error(JSON.stringify({ ok: false, code: error.code || "MANUAL_RESEND_FAILED", error: error.message }, null, 2));
  try { await db.close(); } catch {}
  process.exit(1);
});

async function main() {
  const connection = new Client({ connectionString: config.databaseUrl, ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined });
  await connection.connect();
  let lockHeld = false;
  try {
    if (apply) {
      const lock = await connection.query("SELECT pg_try_advisory_lock(hashtext($1), $2::int) AS acquired", [companyId, Number(sequence)]);
      if (!lock.rows[0]?.acquired) throw toolError("MANUAL_RESEND_LOCKED", "Otra recuperacion manual esta activa para esta factura.");
      lockHeld = true;
    }
    await connection.query("BEGIN READ ONLY");
    let sale;
    try {
      const result = await connection.query(
        `SELECT id, company_id, sequence, status, payload
           FROM sales
          WHERE company_id = $1 AND document_type = 'factura' AND sequence = $2`,
        [companyId, sequence]
      );
      if (result.rowCount !== 1) throw toolError("MANUAL_RESEND_SALE_NOT_FOUND", "No se encontro exactamente una factura con esa empresa y secuencia.");
      sale = { ...result.rows[0].payload, id: result.rows[0].id, companyId: result.rows[0].company_id, sequence: result.rows[0].sequence, status: result.rows[0].status };
    } finally {
      await connection.query("ROLLBACK");
    }

    const result = await executeManualInvoiceResend({
      sale,
      companyId,
      signXml: signXmlWithP12,
      askAuthorization,
      sendToReception,
      apply,
      confirmation,
      persistAuthorized: (input) => persistAuthorized(companyId, input),
      persistPending: (input) => persistPending(companyId, input),
      recordAudit: (audit) => persistAudit(companyId, audit)
    });
    console.log(JSON.stringify(result, null, 2));
    if (apply && !result.ok) process.exitCode = 2;
  } finally {
    if (lockHeld) await connection.query("SELECT pg_advisory_unlock(hashtext($1), $2::int)", [companyId, Number(sequence)]);
    await connection.end();
    await db.close();
  }
}

async function persistAuthorized(company, { sale, signedXml, authorization, preflight, recoveryPath, audit }) {
  const current = await currentSale(company, sale.id);
  const now = new Date().toISOString();
  const updated = buildAuthorizedRecoverySale({ current, original: sale, signedXml, authorization, preflight, recoveryPath, now });
  await persistPatch(company, { sales: [updated], auditLogs: [auditRecord(company, audit, now)] });
  return { status: updated.status, inventoryState: updated.inventoryState, retryHistoryPreserved: true };
}

async function persistPending(company, { sale, signedXml, authorization, reception, preflight, audit }) {
  const current = await currentSale(company, sale.id);
  const now = new Date().toISOString();
  const updated = buildPendingRecoverySale({ current, original: sale, signedXml, authorization, reception, preflight, now });
  await persistPatch(company, { sales: [updated], auditLogs: [auditRecord(company, audit, now)] });
  return { status: updated.status, inventoryState: updated.inventoryState, retryHistoryPreserved: true, resendBlocked: true };
}

async function persistAudit(company, audit) {
  const now = new Date().toISOString();
  await persistPatch(company, { auditLogs: [auditRecord(company, audit, now)] });
  return { audited: true };
}

async function currentSale(company, saleId) {
  const connection = new Client({
    connectionString: config.databaseUrl,
    ssl: process.env.PGSSLMODE === "require"
      ? { rejectUnauthorized: false }
      : undefined
  });

  await connection.connect();

  try {
    const result = await connection.query(
      `SELECT id, company_id, sequence, status, payload
         FROM sales
        WHERE company_id = $1
          AND id = $2`,
      [company, saleId]
    );

    if (result.rowCount !== 1) {
      throw toolError(
        "MANUAL_RESEND_CURRENT_SALE_MISSING",
        "No se encontro exactamente una factura vigente antes de persistir el resultado."
      );
    }

    const row = result.rows[0];

    return {
      ...row.payload,
      id: row.payload?.id || row.id,
      companyId: row.company_id,
      sequence: row.sequence,
      status: row.status
    };
  } finally {
    await connection.end();
  }
}

async function persistPatch(company, patch) {
  const requestId = `manual-resend-${crypto.randomUUID()}`;
  return db.mergeSnapshotPatch(patch, company, { requestId, operationType: "SYNC_MERGE", operationId: null, payloadHash: hashSyncPayload(patch) }, { origin: "manual_admin_sri_recovery" });
}

function auditRecord(company, audit, now) {
  return { id: crypto.randomUUID(), companyId: company, userId: "system-manual-recovery", userName: "CLI administrativa", createdAt: now, ...audit };
}

function parseArgs(values) { return values.reduce((out, item) => { if (!item.startsWith("--")) return out; const [raw, ...rest] = item.slice(2).split("="); out[raw.replace(/-([a-z])/g, (_m, c) => c.toUpperCase())] = rest.length ? rest.join("=") : true; return out; }, {}); }
function normalizeSequence(value) { const digits = String(value || "").replace(/\D/g, ""); return digits ? digits.padStart(9, "0").slice(-9) : ""; }
function toolError(code, message) { const error = new Error(message); error.code = code; return error; }
function fail(message) { console.error(message); process.exit(1); }

module.exports = { confirmationForSequence };
