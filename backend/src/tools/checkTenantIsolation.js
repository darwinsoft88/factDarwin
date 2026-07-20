const fs = require("node:fs");
const path = require("node:path");

const sourcePath = path.join(__dirname, "..", "db-postgres.js");
const source = fs.readFileSync(sourcePath, "utf8");

const tenantTables = [
  "users",
  "clients",
  "products",
  "sales",
  "sale_items",
  "remission_guides",
  "inventory_movements",
  "app_audit_logs",
  "cash_closings",
  "document_sequences",
  "saas_snapshots",
  "saas_snapshot_history",
  "saas_users",
  "saas_devices"
];

const allowedGlobalPatterns = [
  /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS/i,
  /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS/i,
  /ALTER\s+TABLE/i,
  /FROM\s+saas_companies\b/i,
  /JOIN\s+saas_companies\b/i,
  /INSERT\s+INTO\s+saas_companies\b/i,
  /UPDATE\s+saas_companies\b/i
];

const issues = [];

for (const table of tenantTables) {
  const statementPattern = new RegExp(
    String.raw`(?:SELECT|UPDATE|DELETE|INSERT)[\s\S]{0,900}\b(?:FROM|INTO|UPDATE|JOIN)\s+${table}\b[\s\S]{0,900}`,
    "gi"
  );
  const matches = source.matchAll(statementPattern);
  for (const match of matches) {
    const sql = match[0];
    if (allowedGlobalPatterns.some((pattern) => pattern.test(sql))) continue;
    if (/\bcompany_id\b/i.test(sql)) continue;
    if (/\bapp_snapshots\b/i.test(sql) || /\bapp_snapshot_history\b/i.test(sql)) continue;
    issues.push({
      table,
      line: lineNumberAt(source, match.index || 0),
      sql: compactSql(sql)
    });
  }
}

if (issues.length) {
  console.error("Aislamiento por empresa incompleto. Consultas sin company_id:");
  for (const issue of issues) {
    console.error(`- ${issue.table} en db-postgres.js:${issue.line}: ${issue.sql}`);
  }
  process.exit(1);
}

console.log("Tenant isolation OK: consultas criticas incluyen company_id.");

function lineNumberAt(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function compactSql(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 220);
}
