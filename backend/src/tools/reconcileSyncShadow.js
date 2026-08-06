require("dotenv").config();
const { Pool } = require("pg");
const { reconcileSyncShadow } = require("../sync-shadow-reconciler");

async function main() {
  const companyId = String(process.argv[2] || "").trim();
  if (!companyId) throw new Error("Uso: node src/tools/reconcileSyncShadow.js <companyId>");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined
  });
  try {
    const result = await reconcileSyncShadow(pool, companyId);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.status === "consistent" ? 0 : 2;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
