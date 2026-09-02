const { Client } = require("pg");
const config = require("../config");
const { signXmlWithP12 } = require("../sri/signXml");
const { prevalidateManualRecovery } = require("../sri/manual-recovery-preflight");

const args = parseArgs(process.argv.slice(2));
const companyId = String(args.companyId || "").trim();
const sequence = normalizeSequence(args.sequence);

if (!companyId || !sequence) fail("Uso: node src/tools/prevalidateManualInvoiceRecovery.js --company-id=co_x --sequence=364");
if (process.env.TZ !== "America/Guayaquil") fail("TZ debe ser exactamente America/Guayaquil.");

main().catch((error) => { console.error(JSON.stringify({ ok: false, code: error.code || "RECOVERY_PREFLIGHT_FAILED", error: error.message }, null, 2)); process.exit(1); });

async function main() {
  const db = new Client({ connectionString: config.databaseUrl, ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined });
  await db.connect();
  await db.query("BEGIN READ ONLY");
  let sale;
  try {
    const result = await db.query(
      `SELECT company_id, sequence, status, payload
         FROM sales
        WHERE company_id = $1 AND document_type = 'factura' AND sequence = $2`,
      [companyId, sequence]
    );
    if (result.rowCount !== 1) throw new Error("No se encontro exactamente una factura con esa empresa y secuencia.");
    sale = { ...result.rows[0].payload, companyId: result.rows[0].company_id, sequence: result.rows[0].sequence, status: result.rows[0].status };
  } finally {
    await db.query("ROLLBACK");
    await db.end();
  }
  const report = await prevalidateManualRecovery({ sale, companyId, signXml: signXmlWithP12 });
  console.log(JSON.stringify({ ok: report.technicallyEligible, mode: "OFFLINE_PREFLIGHT_ONLY", persisted: false, sentToSri: false, report }, null, 2));
}

function parseArgs(values) { return Object.fromEntries(values.filter((item) => item.startsWith("--")).map((item) => { const [key, ...rest] = item.slice(2).split("="); return [key.replace(/-([a-z])/g, (_m, c) => c.toUpperCase()), rest.join("=") || true]; })); }
function normalizeSequence(value) { const digits = String(value || "").replace(/\D/g, ""); return digits ? digits.padStart(9, "0").slice(-9) : ""; }
function fail(message) { console.error(message); process.exit(1); }
