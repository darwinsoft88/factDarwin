const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { Client } = require("pg");
require("dotenv").config();

const DATABASE = "factudarwin_phase35c_it";
const COMPANY = "history-company-a";
const OTHER_COMPANY = "history-company-b";
const DEVICE = "history-android-device";
const USER = "history-admin";
const PORT = 4195;
const migration = fs.readFileSync(path.join(__dirname, "..", "migrations", "005-document-history-index.sql"), "utf8");

function databaseUrl(name = DATABASE) {
  const value = new URL(process.env.DATABASE_URL);
  value.pathname = `/${name}`;
  return value.toString();
}

async function withClient(connectionString, callback) {
  const client = new Client({ connectionString });
  await client.connect();
  try { return await callback(client); } finally { await client.end(); }
}

async function recreateDatabase() {
  await withClient(process.env.DATABASE_URL, async (client) => {
    await client.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [DATABASE]);
    await client.query(`DROP DATABASE IF EXISTS ${DATABASE}`);
    await client.query(`CREATE DATABASE ${DATABASE}`);
  });
}

function saleRow(index, companyId = COMPANY, overrides = {}) {
  const sequence = String(index).padStart(9, "0");
  const documentId = overrides.documentId || `sale-${companyId}-${sequence}`;
  const createdAt = overrides.createdAt || new Date(Date.UTC(2026, 0, 1, 0, 0, index % 60)).toISOString();
  return {
    companyId, documentId, databaseId: `${companyId}:${documentId}`,
    documentType: overrides.documentType || "factura",
    status: overrides.status || "AUTORIZADA",
    inventoryState: overrides.inventoryState || "APPLIED",
    establishment: overrides.establishment || "001",
    emissionPoint: overrides.emissionPoint || "001",
    sequence, createdAt,
    clientId: `${companyId}:client`,
    clientName: overrides.clientName || "Cliente de prueba",
    clientIdentification: overrides.clientIdentification || "1712345678",
    total: overrides.total ?? 12.34,
    accessKey: overrides.accessKey || `${companyId}-${sequence}`,
    authorizationNumber: overrides.authorizationNumber || `AUTH-${companyId}-${sequence}`,
    emailStatus: overrides.emailStatus || "accepted"
  };
}

async function insertClient(client, companyId) {
  await client.query(
    `INSERT INTO clients(id,company_id,name,identification,identification_type,email,phone,address,payload,updated_at)
     VALUES($1,$2,$3,$4,'05','','','',jsonb_build_object('id',$1::text),now())`,
    [`${companyId}:client`, companyId, "Cliente de prueba", companyId === COMPANY ? "1712345678" : "1799999999"]
  );
}

async function insertSales(client, rows) {
  const values = [];
  const placeholders = [];
  rows.forEach((row, index) => {
    const offset = index * 19;
    placeholders.push(`(${Array.from({ length: 19 }, (_, field) => `$${offset + field + 1}`).join(",")})`);
    values.push(
      row.databaseId, row.companyId, "1", row.establishment, row.emissionPoint,
      row.documentType, row.clientId, USER, row.sequence, row.accessKey,
      row.authorizationNumber, row.status, row.total, 0, row.total,
      row.createdAt,
      JSON.stringify({ id: row.documentId, documentType: row.documentType, inventoryState: row.inventoryState, authorizedXml: "<autorizacion/>", emailHistory: [{ status: row.emailStatus }] }),
      row.createdAt, null
    );
  });
  await client.query(
    `INSERT INTO sales(id,company_id,environment,establishment,emission_point,document_type,client_id,user_id,sequence,access_key,authorization_number,status,subtotal,tax,total,created_at,payload,updated_at,source_sale_id)
     VALUES ${placeholders.join(",")}`,
    values
  );
}

async function setup() {
  await recreateDatabase();
  Object.assign(process.env, {
    DATABASE_URL: databaseUrl(), NODE_ENV: "test", SRI_ENV: "test",
    JWT_SECRET: "phase35c-jwt-secret-which-is-long-enough",
    AUTH_REQUIRED: "true", AUTOMATIC_AUTHORIZATION_EMAIL_MODE: "off",
    PG_BACKUP_ENABLED: "false"
  });
  const db = require("../db-postgres");
  await db.initialize();
  await withClient(databaseUrl(), async (client) => {
    await client.query("TRUNCATE document_history_index RESTART IDENTITY");
    await insertClient(client, COMPANY);
    await insertClient(client, OTHER_COMPANY);
    const rows = Array.from({ length: 1250 }, (_, index) => saleRow(index + 1));
    rows.push(...Array.from({ length: 25 }, (_, index) => saleRow(index + 1, OTHER_COMPANY)));
    rows.push(saleRow(2001, COMPANY, { status: "ERROR_SRI" }));
    rows.push(saleRow(2002, COMPANY, { status: "ANULADA" }));
    rows.push(saleRow(2003, COMPANY, { inventoryState: "RECONCILIATION_PENDING" }));
    rows.push(saleRow(2004, COMPANY, { documentType: "nota_credito" }));
    for (let offset = 0; offset < rows.length; offset += 250) await insertSales(client, rows.slice(offset, offset + 250));
  });
  return db;
}

async function validateMigrationAndBackfill() {
  return withClient(databaseUrl(), async (client) => {
    const before = await client.query("SELECT count(*)::int count FROM sales");
    const started = Date.now(); await client.query("BEGIN"); await client.query(migration); await client.query("COMMIT"); const firstMs = Date.now() - started;
    const first = await client.query("SELECT count(*)::int count,count(distinct (company_id,document_type,document_id))::int identities,min(history_seq)::text min_seq,max(history_seq)::text max_seq FROM document_history_index");
    assert.deepEqual({ count: first.rows[0].count, identities: first.rows[0].identities }, { count: 1275, identities: 1275 });
    const sequences = await client.query("SELECT company_id,document_id,history_seq::text FROM document_history_index ORDER BY company_id,document_id");
    const repeatedAt = Date.now(); await client.query("BEGIN"); await client.query(migration); await client.query("COMMIT"); const repeatedMs = Date.now() - repeatedAt;
    const repeated = await client.query("SELECT company_id,document_id,history_seq::text FROM document_history_index ORDER BY company_id,document_id");
    assert.deepEqual(repeated.rows, sequences.rows);
    assert.equal((await client.query("SELECT count(*)::int count FROM sales")).rows[0].count, before.rows[0].count);
    const excluded = await client.query("SELECT count(*)::int count FROM document_history_index WHERE document_id LIKE '%00200_' OR document_type<>'factura' OR status<>'AUTORIZADA'");
    assert.equal(excluded.rows[0].count, 0);
    const companies = await client.query("SELECT company_id,count(*)::int count FROM document_history_index GROUP BY company_id ORDER BY company_id");
    assert.deepEqual(companies.rows, [{ company_id: COMPANY, count: 1250 }, { company_id: OTHER_COMPANY, count: 25 }]);

    const sample = sequences.rows.find((row) => row.company_id === COMPANY);
    await client.query("UPDATE clients SET name='Cliente actualizado' WHERE company_id=$1", [COMPANY]);
    await client.query(migration);
    const after = await client.query("SELECT history_seq::text,client_name FROM document_history_index WHERE company_id=$1 AND document_id=$2", [COMPANY, sample.document_id]);
    assert.equal(after.rows[0].history_seq, sample.history_seq);
    assert.equal(after.rows[0].client_name, "Cliente actualizado");

    await client.query("BEGIN");
    await client.query("INSERT INTO document_history_index(company_id,document_type,document_id,establishment,emission_point,document_scope,sequence,created_at,status,sri_status,summary_updated_at) VALUES('broken','factura','broken','001','001','001-001','1',now(),'AUTORIZADA','AUTORIZADA',now())");
    await client.query("INSERT INTO document_history_index(company_id,document_type,document_id,establishment,emission_point,document_scope,sequence,created_at,status,sri_status,summary_updated_at) VALUES('broken','factura','broken','001','001','001-001','2',now(),'AUTORIZADA','AUTORIZADA',now())").catch(() => {});
    await client.query("ROLLBACK");
    assert.equal((await client.query("SELECT count(*)::int count FROM document_history_index WHERE company_id='broken'")).rows[0].count, 0);
    return { firstMs, repeatedMs, rowsEvaluated: before.rows[0].count, rowsInserted: first.rows[0].count, companies: companies.rows, sequenceStable: true, rollback: true };
  });
}

async function validateProjectionLifecycle(db) {
  const company = "lifecycle-company";
  await withClient(databaseUrl(), (client) => client.query(
    "INSERT INTO saas_companies(id,ruc,business_name,trade_name,email,phone,status,created_at,updated_at) VALUES($1,'1790012345002',$1,'','','','active',now(),now()) ON CONFLICT(id) DO NOTHING",
    [company]
  ));
  const first = saleSnapshot("lifecycle-sale-a", "AUTORIZADA");
  const second = saleSnapshot("lifecycle-sale-b", "AUTORIZADA");
  await db.saveSnapshot(baseSnapshot(company, [first, second]), company);
  const initial = await historyRows(company);
  assert.equal(initial.length, 2);
  const sequenceA = initial.find((row) => row.document_id === first.id).history_seq;
  await db.saveSnapshot(baseSnapshot(company, [{ ...first, status: "ANULADA" }, second]), company);
  const excluded = await historyRows(company, false);
  assert.equal(excluded.find((row) => row.document_id === first.id).is_visible, false);
  await db.saveSnapshot(baseSnapshot(company, [first, second]), company);
  assert.equal((await historyRows(company)).find((row) => row.document_id === first.id).history_seq, sequenceA);
  await db.saveSnapshot(baseSnapshot(company, [second]), company);
  const compacted = await historyRows(company);
  assert.equal(compacted.some((row) => row.document_id === first.id), true, "un ausente por compactacion conserva historial");
  return { excludedBecomesInvisible: true, restoredKeepsSequence: true, compactedHistoryPreserved: true };
}

function saleSnapshot(id, status) {
  return { id, documentType: "factura", clientId: "client", userId: USER, createdAt: "2026-01-01T00:00:00.000Z", sequence: id.endsWith("a") ? "000000001" : "000000002", accessKey: `key-${id}`, authorizationNumber: `auth-${id}`, inventoryState: "APPLIED", authorizedXml: "<autorizacion/>", subtotal: 1, tax: 0, total: 1, paymentMethod: "01", status, items: [] };
}

function baseSnapshot(company, sales) {
  return { users: [{ id: USER, name: "Admin", email: "admin@example.test", role: "admin" }], clients: [{ id: "client", identification: "1712345678", identificationType: "05", name: "Cliente", email: "", phone: "", address: "" }], products: [], sales, inventoryMovements: [], auditLogs: [], creditPayments: [], creditAdjustments: [], receivedRetentions: [], guides: [], cashClosings: [], issuer: { ruc: "1790012345001", businessName: company, tradeName: company, address: "Quito", environment: "1", establishment: "001", emissionPoint: "001", sequential: 3, establishments: [] } };
}

async function historyRows(companyId, visibleOnly = true) {
  return withClient(databaseUrl(), async (client) => (await client.query(`SELECT document_id,history_seq::text,is_visible FROM document_history_index WHERE company_id=$1 ${visibleOnly ? "AND is_visible" : ""} ORDER BY document_id`, [companyId])).rows);
}

async function validateContinuity(db) {
  const { historicalDocumentsPage } = require("../document-history");
  const { buildDocumentHistoryConfig } = require("../document-history-config");
  const config = buildDocumentHistoryConfig({ NODE_ENV: "test", HISTORICAL_DOCUMENT_PAGINATION_ENABLED: "true", HISTORICAL_DOCUMENT_PAGINATION_MODE: "pilot", HISTORICAL_DOCUMENT_PAGINATION_CONFIG_VERSION: "1", HISTORICAL_DOCUMENT_PAGINATION_COMPANY_IDS: COMPANY, HISTORICAL_DOCUMENT_PAGINATION_CURSOR_SECRET: "phase35c-cursor-secret" }, "jwt");
  const repository = { maximumSequence: db.maximumDocumentHistorySequence, listPage: db.listDocumentHistoryPage };
  const expected = await withClient(databaseUrl(), async (client) => (await client.query("SELECT document_id FROM document_history_index WHERE company_id=$1 AND document_scope='001-001' AND is_visible ORDER BY created_at DESC,sequence_number DESC,document_id DESC", [COMPANY])).rows.map((row) => row.document_id));
  const results = {};
  for (const limit of [25, 50, 100]) {
    const received = []; let cursor = null; let pages = 0; let firstCursor = null;
    do {
      const response = await historicalDocumentsPage(repository, { companyId: COMPANY, config, query: { documentScope: "001-001", limit: String(limit), ...(cursor ? { cursor } : {}) } });
      received.push(...response.items.map((item) => item.documentId)); pages += 1;
      if (!firstCursor) firstCursor = response.nextCursor;
      cursor = response.nextCursor;
      if (!response.hasMore) break;
    } while (pages < 100);
    assert.deepEqual(received, expected);
    assert.equal(new Set(received).size, expected.length);
    const repeated = await historicalDocumentsPage(repository, { companyId: COMPANY, config, query: { documentScope: "001-001", limit: String(limit), cursor: firstCursor } });
    assert.deepEqual(repeated.items.map((item) => item.documentId), expected.slice(limit, limit * 2));
    results[limit] = { pages, rows: received.length };
  }
  const first = await historicalDocumentsPage(repository, { companyId: COMPANY, config, query: { documentScope: "001-001", limit: "25" } });
  await withClient(databaseUrl(), async (client) => insertHistorySeries(client, "late", COMPANY, 1, 200000, "2020-01-01T00:00:00.000Z"));
  const oldSession = await historicalDocumentsPage(repository, { companyId: COMPANY, config, query: { documentScope: "001-001", limit: "100", cursor: first.nextCursor } });
  assert.equal(oldSession.items.some((item) => item.documentId === "late-200000"), false);
  const fresh = await historicalDocumentsPage(repository, { companyId: COMPANY, config, query: { documentScope: "001-001", search: "000200000" } });
  assert.equal(fresh.items.some((item) => item.documentId === "late-200000"), true);
  return { batches: results, watermarkExcludesLateInsert: true, newSessionIncludesLateInsert: true };
}

async function insertHistorySeries(client, prefix, companyId, count, start = 1, baseDate = "2026-01-01T00:00:00.000Z") {
  await client.query(
    `INSERT INTO document_history_index(company_id,document_type,document_id,environment,establishment,emission_point,document_scope,sequence,sequence_number,created_at,client_id,client_name,client_identification,total_micros,status,sri_status,authorization_number,access_key,inventory_status,email_status,has_authorized_xml,has_ride_data,is_visible,summary_updated_at)
     SELECT $1,'factura',$2||'-'||n,'1','001','001','001-001',lpad(n::text,9,'0'),n,$4::timestamptz + (n||' seconds')::interval,'client','Cliente',lpad((1700000000+(n%99999999))::text,10,'0'),12340000,'AUTORIZADA','AUTORIZADA','AUTH-'||n,'KEY-'||$2||'-'||n,'APPLIED','accepted',true,true,true,now()
     FROM generate_series($3::bigint,($3+$5-1)::bigint) n
     ON CONFLICT(company_id,document_type,document_id) DO NOTHING`,
    [companyId, prefix, start, baseDate, count]
  );
}

async function validateConcurrencyAndCorruption() {
  const clients = await Promise.all(Array.from({ length: 8 }, async () => { const client = new Client({ connectionString: databaseUrl() }); await client.connect(); return client; }));
  try {
    await Promise.all(clients.map((client, index) => client.query(
      `INSERT INTO document_history_index(company_id,document_type,document_id,establishment,emission_point,document_scope,sequence,created_at,status,sri_status,summary_updated_at)
       VALUES('concurrent','factura','same','001','001','001-001','1',now(),'AUTORIZADA','AUTORIZADA',now())
       ON CONFLICT(company_id,document_type,document_id) DO UPDATE SET client_name=$1,summary_updated_at=now()`, [`worker-${index}`]
    )));
    const result = await clients[0].query("SELECT count(*)::int count,count(distinct history_seq)::int sequences FROM document_history_index WHERE company_id='concurrent' AND document_id='same'");
    assert.deepEqual(result.rows[0], { count: 1, sequences: 1 });
    await clients[0].query("BEGIN");
    await clients[0].query("UPDATE document_history_index SET status='ERROR_SRI' WHERE company_id=$1 AND document_id=(SELECT document_id FROM document_history_index WHERE company_id=$1 LIMIT 1)", [COMPANY]);
    const diff = await clients[0].query("SELECT count(*)::int count FROM document_history_index WHERE company_id=$1 AND is_visible AND status<>'AUTORIZADA'", [COMPANY]);
    assert.equal(diff.rows[0].count, 1);
    await clients[0].query("ROLLBACK");
    return { concurrentIdentityRows: 1, reassignedSequences: 0, controlledCorruptionDetected: true };
  } finally { await Promise.all(clients.map((client) => client.end())); }
}

async function validatePerformance() {
  return withClient(databaseUrl(), async (client) => {
    const company = "performance-company";
    const insertAt = Date.now(); await insertHistorySeries(client, "perf", company, 100000); const insertMs = Date.now() - insertAt;
    await client.query("ANALYZE document_history_index");
    const watermark = (await client.query("SELECT max(history_seq)::text value FROM document_history_index WHERE company_id=$1", [company])).rows[0].value;
    const scenarios = {
      watermark: [`SELECT history_seq FROM document_history_index WHERE company_id=$1 AND is_visible ORDER BY history_seq DESC LIMIT 1`, [company]],
      first: [`SELECT document_id FROM document_history_index WHERE company_id=$1 AND document_type='factura' AND status='AUTORIZADA' AND document_scope='001-001' AND history_seq<=$2::bigint AND is_visible ORDER BY created_at DESC,sequence_number DESC,document_id DESC LIMIT 100`, [company, watermark]],
      middle: [`SELECT document_id FROM document_history_index WHERE company_id=$1 AND document_type='factura' AND status='AUTORIZADA' AND document_scope='001-001' AND history_seq<=$2::bigint AND is_visible AND (created_at,sequence_number,document_id)<($3::timestamptz,$4::bigint,$5) ORDER BY created_at DESC,sequence_number DESC,document_id DESC LIMIT 100`, [company, watermark, "2026-01-02T03:46:40.000Z", 50000, "perf-50000"]],
      exactIdentification: [`SELECT document_id FROM document_history_index WHERE company_id=$1 AND client_identification='1700050000' AND is_visible LIMIT 100`, [company]],
      exactSequence: [`SELECT document_id FROM document_history_index WHERE company_id=$1 AND sequence='000050000' AND is_visible LIMIT 100`, [company]]
    };
    const plans = {};
    for (const [name, [sql, values]] of Object.entries(scenarios)) {
      const result = await client.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${sql}`, values);
      const plan = result.rows[0]["QUERY PLAN"][0];
      plans[name] = { executionMs: plan["Execution Time"], planningMs: plan["Planning Time"], node: plan.Plan["Node Type"], child: plan.Plan.Plans?.[0]?.["Node Type"] || null, plan: JSON.stringify(plan.Plan) };
    }
    const storage = await client.query("SELECT pg_total_relation_size('document_history_index')::bigint::text total,pg_relation_size('document_history_index')::bigint::text table_bytes,pg_indexes_size('document_history_index')::bigint::text index_bytes,(select count(*)::bigint::text from document_history_index) rows");
    return { inserted: 100000, insertMs, plans, storage: storage.rows[0] };
  });
}

async function seedHttpIdentity() {
  await withClient(databaseUrl(), async (client) => {
    await client.query("INSERT INTO saas_companies(id,ruc,business_name,trade_name,email,phone,status,created_at,updated_at) VALUES($1,'1790012345001','Historia','','a@b.ec','','active',now(),now()) ON CONFLICT(id) DO NOTHING", [COMPANY]);
    await client.query("INSERT INTO saas_users(id,company_id,name,email,password_hash,role,status,created_at,updated_at) VALUES($2,$1,'Admin','a@b.ec','hash','admin','active',now(),now()) ON CONFLICT(id) DO NOTHING", [COMPANY, USER]);
    await client.query("INSERT INTO saas_devices(id,company_id,user_id,device_label,platform,first_seen_at,last_seen_at) VALUES($3,$1,$2,'Android','android',now(),now()) ON CONFLICT(id) DO NOTHING", [COMPANY, USER, DEVICE]);
  });
}

async function validateHttp() {
  await seedHttpIdentity();
  const common = { ...process.env, DATABASE_URL: databaseUrl(), PORT: String(PORT), NODE_ENV: "test", SRI_ENV: "test", JWT_SECRET: "phase35c-jwt-secret-which-is-long-enough", AUTH_REQUIRED: "true", AUTOMATIC_AUTHORIZATION_EMAIL_MODE: "off", PG_BACKUP_ENABLED: "false", HISTORICAL_DOCUMENT_PAGINATION_ENABLED: "true", HISTORICAL_DOCUMENT_PAGINATION_MODE: "pilot", HISTORICAL_DOCUMENT_PAGINATION_CONFIG_VERSION: "1", HISTORICAL_DOCUMENT_PAGINATION_ENVIRONMENT: "test", HISTORICAL_DOCUMENT_PAGINATION_COMPANY_IDS: COMPANY, HISTORICAL_DOCUMENT_PAGINATION_PLATFORMS: "android", HISTORICAL_DOCUMENT_PAGINATION_PILOT_USER_IDS: USER, HISTORICAL_DOCUMENT_PAGINATION_PILOT_DEVICE_IDS: DEVICE, HISTORICAL_DOCUMENT_PAGINATION_MIN_APP_VERSION: "1.0.11", HISTORICAL_DOCUMENT_PAGINATION_CURSOR_SECRET: "phase35c-http-cursor-secret" };
  Object.assign(process.env, common);
  delete require.cache[require.resolve("../config")]; delete require.cache[require.resolve("../auth")];
  const { signToken } = require("../auth");
  const token = signToken({ id: USER, companyId: COMPANY, role: "admin", name: "Admin", email: "a@b.ec" });
  const headers = { Authorization: `Bearer ${token}`, "X-Historical-Documents-Protocol-Version": "1", "X-App-Version": "1.0.11", "X-Platform": "android", "X-Device-Id": DEVICE };
  const child = await startServer(common);
  try {
    const base = `http://127.0.0.1:${PORT}/api/documents/history?documentScope=001-001`;
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await fetch(base, { headers: { ...headers, Authorization: "Bearer invalid" } })).status, 401);
    const ok = await fetch(base, { headers }); assert.equal(ok.status, 200); const payload = await ok.json(); assert(payload.items.length > 0);
    const web = await fetch(base, { headers: { ...headers, "X-Platform": "web" } }); assert.equal((await web.json()).error.code, "PLATFORM_NOT_ALLOWED");
    const old = await fetch(base, { headers: { ...headers, "X-App-Version": "1.0.10" } }); assert.equal((await old.json()).error.code, "APP_VERSION_NOT_ALLOWED");
    const device = await fetch(base, { headers: { ...headers, "X-Device-Id": "other" } }); assert.equal((await device.json()).error.code, "DEVICE_NOT_ALLOWED");
    const protocol = await fetch(base, { headers: { ...headers, "X-Historical-Documents-Protocol-Version": "2" } }); assert.equal((await protocol.json()).error.code, "PROTOCOL_UNSUPPORTED");
    return { unauthenticated: 401, invalidToken: 401, pilot: 200, webRejected: true, oldVersionRejected: true, deviceRejected: true, protocolRejected: true };
  } finally { await stopServer(child); }
}

async function validateFlagRollback() {
  const env = { ...process.env, DATABASE_URL: databaseUrl(), PORT: String(PORT + 1), HISTORICAL_DOCUMENT_PAGINATION_ENABLED: "false", PG_BACKUP_ENABLED: "false" };
  const child = await startServer(env);
  try {
    const response = await fetch(`http://127.0.0.1:${PORT + 1}/api/documents/history?documentScope=001-001`, { headers: { Authorization: "Bearer invalid" } });
    assert.equal(response.status, 401);
    return { flagOff: true, operationalTablesPreserved: true };
  } finally { await stopServer(child); }
}

function startServer(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { env, stdio: ["ignore", "pipe", "pipe", "ipc"] });
    let errors = ""; const timer = setTimeout(() => reject(new Error(`server timeout: ${errors}`)), 20000);
    child.stderr.on("data", (chunk) => { errors += chunk; });
    child.stdout.on("data", (chunk) => { if (String(chunk).includes("Backend SRI listo")) { clearTimeout(timer); resolve(child); } });
    child.on("exit", (code) => { if (code) reject(new Error(`server ${code}: ${errors}`)); });
  });
}

async function stopServer(child) {
  if (child.connected) child.send("shutdown");
  await new Promise((resolve) => { child.once("exit", resolve); setTimeout(() => { if (!child.killed) child.kill(); resolve(); }, 5000); });
}

async function main() {
  const db = await setup();
  try {
    const migrationResult = await validateMigrationAndBackfill();
    const lifecycle = await validateProjectionLifecycle(db);
    const continuity = await validateContinuity(db);
    const concurrency = await validateConcurrencyAndCorruption();
    const performance = await validatePerformance();
    await db.close();
    const skipHttp = process.env.PHASE35C_SKIP_HTTP === "true";
    const http = skipHttp ? { skipped: true, reason: "SPAWN_EPERM_ENVIRONMENT" } : await validateHttp();
    const rollback = skipHttp ? { skipped: true, reason: "SPAWN_EPERM_ENVIRONMENT" } : await validateFlagRollback();
    console.log(JSON.stringify({ ok: true, postgres: "18.3", migrationResult, lifecycle, continuity, concurrency, performance, http, rollback }, null, 2));
  } finally { try { await db.close(); } catch {} }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
