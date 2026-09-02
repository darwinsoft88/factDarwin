const config = require("../config");
const { Client } = require("pg");
const db = require("../db-postgres");
const { hashSyncPayload } = require("../db-utils");
const { REQUIRED_CONFIRMATION, prepareInvoice363Restoration } = require("../admin/manual-invoice-363-restoration");

const args = parseArgs(process.argv.slice(2));
const companyId = String(args.companyId || "").trim();
const apply = args.apply === true;
if (!companyId) fail("Falta --company-id=...");
if (!config.databaseUrl) fail("Esta accion requiere PostgreSQL.");

main().catch((error) => { console.error(JSON.stringify({ ok: false, code: error.code || "RESTORE_363_FAILED", error: error.message }, null, 2)); process.exit(1); });

async function main() {
  await db.initialize();

  const connection = new Client({
    connectionString: config.databaseUrl,
    ssl: process.env.PGSSLMODE === "require"
      ? { rejectUnauthorized: false }
      : undefined
  });

  await connection.connect();

  let sale;
  try {
    const result = await connection.query(
      `SELECT id, company_id, sequence, status, payload
         FROM sales
        WHERE company_id = $1
          AND document_type = 'factura'
          AND sequence = '000000363'`,
      [companyId]
    );

    if (result.rowCount !== 1) {
      throw new Error("No se encontro exactamente una factura 363 en PostgreSQL.");
    }

    const row = result.rows[0];

    sale = {
      ...row.payload,
      id: row.payload?.id || row.id,
      companyId: row.company_id,
      sequence: row.sequence,
      status: row.status
    };
  } finally {
    await connection.end();
  }

  const prepared = prepareInvoice363Restoration({
    sale,
    companyId,
    confirmation: apply ? String(args.confirmation || "") : REQUIRED_CONFIRMATION
  });
  if (!apply) {
    console.log(JSON.stringify({ ok: true, mode: "DRY_RUN", applied: false, requiredConfirmation: REQUIRED_CONFIRMATION, proposal: prepared }, null, 2));
    return;
  }
  const patch = { sales: [prepared.restoredSale], auditLogs: [prepared.audit] };
  await db.mergeSnapshotPatch(patch, companyId, {
    requestId: `manual-restore-363-${prepared.audit.id}`,
    operationType: "SYNC_MERGE",
    operationId: null,
    payloadHash: hashSyncPayload(patch)
  }, { origin: "manual_admin_recovery" });
  console.log(JSON.stringify({ ok: true, mode: "APPLY", applied: true, sequence: "000000363", status: "ANULADA", sriOperation: "NONE" }, null, 2));
  await db.close();
}

function parseArgs(values) { return values.reduce((out, item) => { if (!item.startsWith("--")) return out; const [raw, ...rest] = item.slice(2).split("="); out[raw.replace(/-([a-z])/g, (_m, c) => c.toUpperCase())] = rest.length ? rest.join("=") : true; return out; }, {}); }
function fail(message) { console.error(message); process.exit(1); }
