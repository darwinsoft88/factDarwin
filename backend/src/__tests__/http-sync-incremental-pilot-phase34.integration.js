const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
require("dotenv").config();

async function main() {
  const dbUrl = new URL(process.env.DATABASE_URL); dbUrl.pathname = "/factudarwin_phase34_it";
  const common = { ...process.env, DATABASE_URL: dbUrl.toString(), NODE_ENV: "test", SRI_ENV: "test", JWT_SECRET: "phase34-jwt-secret-which-is-long-enough", AUTH_REQUIRED: "true", INCREMENTAL_SYNC_ENABLED: "true", INCREMENTAL_SYNC_MODE: "pilot", INCREMENTAL_SYNC_CONFIG_VERSION: "1", INCREMENTAL_SYNC_COMPANY_IDS: "pilot-company", INCREMENTAL_SYNC_PLATFORMS: "android", INCREMENTAL_SYNC_CLIENTS_ENABLED: "true", INCREMENTAL_SYNC_PRODUCTS_ENABLED: "true", INCREMENTAL_SYNC_CURSOR_SECRET: "phase34-cursor-secret-which-is-long-enough", AUTOMATIC_AUTHORIZATION_EMAIL_MODE: "off", PG_BACKUP_ENABLED: "false" };
  Object.assign(process.env, common); const { signToken } = require("../auth");
  const token = signToken({ id: "pilot-user", companyId: "pilot-company", role: "admin" });
  const headers = { Authorization: `Bearer ${token}`, "X-Sync-Protocol-Version": "1", "X-App-Version": "1.0.11", "X-Platform": "android", "X-Device-Id": "android-pilot-device" };
  const child = await start({ ...common, PORT: "4184" });
  try {
    const base = "http://127.0.0.1:4184";
    const capability = await json(`${base}/api/sync/capabilities`, headers); assert.equal(capability.incrementalSyncEnabled, true);
    const bootstrap = await json(`${base}/api/sync/bootstrap`, headers); assert(bootstrap.cursor && bootstrap.snapshot?.data);
    const pull = await json(`${base}/api/sync/pull?cursor=${encodeURIComponent(bootstrap.cursor)}`, headers); assert.equal(pull.mode, "pilot");
    assert.equal((await fetch(`${base}/api/sync/capabilities`, { headers: { ...headers, "X-App-Version": "1.0.10" } })).status, 200);
    const old = await json(`${base}/api/sync/capabilities`, { ...headers, "X-App-Version": "1.0.10" }); assert.equal(old.incrementalSyncEnabled, false);
    const web = await json(`${base}/api/sync/capabilities`, { ...headers, "X-Platform": "web" }); assert.equal(web.incrementalSyncEnabled, false);
    const untrusted = await json(`${base}/api/sync/capabilities`, { ...headers, "X-Device-Id": "other" }); assert.equal(untrusted.incrementalSyncEnabled, false);
  } finally { await stop(child); }
  const off = await start({ ...common, PORT: "4185", INCREMENTAL_SYNC_ENABLED: "false" });
  try { const response = await fetch("http://127.0.0.1:4185/api/sync/pull?cursor=x", { headers }); assert.equal(response.status, 404); }
  finally { await stop(off); }
  console.log(JSON.stringify({ ok: true, compatiblePilot: true, bootstrap: true, pull: true, oldAppRejected: true, webRejected: true, untrustedDeviceRejected: true, flagRollback: true }));
}
async function json(url, headers) { const response = await fetch(url, { headers }); assert.equal(response.status, 200); return response.json(); }
function start(env) { return new Promise((resolve, reject) => { const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { env, stdio: ["ignore", "pipe", "pipe", "ipc"] }); let errors = ""; const timer = setTimeout(() => reject(new Error("timeout")), 15000); child.stderr.on("data", (chunk) => { errors += chunk; }); child.stdout.on("data", (chunk) => { if (String(chunk).includes("Backend SRI listo")) { clearTimeout(timer); resolve(child); } }); child.on("exit", (code) => { if (code) reject(new Error(`${code}:${errors}`)); }); }); }
async function stop(child) { if (child.connected) child.send("shutdown"); await new Promise((resolve) => { child.once("exit", resolve); setTimeout(() => { child.kill(); resolve(); }, 5000); }); }
main().catch((error) => { console.error(error); process.exitCode = 1; });
