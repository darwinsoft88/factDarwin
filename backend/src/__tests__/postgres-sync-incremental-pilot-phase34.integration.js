const assert = require("node:assert/strict");
const { Client } = require("pg");
require("dotenv").config();
const DB = "factudarwin_phase34_it";
function url(name = DB) { const value = new URL(process.env.DATABASE_URL); value.pathname = `/${name}`; return value.toString(); }
async function withClient(connectionString, callback) { const client = new Client({ connectionString }); await client.connect(); try { return await callback(client); } finally { await client.end(); } }

async function main() {
  await withClient(process.env.DATABASE_URL, async (client) => { await client.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [DB]); await client.query(`DROP DATABASE IF EXISTS ${DB}`); await client.query(`CREATE DATABASE ${DB}`); });
  Object.assign(process.env, { DATABASE_URL: url(), NODE_ENV: "test", INCREMENTAL_SYNC_SHADOW_ENABLED: "true", INCREMENTAL_SYNC_SHADOW_MODE: "shadow", INCREMENTAL_SYNC_CONFIG_VERSION: "1", INCREMENTAL_SYNC_ENVIRONMENT: "test", INCREMENTAL_SYNC_ENABLED: "true", INCREMENTAL_SYNC_MODE: "pilot", INCREMENTAL_SYNC_COMPANY_IDS: "pilot-company", INCREMENTAL_SYNC_PLATFORMS: "android", INCREMENTAL_SYNC_CLIENTS_ENABLED: "true", INCREMENTAL_SYNC_PRODUCTS_ENABLED: "true", INCREMENTAL_SYNC_CURSOR_SECRET: "phase34-secret".repeat(4) });
  const db = require("../db-postgres");
  const { hashSyncPayload } = require("../db-utils");
  const company = "pilot-company"; const user = "pilot-user"; const device = "android-pilot-device";
  await db.initialize();
  await withClient(url(), async (client) => {
    await client.query("INSERT INTO saas_companies(id,ruc,business_name,trade_name,email,phone,status,created_at,updated_at) VALUES($1,'1790012345001','Piloto','','a@b.ec','','active',now(),now())", [company]);
    await client.query("INSERT INTO saas_users(id,company_id,name,email,password_hash,role,status,created_at,updated_at) VALUES($2,$1,'Piloto','a@b.ec','hash','admin','active',now(),now())", [company, user]);
    await client.query("INSERT INTO saas_devices(id,company_id,user_id,device_label,platform,first_seen_at,last_seen_at) VALUES($3,$1,$2,'Android','android',now(),now())", [company, user, device]);
  });
  const base = baseData();
  await db.saveSnapshot(base, company);
  const bootstrap = await db.getIncrementalPilotBootstrap(company);
  assert(bootstrap && bootstrap.watermark > 0);
  assert(bootstrap.versions.some((entry) => entry.entityType === "client"));
  const clientPatch = { clients: [{ ...base.clients[0], name: "Cliente remoto", updatedAt: new Date().toISOString() }] };
  await db.mergeSnapshotPatch(clientPatch, company, { requestId: "phase34-client", operationType: "SYNC_MERGE", operationId: null, payloadHash: hashSyncPayload(clientPatch) });
  const productPatch = { products: [{ id: "p1", code: "P1", name: "Producto remoto", price: 2, ivaRate: 0.15, stock: 3 }] };
  await db.mergeSnapshotPatch(productPatch, company, { requestId: "phase34-product", operationType: "SYNC_MERGE", operationId: null, payloadHash: hashSyncPayload(productPatch) });
  await db.mergeSnapshotPatch({ deletions: { products: ["p1"] } }, company, { requestId: "phase34-delete", operationType: "SYNC_MERGE", operationId: null, payloadHash: hashSyncPayload({ deletions: { products: ["p1"] } }) });
  const rows = await db.listDiagnosticSyncChanges({ companyId: company, after: bootstrap.watermark, watermark: await db.maximumSyncChangeSequence(company), limit: 100, entityTypes: ["client", "product"] });
  assert.deepEqual(rows.map((row) => row.action), ["UPSERT", "UPSERT", "DELETE"]);
  assert.equal(rows[2].isTombstone, true);
  assert.equal(await db.isIncrementalPilotDeviceTrusted({ companyId: company, userId: user, deviceId: device }), true);
  assert.equal(await db.isIncrementalPilotDeviceTrusted({ companyId: company, userId: user, deviceId: "other" }), false);
  console.log(JSON.stringify({ ok: true, bootstrap: { watermark: bootstrap.watermark, versions: bootstrap.versions.length }, changes: rows.map((row) => ({ entityType: row.entityType, action: row.action, version: Number(row.recordVersion) })), trustedDevice: true, rejectedDevice: true }));
  await db.close();
}
function baseData() { return { users: [{ id: "pilot-user", name: "Piloto", email: "a@b.ec", role: "admin" }], clients: [{ id: "c1", identification: "1712345678", identificationType: "05", name: "Cliente", email: "", phone: "", address: "Ecuador" }], products: [], sales: [], inventoryMovements: [], auditLogs: [], creditPayments: [], creditAdjustments: [], receivedRetentions: [], guides: [], cashClosings: [], issuer: { ruc: "1790012345001", businessName: "Piloto", tradeName: "Piloto", address: "Quito", environment: "1", establishment: "001", emissionPoint: "001", sequential: 1, establishments: [] } }; }
main().catch((error) => { console.error(error); process.exitCode = 1; });
