const assert = require("node:assert/strict");
const { Client } = require("pg");
require("dotenv").config();

const TEST_DATABASE = "factudarwin_email_phase4_it";
const action = process.argv[2];
const urlFor = (name) => { const url = new URL(process.env.DATABASE_URL); url.pathname = `/${name}`; return url.toString(); };
async function clientFor(url, callback) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try { return await callback(client); } finally { await client.end(); }
}
async function prepare() {
  await clientFor(process.env.DATABASE_URL, async (client) => {
    await client.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [TEST_DATABASE]);
    await client.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE}`);
    await client.query(`CREATE DATABASE ${TEST_DATABASE}`);
  });
}
async function schema() {
  process.env.DATABASE_URL = urlFor(TEST_DATABASE);
  process.env.AUTOMATIC_AUTHORIZATION_EMAIL_MODE = "send";
  const db = require("../db-postgres");
  await db.initialize();
  await db.close();
  const columns = await clientFor(process.env.DATABASE_URL, async (client) => (await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='document_email_operations'
     AND column_name IN ('smtp_envelope','sent_worker_id','send_started_at','send_completed_at','smtp_elapsed_ms')
     ORDER BY column_name`
  )).rows.map((row) => row.column_name));
  assert.equal(columns.length, 5);
  console.log(JSON.stringify({ smtpColumns: columns }));
}
function payload(id, documentType) {
  const code = documentType === "nota_credito" ? "04" : "01";
  const accessKey = `26072026011790012345001100100${code}${String(id.length).padStart(9, "0")}1234567813`;
  return {
    delivery: { recipientEmail: "cliente@example.test" },
    authorizationSnapshot: {
      document: {
        id, documentType, status: "AUTORIZADA", accessKey, authorizationNumber: accessKey,
        authorizedXml: `<documento><infoTributaria><codDoc>${code}</codDoc><claveAcceso>${accessKey}</claveAcceso></infoTributaria></documento>`,
        establishment: "001", emissionPoint: "001", sequence: "000000001",
        createdAt: "2026-07-26T10:00:00.000Z", total: 10,
        items: [{ id: "line-1", name: "Producto", quantity: 1, unitPrice: 10, ivaRate: 0 }]
      },
      client: { id: "client-1", name: "Cliente", identification: "1712345678", email: "cliente@example.test" },
      issuer: { ruc: "1790012345001", businessName: "Empresa", address: "Quito", establishment: "001", emissionPoint: "001" }
    }
  };
}
async function insert(client, id, companyId, documentType = "factura", overrides = {}) {
  await client.query(
    `INSERT INTO document_email_operations
      (id,company_id,document_type,document_id,origin,status,recipient_email,payload_json,payload_hash,next_attempt_at,retryable,locked_at,locked_by,attempts)
     VALUES ($1,$2,$3,$1,'automatic_authorization',$4,'cliente@example.test',$5::jsonb,$6,NOW(),TRUE,$7,$8,$9)`,
    [id, companyId, documentType, overrides.status || "pending", JSON.stringify(payload(id, documentType)), `hash-${id}`,
      overrides.lockedAt || null, overrides.lockedBy || null, overrides.attempts || 0]
  );
}
async function cases() {
  process.env.DATABASE_URL = urlFor(TEST_DATABASE);
  process.env.AUTOMATIC_AUTHORIZATION_EMAIL_MODE = "send";
  const config = require("../config");
  const { createDocumentEmailQueueRepository } = require("../document-email-queue");
  assert.equal(config.automaticAuthorizationEmailMode, "send");
  const first = createDocumentEmailQueueRepository({ connectionString: process.env.DATABASE_URL });
  const second = createDocumentEmailQueueRepository({ connectionString: process.env.DATABASE_URL });
  await clientFor(process.env.DATABASE_URL, async (client) => {
    await client.query(`INSERT INTO company_feature_flags(company_id,feature,mode) VALUES
      ('enabled','automatic_authorized_document_email_send_enabled','send'),
      ('enabled','legacy_automatic_credit_note_email','off'),
      ('disabled','legacy_automatic_credit_note_email','off')`);
    await insert(client, "invoice-enabled", "enabled");
    await insert(client, "credit-enabled", "enabled", "nota_credito");
    await insert(client, "invoice-disabled", "disabled");
    await insert(client, "expired-after-send", "enabled", "factura", {
      status: "processing", lockedAt: "2026-07-26T10:00:00.000Z", lockedBy: "dead", attempts: 1
    });
    await client.query("UPDATE document_email_operations SET send_started_at='2026-07-26T10:01:00Z', smtp_message_id='<expired@factudarwin.local>' WHERE id='expired-after-send'");
  });
  const [a, b] = await Promise.all([first.claim("worker-a", 1), second.claim("worker-b", 1)]);
  assert.equal(a.length + b.length, 2);
  assert.notEqual(a[0].id, b[0].id);
  const claimed = [...a, ...b];
  for (const operation of claimed) {
    const prepared = await first.prepareSend(operation, operation.lockedBy, `<${operation.id}@factudarwin.local>`);
    await first.completeAccepted(prepared, operation.lockedBy, {
      messageId: prepared.smtpMessageId, accepted: ["cliente@example.test"], rejected: [],
      response: "250 queued", envelope: { fromDomain: "example.test", toCount: 1 }, elapsedMs: 4
    });
  }
  await first.markBlockedSendOperations();
  await first.recoverExpiredLeases("recovery", "2026-07-26T12:00:01.000Z");
  const report = await clientFor(process.env.DATABASE_URL, async (client) => (await client.query(
    "SELECT id,status,attempts,last_error_code,accepted_at,smtp_response FROM document_email_operations ORDER BY id"
  )).rows);
  assert.equal(report.filter((row) => row.status === "accepted").length, 2);
  assert.equal(report.find((row) => row.id === "invoice-disabled").attempts, 0);
  assert.equal(report.find((row) => row.id === "invoice-disabled").last_error_code, "COMPANY_SEND_NOT_ENABLED");
  assert.equal(report.find((row) => row.id === "expired-after-send").status, "uncertain");
  assert.equal(report.find((row) => row.id === "expired-after-send").last_error_code, "SMTP_DELIVERY_OUTCOME_UNCERTAIN");
  assert.equal((await first.claim("worker-c", 10)).length, 0);
  console.log(JSON.stringify({ accepted: 2, disabledAttempts: 0, expiredStatus: "uncertain" }));
  await first.close(); await second.close();
}
async function cleanup() {
  await clientFor(process.env.DATABASE_URL, async (client) => {
    await client.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [TEST_DATABASE]);
    await client.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE}`);
  });
}
const actions = { prepare, schema, cases, cleanup };
if (!actions[action]) process.exitCode = 2;
else actions[action]().catch((error) => { console.error(error); process.exitCode = 1; });
