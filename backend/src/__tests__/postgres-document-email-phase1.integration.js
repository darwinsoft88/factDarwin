const assert = require("node:assert/strict");
const { Client } = require("pg");

const TEST_DATABASE = "factudarwin_phase1_it";
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

async function verifySchema() {
  process.env.DATABASE_URL = databaseUrl(TEST_DATABASE);
  const db = require("../db-postgres");
  await db.initialize();
  const result = await withClient(process.env.DATABASE_URL, async (client) => {
    const tables = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('company_feature_flags', 'document_email_operations')
       ORDER BY table_name`
    );
    const indexes = await client.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'document_email_operations'
       ORDER BY indexname`
    );
    return {
      tables: tables.rows.map((row) => row.table_name),
      indexes: indexes.rows.map((row) => row.indexname)
    };
  });
  assert.deepEqual(result.tables, ["company_feature_flags", "document_email_operations"]);
  assert(result.indexes.includes("uq_document_email_automatic"));
  console.log(JSON.stringify(result));
  await db.close();
}

function baseData(sales) {
  return {
    users: [],
    clients: [{
      id: "client-1",
      identification: "1712345678",
      identificationType: "CEDULA",
      name: "Cliente Integracion",
      email: "cliente@example.com",
      address: "Quito"
    }],
    products: [],
    sales,
    creditPayments: [],
    creditAdjustments: [],
    inventoryMovements: [],
    auditLogs: [],
    guides: [],
    cashClosings: [],
    receivedRetentions: [],
    issuer: {
      ruc: "1790012345001",
      businessName: "Empresa Integracion",
      tradeName: "Empresa Integracion",
      address: "Quito",
      environment: "1",
      establishment: "001",
      emissionPoint: "001",
      sequential: 1,
      establishments: []
    }
  };
}

function document(id, documentType = "factura", overrides = {}) {
  return {
    id,
    documentType,
    clientId: "client-1",
    userId: "",
    status: "PENDIENTE_SRI",
    sequence: "000000001",
    establishment: "001",
    emissionPoint: "001",
    accessKey: `access-${id}-${documentType}`,
    authorizationNumber: "",
    authorizationDate: "",
    authorizedXml: "",
    subtotal: 10,
    tax: 1.5,
    total: 11.5,
    createdAt: "2026-07-26T12:00:00.000Z",
    items: [{
      id: `line-${id}-${documentType}`,
      code: "P1",
      name: "Producto",
      quantity: 1,
      unitPrice: 10,
      ivaRate: 0.15
    }],
    ...overrides
  };
}

function authorize(item, overrides = {}) {
  return {
    ...item,
    status: "AUTORIZADA",
    authorizationNumber: `authorization-${item.id}-${item.documentType}`,
    authorizationDate: "2026-07-26T12:05:00.000Z",
    authorizedXml: "<autorizacion />",
    ...overrides
  };
}

async function countOperations(client, where = "TRUE", params = []) {
  const result = await client.query(
    `SELECT status, document_type, document_id, count(*)::integer AS count
     FROM document_email_operations WHERE ${where}
     GROUP BY status, document_type, document_id
     ORDER BY document_id, document_type, status`,
    params
  );
  return result.rows;
}

async function runCases() {
  process.env.DATABASE_URL = databaseUrl(TEST_DATABASE);
  const db = require("../db-postgres");
  const config = require("../config");
  const {
    buildAutomaticEmailOperation,
    insertAutomaticEmailOperation
  } = require("../document-email-operations");
  await db.initialize();

  const initialDocuments = [
    document("invoice-transition"),
    document("invoice-concurrent"),
    document("invoice-rollback"),
    document("invoice-incomplete"),
    document("not-authorized"),
    document("proforma-1", "proforma", { status: "PROFORMA" }),
    document("ticket-1", "ticket", { status: "PENDIENTE" })
  ];
  await db.saveSnapshot(baseData(initialDocuments));

  const invoiceAuthorized = authorize(initialDocuments[0]);
  await db.mergeSnapshotPatch({ sales: [invoiceAuthorized] });
  await db.mergeSnapshotPatch({ sales: [invoiceAuthorized] });

  const concurrentAuthorized = authorize(initialDocuments[1]);
  await Promise.all([
    db.mergeSnapshotPatch({ sales: [concurrentAuthorized] }),
    db.mergeSnapshotPatch({ sales: [concurrentAuthorized] })
  ]);

  await db.mergeSnapshotPatch({ sales: [authorize(initialDocuments[5])] });
  await db.mergeSnapshotPatch({ sales: [authorize(initialDocuments[6])] });
  await db.mergeSnapshotPatch({ sales: [{ ...initialDocuments[4], sriMessage: "Todavia pendiente" }] });

  const incompleteAuthorized = authorize(initialDocuments[3], { authorizedXml: "" });
  await db.mergeSnapshotPatch({ sales: [incompleteAuthorized] });

  const rollbackBefore = await db.getSnapshot();
  await withClient(process.env.DATABASE_URL, async (client) => {
    await client.query(`
      CREATE OR REPLACE FUNCTION fail_phase1_after_operation() RETURNS trigger AS $$
      BEGIN
        IF NEW.event = 'APP_INCREMENTAL_MERGE' THEN
          RAISE EXCEPTION 'phase1 forced rollback';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER phase1_force_rollback
      BEFORE INSERT ON audit_log
      FOR EACH ROW EXECUTE FUNCTION fail_phase1_after_operation();
    `);
  });
  let rollbackError = "";
  try {
    await db.mergeSnapshotPatch({ sales: [authorize(initialDocuments[2])] });
  } catch (error) {
    rollbackError = error.message;
  }
  assert.match(rollbackError, /phase1 forced rollback/);
  await withClient(process.env.DATABASE_URL, async (client) => {
    await client.query("DROP TRIGGER phase1_force_rollback ON audit_log");
    await client.query("DROP FUNCTION fail_phase1_after_operation()");
  });
  const rollbackAfter = await db.getSnapshot();
  const rolledBackDocument = rollbackAfter.data.sales.find((item) => item.id === "invoice-rollback");
  assert.equal(rolledBackDocument.status, "PENDIENTE_SRI");
  assert.equal(
    rollbackBefore.data.sales.find((item) => item.id === "invoice-rollback").status,
    rolledBackDocument.status
  );

  await withClient(process.env.DATABASE_URL, async (client) => {
    const finalData = baseData([]);
    const sharedInvoice = authorize(document("shared-document-id"));
    const sharedCredit = authorize(document("shared-document-id", "nota_credito"));
    const invoiceOperation = buildAutomaticEmailOperation(
      "same-company",
      { ...finalData, sales: [sharedInvoice] },
      { document: sharedInvoice, documentType: "factura" }
    );
    const creditOperation = buildAutomaticEmailOperation(
      "same-company",
      { ...finalData, sales: [sharedCredit] },
      { document: sharedCredit, documentType: "nota_credito" }
    );
    await client.query("BEGIN");
    await insertAutomaticEmailOperation(client, invoiceOperation);
    await insertAutomaticEmailOperation(client, creditOperation);
    await client.query("COMMIT");
  });

  const report = await withClient(process.env.DATABASE_URL, async (client) => {
    const version = await client.query("SHOW server_version");
    const allRows = await countOperations(client);
    const rollbackRows = await countOperations(client, "document_id = $1", ["invoice-rollback"]);
    const ignoredRows = await countOperations(
      client,
      "document_id = ANY($1::text[])",
      [["not-authorized", "proforma-1", "ticket-1"]]
    );
    const flags = await client.query("SELECT company_id, feature, mode FROM company_feature_flags");
    return {
      postgresVersion: version.rows[0].server_version,
      automaticAuthorizationEmailMode: config.automaticAuthorizationEmailMode,
      featureFlagRows: flags.rowCount,
      operations: allRows,
      rollbackRows,
      ignoredRows,
      snapshotRollbackStatus: rolledBackDocument.status
    };
  });

  assert.equal(config.automaticAuthorizationEmailMode, "off");
  assert.equal(report.featureFlagRows, 0);
  assert.deepEqual(report.rollbackRows, []);
  assert.deepEqual(report.ignoredRows, []);
  assert.deepEqual(
    report.operations.filter((row) => row.document_id === "invoice-transition").map((row) => row.count),
    [1]
  );
  assert.deepEqual(
    report.operations.filter((row) => row.document_id === "invoice-concurrent").map((row) => row.count),
    [1]
  );
  assert.deepEqual(
    report.operations.filter((row) => row.document_id === "shared-document-id").map((row) => row.document_type),
    ["factura", "nota_credito"]
  );
  assert.equal(
    report.operations.find((row) => row.document_id === "invoice-incomplete").status,
    "failed"
  );
  console.log(JSON.stringify(report));
  await db.close();
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

const actions = { prepare, schema: verifySchema, cases: runCases, cleanup };

if (!actions[mode]) {
  console.error("Use: prepare | schema | cases | cleanup");
  process.exitCode = 2;
} else {
  actions[mode]().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
