const assert = require("node:assert/strict");
const { fork } = require("node:child_process");
const path = require("node:path");
const { Client } = require("pg");

const TEST_DATABASE = "factudarwin_email_worker_it";
const mode = process.argv[2];

require("dotenv").config();

function databaseUrl(databaseName) {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${databaseName}`;
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

async function prepare() {
  await withClient(process.env.DATABASE_URL, async (client) => {
    await client.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [TEST_DATABASE]
    );
    await client.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE}`);
    await client.query(`CREATE DATABASE ${TEST_DATABASE}`);
  });
  console.log(JSON.stringify({ prepared: TEST_DATABASE }));
}

async function schema() {
  process.env.DATABASE_URL = databaseUrl(TEST_DATABASE);
  process.env.AUTOMATIC_AUTHORIZATION_EMAIL_MODE = "simulate";
  const db = require("../db-postgres");
  await db.initialize();
  const result = await withClient(process.env.DATABASE_URL, async (client) => {
    const columns = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'document_email_operations'
         AND column_name IN ('simulated_at', 'simulation_result', 'simulation_worker_id')
       ORDER BY column_name`
    );
    return columns.rows.map((row) => row.column_name);
  });
  assert.deepEqual(result, ["simulated_at", "simulation_result", "simulation_worker_id"]);
  console.log(JSON.stringify({ simulationColumns: result }));
  await db.close();
}

function payload(options = {}) {
  return {
    delivery: { recipientEmail: options.email ?? "cliente@example.com" },
    authorizationSnapshot: {
      document: {
        id: options.documentId,
        status: "AUTORIZADA",
        authorizedXml: options.authorizedXml ?? "<autorizacion />",
        items: options.items ?? [{ id: "line-1" }]
      },
      issuer: options.issuer ?? { ruc: "1790012345001", businessName: "Empresa", address: "Quito" }
    }
  };
}

async function insertOperation(client, id, options = {}) {
  const now = options.now || "2026-07-26T12:00:00.000Z";
  const documentId = options.documentId || id;
  const operationPayload = payload({ ...options, documentId });
  await client.query(
    `INSERT INTO document_email_operations (
       id, company_id, document_type, document_id, origin, status,
       recipient_email, payload_json, payload_hash, attempts, max_attempts,
       next_attempt_at, retryable, locked_at, locked_by, created_at, updated_at
     ) VALUES (
       $1, $2, 'factura', $3, 'automatic_authorization', $4,
       $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14, $14
     )`,
    [
      id,
      options.companyId || "company-1",
      documentId,
      options.status || "pending",
      options.email ?? "cliente@example.com",
      JSON.stringify(operationPayload),
      `hash-${id}`,
      options.attempts || 0,
      options.maxAttempts || 5,
      options.nextAttemptAt || now,
      options.retryable !== false,
      options.lockedAt || null,
      options.lockedBy || null,
      now
    ]
  );
}

async function cases() {
  process.env.DATABASE_URL = databaseUrl(TEST_DATABASE);
  process.env.AUTOMATIC_AUTHORIZATION_EMAIL_MODE = "simulate";
  const {
    createDocumentEmailQueueRepository
  } = require("../document-email-queue");
  const { validateSimulation } = require("../document-email-worker");
  const firstRepository = createDocumentEmailQueueRepository({ connectionString: process.env.DATABASE_URL });
  const secondRepository = createDocumentEmailQueueRepository({ connectionString: process.env.DATABASE_URL });

  await withClient(process.env.DATABASE_URL, async (client) => {
    await insertOperation(client, "single-operation");
  });
  const [sameFirst, sameSecond] = await Promise.all([
    firstRepository.claim("worker-a", 1, "2026-07-26T12:01:00.000Z"),
    secondRepository.claim("worker-b", 1, "2026-07-26T12:01:00.000Z")
  ]);
  assert.equal(sameFirst.length + sameSecond.length, 1);
  const singleClaim = sameFirst[0] || sameSecond[0];
  assert.equal(singleClaim.attempts, 1);

  await withClient(process.env.DATABASE_URL, async (client) => {
    await client.query("SET lock_timeout = '500ms'");
    await client.query(
      "UPDATE document_email_operations SET last_error_message = 'transaction released' WHERE id = 'single-operation'"
    );
  });
  const singleRepository = sameFirst.length ? firstRepository : secondRepository;
  await singleRepository.completeSimulation(
    singleClaim,
    singleClaim.lockedBy,
    validateSimulation(singleClaim),
    "2026-07-26T12:02:00.000Z"
  );

  await withClient(process.env.DATABASE_URL, async (client) => {
    await insertOperation(client, "parallel-a");
    await insertOperation(client, "parallel-b");
  });
  const [parallelFirst, parallelSecond] = await Promise.all([
    firstRepository.claim("worker-a", 1, "2026-07-26T12:03:00.000Z"),
    secondRepository.claim("worker-b", 1, "2026-07-26T12:03:00.000Z")
  ]);
  assert.equal(parallelFirst.length, 1);
  assert.equal(parallelSecond.length, 1);
  assert.notEqual(parallelFirst[0].id, parallelSecond[0].id);
  await firstRepository.completeSimulation(
    parallelFirst[0],
    "worker-a",
    validateSimulation(parallelFirst[0]),
    "2026-07-26T12:04:00.000Z"
  );
  await secondRepository.completeSimulation(
    parallelSecond[0],
    "worker-b",
    validateSimulation(parallelSecond[0]),
    "2026-07-26T12:04:00.000Z"
  );

  await withClient(process.env.DATABASE_URL, async (client) => {
    await insertOperation(client, "max-attempts", { attempts: 5, maxAttempts: 5 });
    await insertOperation(client, "expired-lease", {
      status: "processing",
      attempts: 2,
      lockedAt: "2026-07-26T11:00:00.000Z",
      lockedBy: "dead-worker"
    });
    await insertOperation(client, "expired-max", {
      status: "processing",
      attempts: 5,
      maxAttempts: 5,
      lockedAt: "2026-07-26T11:00:00.000Z",
      lockedBy: "dead-worker"
    });
    await insertOperation(client, "incomplete-operation", { authorizedXml: "" });
    await insertOperation(client, "company-off-operation", { companyId: "company-off" });
    await client.query(
      `INSERT INTO company_feature_flags (company_id, feature, mode)
       VALUES ('company-off', 'automatic_authorization_email', 'off')`
    );
    await client.query(
      `INSERT INTO app_snapshots (id, data, updated_at)
       VALUES (1, $1::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
      [JSON.stringify({ sales: [{ id: "incomplete-operation", status: "AUTORIZADA" }] })]
    );
  });

  const recovered = await firstRepository.recoverExpiredLeases("recovery-worker", "2026-07-26T12:10:01.000Z");
  assert.equal(recovered.length, 2);
  const recoveredState = await withClient(process.env.DATABASE_URL, async (client) => {
    const result = await client.query(
      `SELECT id, status, retryable, locked_at AS "lockedAt", locked_by AS "lockedBy",
              last_error_code AS "lastErrorCode"
       FROM document_email_operations
       WHERE id IN ('expired-lease', 'expired-max')
       ORDER BY id`
    );
    return result.rows;
  });
  assert(recoveredState.every((row) => row.status === "failed" && row.lockedAt === null && row.lockedBy === null));
  assert(recoveredState.every((row) => row.lastErrorCode === "PROCESSING_LEASE_EXPIRED"));
  const incompleteClaim = await firstRepository.claim("worker-incomplete", 10, "2026-07-26T12:10:02.000Z");
  const incomplete = incompleteClaim.find((item) => item.id === "incomplete-operation");
  assert(incomplete);
  const incompleteResult = validateSimulation(incomplete);
  assert.equal(incompleteResult.errorCode, "AUTHORIZED_XML_MISSING");
  await firstRepository.completeSimulation(incomplete, "worker-incomplete", incompleteResult, "2026-07-26T12:11:00.000Z");

  for (const claimed of incompleteClaim.filter((item) => item.id !== "incomplete-operation")) {
    await firstRepository.completeSimulation(claimed, "worker-incomplete", validateSimulation(claimed), "2026-07-26T12:11:00.000Z");
  }

  const report = await withClient(process.env.DATABASE_URL, async (client) => {
    const result = await client.query(
      `SELECT id, status, attempts, retryable, locked_at AS "lockedAt",
              accepted_at AS "acceptedAt", simulated_at AS "simulatedAt",
              simulation_result AS "simulationResult", last_error_code AS "lastErrorCode"
       FROM document_email_operations
       ORDER BY id`
    );
    const snapshot = await client.query("SELECT data FROM app_snapshots WHERE id = 1");
    return {
      rows: result.rows,
      tributaryStatus: snapshot.rows[0].data.sales[0].status
    };
  });
  const byId = new Map(report.rows.map((row) => [row.id, row]));
  assert.equal(byId.get("single-operation").status, "pending");
  assert.equal(byId.get("single-operation").acceptedAt, null);
  assert(byId.get("single-operation").simulatedAt);
  assert.equal(byId.get("single-operation").simulationResult.resultCode, "SIMULATION_VALIDATED");
  assert.equal(byId.get("max-attempts").attempts, 5);
  assert.equal(byId.get("max-attempts").simulatedAt, null);
  assert.equal(byId.get("expired-max").retryable, false);
  assert.equal(byId.get("incomplete-operation").status, "failed");
  assert.equal(byId.get("incomplete-operation").lastErrorCode, "AUTHORIZED_XML_MISSING");
  assert.equal(byId.get("company-off-operation").attempts, 0);
  assert.equal(report.tributaryStatus, "AUTORIZADA");

  await withClient(process.env.DATABASE_URL, async (client) => {
    await insertOperation(client, "global-mode-gate");
  });

  console.log(JSON.stringify({
    sameOperationClaims: sameFirst.length + sameSecond.length,
    parallelClaims: [parallelFirst[0].id, parallelSecond[0].id],
    transactionReleased: true,
    recoveredLeases: recovered.map((item) => item.id),
    tributaryStatus: report.tributaryStatus,
    acceptedRows: report.rows.filter((row) => row.acceptedAt).length
  }));
  await firstRepository.close();
  await secondRepository.close();
}

async function gate() {
  process.env.DATABASE_URL = databaseUrl(TEST_DATABASE);
  const requestedMode = process.argv[3] || "off";
  process.env.AUTOMATIC_AUTHORIZATION_EMAIL_MODE = requestedMode;
  const config = require("../config");
  const { createDocumentEmailQueueRepository } = require("../document-email-queue");
  const repository = createDocumentEmailQueueRepository({ connectionString: process.env.DATABASE_URL });
  const claimed = await repository.claim(`gate-${requestedMode}`, 1, "2026-07-26T12:20:00.000Z");
  assert.equal(claimed.length, requestedMode === "simulate" ? 1 : 0);
  console.log(JSON.stringify({ requestedMode, effectiveMode: config.automaticAuthorizationEmailMode, claimed: claimed.length }));
  await repository.close();
}

async function lifecycle() {
  const connectionString = databaseUrl(TEST_DATABASE);
  await withClient(connectionString, async (client) => {
    await client.query("DELETE FROM document_email_operations WHERE id = 'lifecycle-operation'");
    await insertOperation(client, "lifecycle-operation");
  });

  const serverPath = path.resolve(__dirname, "..", "server.js");
  const child = fork(serverPath, [], {
    cwd: path.resolve(__dirname, "..", ".."),
    env: {
      ...process.env,
      DATABASE_URL: connectionString,
      AUTOMATIC_AUTHORIZATION_EMAIL_MODE: "simulate",
      NODE_ENV: "development",
      SRI_ENV: "test",
      PORT: "0",
      PG_BACKUP_ENABLED: "false"
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"]
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`El backend no inicio a tiempo. ${output}`)), 10000);
    const inspect = () => {
      if (!output.includes("email_queue_simulated")) return;
      clearTimeout(timeout);
      resolve();
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`El backend termino antes de la simulacion (${code}). ${output}`));
    });
  });

  child.send("shutdown");
  const exit = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`El backend no se detuvo limpiamente. ${output}`));
    }, 10000);
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });

  const stored = await withClient(connectionString, async (client) => {
    const result = await client.query(
      `SELECT status, simulated_at AS "simulatedAt", accepted_at AS "acceptedAt",
              locked_at AS "lockedAt", locked_by AS "lockedBy"
       FROM document_email_operations WHERE id = 'lifecycle-operation'`
    );
    return result.rows[0];
  });
  assert.equal(stored.status, "pending");
  assert(stored.simulatedAt);
  assert.equal(stored.acceptedAt, null);
  assert.equal(stored.lockedAt, null);
  assert.equal(stored.lockedBy, null);
  assert(output.includes("\"event\":\"backend_shutdown\""));
  console.log(JSON.stringify({ exit, simulated: true, unlocked: true }));
}

async function cleanup() {
  await withClient(process.env.DATABASE_URL, async (client) => {
    await client.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [TEST_DATABASE]
    );
    await client.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE}`);
  });
  console.log(JSON.stringify({ removed: TEST_DATABASE }));
}

const actions = { prepare, schema, cases, gate, lifecycle, cleanup };

if (!actions[mode]) {
  console.error("Use: prepare | schema | cases | gate <off|simulate|send> | lifecycle | cleanup");
  process.exitCode = 2;
} else {
  actions[mode]().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
