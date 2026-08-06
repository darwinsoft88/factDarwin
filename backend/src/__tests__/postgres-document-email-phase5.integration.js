const assert = require("node:assert/strict");
const { fork } = require("node:child_process");
const path = require("node:path");
const { Client } = require("pg");
require("dotenv").config();

const TEST_DATABASE = "factudarwin_email_phase5_it";
const PORT = 4197;

function databaseUrl(name) {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

async function withClient(connectionString, callback) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function request(pathname, options = {}) {
  const response = await fetch(`http://127.0.0.1:${PORT}${pathname}`, options);
  const body = await response.json();
  return { status: response.status, body };
}

async function waitForBackend(child, output) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`El backend termino antes de iniciar. ${output()}`);
    try {
      const response = await request("/api/admin/email-operations");
      if (response.status !== 503) return;
    } catch {
      // El proceso todavia no escucha.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("El backend no inicio la cola administrativa a tiempo.");
}

async function main() {
  await withClient(process.env.DATABASE_URL, async (client) => {
    await client.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [TEST_DATABASE]);
    await client.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE}`);
    await client.query(`CREATE DATABASE ${TEST_DATABASE}`);
  });

  const connectionString = databaseUrl(TEST_DATABASE);
  const child = fork(path.join(__dirname, "..", "server.js"), [], {
    cwd: path.join(__dirname, "..", ".."),
    env: {
      ...process.env,
      DATABASE_URL: connectionString,
      PORT: String(PORT),
      NODE_ENV: "development",
      SRI_ENV: "test",
      AUTH_REQUIRED: "false",
      AUTOMATIC_AUTHORIZATION_EMAIL_MODE: "off",
      PG_BACKUP_ENABLED: "false"
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"]
  });
  let childOutput = "";
  child.stdout.on("data", (chunk) => { childOutput += chunk.toString(); });
  child.stderr.on("data", (chunk) => { childOutput += chunk.toString(); });

  try {
    await waitForBackend(child, () => childOutput);
    await withClient(connectionString, async (client) => {
      await client.query(
        `INSERT INTO document_email_operations
          (id,company_id,document_type,document_id,origin,status,recipient_email,payload_json,payload_hash,retryable,accepted_at)
         VALUES
          ('phase5-failed','','factura','invoice-1','automatic_authorization','failed','cliente@example.test','{}'::jsonb,'hash-1',FALSE,NULL),
          ('phase5-accepted','','factura','invoice-2','automatic_authorization','accepted','cliente@example.test','{}'::jsonb,'hash-2',FALSE,NOW())`,
      );
    });

    const listed = await request("/api/admin/email-operations?status=failed");
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.body.operations.map((operation) => operation.id), ["phase5-failed"]);
    assert.equal(listed.body.operations[0].recipientMasked, "cl***@example.test");
    assert.equal(Object.prototype.hasOwnProperty.call(listed.body.operations[0], "recipientEmail"), false);

    const invalid = await request("/api/admin/email-operations?status=desconocido");
    assert.equal(invalid.status, 400);

    const retried = await request("/api/admin/email-operations/phase5-failed/retry", { method: "POST" });
    assert.equal(retried.status, 200);
    assert.equal(retried.body.operation.status, "pending");
    assert.equal(retried.body.operation.id, "phase5-failed");

    const acceptedRetry = await request("/api/admin/email-operations/phase5-accepted/retry", { method: "POST" });
    assert.equal(acceptedRetry.status, 409);

    console.log(JSON.stringify({
      listedStatuses: ["failed"],
      recipientMasked: true,
      manualRetry: "pending",
      acceptedRetryStatus: acceptedRetry.status
    }));
  } finally {
    if (child.connected) child.send("shutdown");
    if (child.exitCode === null) await new Promise((resolve) => child.once("exit", resolve));
    await withClient(process.env.DATABASE_URL, async (client) => {
      await client.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [TEST_DATABASE]);
      await client.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE}`);
    });
    if (process.exitCode) console.error(childOutput);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
