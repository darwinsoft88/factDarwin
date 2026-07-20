const fs = require("fs");
const path = require("path");

require(path.join(__dirname, "..", "backend", "node_modules", "dotenv")).config({
  path: path.join(__dirname, "..", "backend", ".env")
});

const db = require(path.join(__dirname, "..", "backend", "src", "db"));

const companyId = process.argv[2] || "co-1778704993458-b96dbd40c99b";

(async () => {
  const snapshot = await db.getSnapshot(companyId);
  if (!snapshot?.data) throw new Error(`No se encontro snapshot para ${companyId}`);

  const backupDir = path.join(__dirname, "..", "backend", "recoveries");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(backupDir, `tenant-${companyId}-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2), "utf8");

  console.log(JSON.stringify({
    ok: true,
    file,
    sales: Array.isArray(snapshot.data.sales) ? snapshot.data.sales.length : 0,
    updatedAt: snapshot.updatedAt
  }, null, 2));
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
