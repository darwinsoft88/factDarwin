const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");

require("dotenv").config();

async function main() {
  const dbUrl = new URL(process.env.DATABASE_URL); dbUrl.pathname = "/factudarwin_phase33_it";
  const port = 4183;
  const env = { ...process.env, DATABASE_URL: dbUrl.toString(), PORT: String(port), NODE_ENV: "test", SRI_ENV: "test", JWT_SECRET: "phase33-jwt-secret-which-is-long-enough", AUTH_REQUIRED: "true", INCREMENTAL_SYNC_PULL_DIAGNOSTIC_ENABLED: "true", INCREMENTAL_SYNC_PULL_MODE: "diagnostic", INCREMENTAL_SYNC_PULL_CONFIG_VERSION: "1", INCREMENTAL_SYNC_PULL_COMPANY_IDS: "phase33-company", INCREMENTAL_SYNC_PULL_CURSOR_SECRET: "phase33-cursor-secret-which-is-long-enough", AUTOMATIC_AUTHORIZATION_EMAIL_MODE: "off", PG_BACKUP_ENABLED: "false" };
  Object.assign(process.env, env);
  const { signToken } = require("../auth");
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { env, stdio: ["ignore", "pipe", "pipe", "ipc"] });
  try {
    await waitReady(child);
    const base = `http://127.0.0.1:${port}/api/sync/diagnostic/pull?limit=2`;
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await fetch(base, { headers: { Authorization: `Bearer ${signToken({ id: "seller", companyId: "phase33-company", role: "vendedor" })}` } })).status, 403);
    const allowed = await fetch(base, { headers: { Authorization: `Bearer ${signToken({ id: "admin", companyId: "phase33-company", role: "admin" })}` } });
    assert.equal(allowed.status, 200);
    assert.equal((await allowed.json()).mode, "diagnostic");
    const rejected = await fetch(base, { headers: { Authorization: `Bearer ${signToken({ id: "admin2", companyId: "phase33-other", role: "admin" })}` } });
    assert.equal(rejected.status, 404);
    console.log(JSON.stringify({ ok: true, unauthenticated: 401, unauthorizedRole: 403, pilotCompany: 200, companyOutsideAllowlist: 404 }));
  } finally {
    if (child.connected) child.send("shutdown");
    await new Promise((resolve) => { child.once("exit", resolve); setTimeout(() => { child.kill(); resolve(); }, 5000); });
  }
}

function waitReady(child) { return new Promise((resolve, reject) => {
  let stderr = "";
  const timer = setTimeout(() => reject(new Error("Backend no inicio a tiempo")), 15000);
  child.stdout.on("data", (chunk) => { if (String(chunk).includes("Backend SRI listo")) { clearTimeout(timer); resolve(); } });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); if (String(chunk).includes("EADDRINUSE")) { clearTimeout(timer); reject(new Error(String(chunk))); } });
  child.once("exit", (code) => { if (code) { clearTimeout(timer); reject(new Error(`Backend termino con ${code}: ${stderr}`)); } });
}); }

main().catch((error) => { console.error(error); process.exitCode = 1; });
