const assert = require("node:assert/strict");
const { Client } = require("pg");

const TEST_DATABASE = "factudarwin_email_builder_it";
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
  await db.close();
  console.log(JSON.stringify({ schema: "ready" }));
}

function durablePayload(id, options = {}) {
  const documentType = options.documentType || "factura";
  const accessKey = options.accessKey || `260720260117900123450011001001${String(id.length).padStart(9, "0")}1234567813`;
  const document = {
    id,
    documentType,
    status: "AUTORIZADA",
    accessKey,
    authorizationNumber: accessKey,
    authorizationDate: "2026-07-26T12:00:00.000Z",
    authorizedXml: options.authorizedXml ?? `<factura><infoTributaria><codDoc>${documentType === "nota_credito" ? "04" : "01"}</codDoc><claveAcceso>${accessKey}</claveAcceso></infoTributaria>${options.xmlPadding || ""}</factura>`,
    establishment: "001",
    emissionPoint: "001",
    sequence: documentType === "nota_credito" ? "000000010" : "000000123",
    createdAt: "2026-07-26T10:00:00.000Z",
    subtotal: 10,
    tax: 1.5,
    total: 11.5,
    paymentMethod: "01",
    creditReason: documentType === "nota_credito" ? "Devolucion" : undefined,
    supportDocumentNumber: documentType === "nota_credito" ? "001-001-000000001" : undefined,
    supportIssueDate: documentType === "nota_credito" ? "2026-07-20T10:00:00.000Z" : undefined,
    items: options.items ?? [{ id: "line-1", code: "P1", name: "Producto", quantity: 1, unitPrice: 10, discount: 0, ivaRate: 0.15 }]
  };
  return {
    schemaVersion: 1,
    delivery: { recipientEmail: options.email ?? "cliente@example.com" },
    authorizationSnapshot: {
      capturedAt: "2026-07-26T12:00:00.000Z",
      document,
      client: {
        id: "client-1",
        name: "Cliente Integracion",
        identification: "1712345678",
        address: "Quito"
      },
      issuer: {
        ruc: "1790012345001",
        businessName: "Empresa Integracion",
        address: "Quito",
        environment: "1",
        establishment: "001",
        emissionPoint: "001"
      },
      sourceDocument: null
    }
  };
}

async function insertOperation(client, id, options = {}) {
  const payload = durablePayload(id, options);
  const document = payload.authorizationSnapshot.document;
  await client.query(
    `INSERT INTO document_email_operations (
       id, company_id, document_type, document_id, origin, status,
       recipient_email, payload_json, payload_hash, attempts, max_attempts,
       next_attempt_at, retryable, created_at, updated_at
     ) VALUES (
       $1, 'company-1', $2, $3, 'automatic_authorization', 'pending',
       $4, $5::jsonb, $6, 0, 5, NOW(), TRUE, NOW(), NOW()
     )`,
    [id, document.documentType, document.id, options.email ?? "cliente@example.com", JSON.stringify(payload), `hash-${id}`]
  );
}

async function waitForBuilds(connectionString, expected) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const count = await withClient(connectionString, async (client) => {
      const result = await client.query(
        "SELECT count(*)::integer AS count FROM document_email_operations WHERE simulation_result IS NOT NULL"
      );
      return result.rows[0].count;
    });
    if (count >= expected) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("El trabajador no termino las construcciones esperadas.");
}

async function cases() {
  process.env.DATABASE_URL = databaseUrl(TEST_DATABASE);
  process.env.AUTOMATIC_AUTHORIZATION_EMAIL_MODE = "simulate";
  process.env.EMAIL_MAX_XML_BYTES = "1024";
  const { createDocumentEmailQueueRepository } = require("../document-email-queue");
  const { createDocumentEmailWorker } = require("../document-email-worker");
  const connectionString = process.env.DATABASE_URL;

  await withClient(connectionString, async (client) => {
    await insertOperation(client, "valid-invoice");
    await insertOperation(client, "valid-credit-note", { documentType: "nota_credito" });
    await insertOperation(client, "missing-xml", { authorizedXml: "" });
    await insertOperation(client, "invalid-recipient", { email: "correo-invalido" });
    await insertOperation(client, "incomplete-document", { items: [] });
    await insertOperation(client, "oversized-xml", { xmlPadding: `<detalle>${"x".repeat(1500)}</detalle>` });
    await client.query(
      `INSERT INTO app_snapshots (id, data, updated_at)
       VALUES (1, $1::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
      [JSON.stringify({
        sales: [
          { id: "valid-invoice", status: "AUTORIZADA" },
          { id: "valid-credit-note", status: "AUTORIZADA" },
          { id: "missing-xml", status: "AUTORIZADA" },
          { id: "invalid-recipient", status: "AUTORIZADA" },
          { id: "incomplete-document", status: "AUTORIZADA" },
          { id: "oversized-xml", status: "AUTORIZADA" }
        ]
      })]
    );
  });

  const repository = createDocumentEmailQueueRepository({ connectionString });
  const worker = createDocumentEmailWorker({
    repository,
    workerId: "phase3-integration-worker",
    batchSize: 10,
    schedule() {
      return 1;
    },
    cancelSchedule() {}
  });
  worker.start();
  await waitForBuilds(connectionString, 6);
  await worker.stop();

  const report = await withClient(connectionString, async (client) => {
    const operations = await client.query(
      `SELECT id, status, retryable, attempts, accepted_at AS "acceptedAt",
              simulation_result AS "simulationResult", last_error_code AS "lastErrorCode",
              locked_at AS "lockedAt", locked_by AS "lockedBy"
       FROM document_email_operations ORDER BY id`
    );
    const snapshot = await client.query("SELECT data FROM app_snapshots WHERE id = 1");
    return { rows: operations.rows, snapshot: snapshot.rows[0].data };
  });
  const byId = new Map(report.rows.map((row) => [row.id, row]));

  for (const id of ["valid-invoice", "valid-credit-note"]) {
    assert.equal(byId.get(id).status, "pending");
    assert.equal(byId.get(id).simulationResult.resultCode, "EMAIL_BUILD_VALIDATED");
    assert.equal(byId.get(id).acceptedAt, null);
    assert.equal(byId.get(id).lockedAt, null);
    assert.equal(byId.get(id).lockedBy, null);
    assert.equal(byId.get(id).simulationResult.attachments.length, 2);
    const serialized = JSON.stringify(byId.get(id).simulationResult);
    assert(!serialized.includes("cliente@example.com"));
    assert(!serialized.includes("<factura>"));
    assert(!serialized.includes("%PDF-"));
  }
  assert.equal(byId.get("missing-xml").lastErrorCode, "AUTHORIZED_XML_MISSING");
  assert.equal(byId.get("invalid-recipient").lastErrorCode, "RECIPIENT_INVALID");
  assert.equal(byId.get("incomplete-document").lastErrorCode, "RIDE_DATA_INCOMPLETE");
  assert.equal(byId.get("oversized-xml").lastErrorCode, "ATTACHMENT_TOO_LARGE");
  assert(report.snapshot.sales.every((document) => document.status === "AUTORIZADA"));
  assert.equal(report.rows.filter((row) => row.status === "accepted" || row.acceptedAt).length, 0);
  assert.equal(report.rows.length, 6);

  const rollbackRepository = createDocumentEmailQueueRepository({ connectionString });
  await withClient(connectionString, async (client) => {
    await insertOperation(client, "rollback-build");
  });
  const claimed = await rollbackRepository.claim("rollback-worker", 1);
  assert.equal(claimed.length, 1);
  await withClient(connectionString, async (client) => {
    await client.query(`
      CREATE OR REPLACE FUNCTION fail_phase3_build_result() RETURNS trigger AS $$
      BEGIN
        IF NEW.id = 'rollback-build' AND NEW.simulation_result IS NOT NULL THEN
          RAISE EXCEPTION 'phase3 forced rollback';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER phase3_force_rollback
      BEFORE UPDATE ON document_email_operations
      FOR EACH ROW EXECUTE FUNCTION fail_phase3_build_result();
    `);
  });
  await assert.rejects(
    rollbackRepository.completeSimulation(claimed[0], "rollback-worker", {
      valid: true,
      resultCode: "EMAIL_BUILD_VALIDATED",
      attachments: []
    }),
    /phase3 forced rollback/
  );
  const rollback = await withClient(connectionString, async (client) => {
    const result = await client.query(
      `SELECT status, simulation_result AS "simulationResult", accepted_at AS "acceptedAt"
       FROM document_email_operations WHERE id = 'rollback-build'`
    );
    await client.query("DROP TRIGGER phase3_force_rollback ON document_email_operations");
    await client.query("DROP FUNCTION fail_phase3_build_result()");
    return result.rows[0];
  });
  assert.equal(rollback.status, "processing");
  assert.equal(rollback.simulationResult, null);
  assert.equal(rollback.acceptedAt, null);
  await rollbackRepository.close();

  console.log(JSON.stringify({
    invoice: byId.get("valid-invoice").simulationResult.resultCode,
    creditNote: byId.get("valid-credit-note").simulationResult.resultCode,
    permanentErrors: ["AUTHORIZED_XML_MISSING", "RECIPIENT_INVALID", "RIDE_DATA_INCOMPLETE", "ATTACHMENT_TOO_LARGE"],
    acceptedRows: 0,
    tributaryStatuses: report.snapshot.sales.map((document) => document.status),
    rollback: "confirmed"
  }));
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

const actions = { prepare, schema, cases, cleanup };

if (!actions[mode]) {
  console.error("Use: prepare | schema | cases | cleanup");
  process.exitCode = 2;
} else {
  actions[mode]().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
