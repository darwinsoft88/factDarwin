const assert = require("node:assert/strict");
const { Client } = require("pg");

const TEST_DATABASE = "factudarwin_phase31_it";
const EXISTING_DATABASE = "factudarwin_phase31_existing_it";

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

function baseData() {
  return {
    users: [],
    clients: [{
      id: "client-1",
      identification: "1712345678",
      identificationType: "CEDULA",
      name: "Cliente inicial",
      email: "cliente@example.com",
      updatedAt: "2026-07-31T10:00:00.000Z"
    }],
    products: [],
    sales: [],
    creditPayments: [],
    creditAdjustments: [],
    inventoryMovements: [],
    auditLogs: [],
    guides: [],
    cashClosings: [],
    receivedRetentions: [],
    issuer: {
      ruc: "1790012345001",
      businessName: "Empresa fase 3.1",
      tradeName: "Empresa fase 3.1",
      address: "Quito",
      environment: "1",
      establishment: "001",
      emissionPoint: "001",
      sequential: 1,
      establishments: []
    }
  };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log(JSON.stringify({ skipped: true, reason: "DATABASE_URL ausente" }));
    return;
  }

  await withClient(process.env.DATABASE_URL, async (client) => {
    await client.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [TEST_DATABASE]
    );
    await client.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE}`);
    await client.query(`CREATE DATABASE ${TEST_DATABASE}`);
    await client.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [EXISTING_DATABASE]
    );
    await client.query(`DROP DATABASE IF EXISTS ${EXISTING_DATABASE}`);
    await client.query(`CREATE DATABASE ${EXISTING_DATABASE}`);
  });

  const migrationSql = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", "migrations", "004-sync-change-log.sql"),
    "utf8"
  );
  const existingMigration = await withClient(databaseUrl(EXISTING_DATABASE), async (client) => {
    await client.query("CREATE TABLE legacy_marker (id integer PRIMARY KEY, value text NOT NULL)");
    await client.query("INSERT INTO legacy_marker (id, value) VALUES (1, 'preserve-me')");
    await client.query(migrationSql);
    await client.query(migrationSql);
    const marker = await client.query("SELECT value FROM legacy_marker WHERE id = 1");
    const table = await client.query("SELECT to_regclass('public.sync_change_log') AS name");
    return { marker: marker.rows[0].value, table: table.rows[0].name };
  });
  assert.deepEqual(existingMigration, { marker: "preserve-me", table: "sync_change_log" });

  process.env.DATABASE_URL = databaseUrl(TEST_DATABASE);
  process.env.NODE_ENV = "test";
  process.env.INCREMENTAL_SYNC_SHADOW_ENABLED = "true";
  process.env.INCREMENTAL_SYNC_MODE = "shadow";
  process.env.INCREMENTAL_SYNC_CONFIG_VERSION = "1";
  process.env.INCREMENTAL_SYNC_ENVIRONMENT = "test";
  const db = require("../db-postgres");
  const { hashSyncPayload } = require("../db-utils");
  const companyId = "company-phase31";

  await db.initialize();
  await withClient(process.env.DATABASE_URL, async (client) => {
    await client.query(
      `INSERT INTO saas_companies
       (id, ruc, business_name, trade_name, email, phone, status, created_at, updated_at)
       VALUES ($1, '1790012345001', 'Empresa fase 3.1', '', 'admin@example.com', '', 'active', now(), now())`,
      [companyId]
    );
  });

  await db.saveSnapshot(baseData(), companyId);
  await withClient(process.env.DATABASE_URL, (client) =>
    client.query("DELETE FROM sync_change_log WHERE company_id = $1", [companyId])
  );

  const patch = {
    clients: [{
      ...baseData().clients[0],
      name: "Cliente actualizado",
      updatedAt: "2026-07-31T11:00:00.000Z"
    }]
  };
  const syncOperation = {
    requestId: "request-phase31-1",
    operationType: "SYNC_MERGE",
    operationId: null,
    payloadHash: hashSyncPayload(patch)
  };
  await db.mergeSnapshotPatch(patch, companyId, syncOperation);
  await db.mergeSnapshotPatch(patch, companyId, syncOperation);
  const conflictingPatch = { clients: [{ ...patch.clients[0], name: "Contenido diferente" }] };
  await assert.rejects(
    db.mergeSnapshotPatch(conflictingPatch, companyId, {
      ...syncOperation,
      payloadHash: hashSyncPayload(conflictingPatch)
    }),
    (error) => error?.code === "SYNC_OPERATION_MISMATCH"
  );

  const idempotentRows = await withClient(process.env.DATABASE_URL, (client) =>
    client.query(
      `SELECT action, record_version AS "recordVersion", request_id AS "requestId"
       FROM sync_change_log WHERE company_id = $1 AND entity_id = 'client-1'
       ORDER BY change_seq`,
      [companyId]
    )
  );
  assert.equal(idempotentRows.rowCount, 1);
  assert.equal(idempotentRows.rows[0].requestId, syncOperation.requestId);

  const createProductPatch = {
    products: [{
      id: "product-1",
      code: "P1",
      name: "Producto creado",
      price: 10,
      stock: 2,
      operationId: "product-operation-create",
      updatedAt: "2026-07-31T12:00:00.000Z"
    }]
  };
  await db.mergeSnapshotPatch(createProductPatch, companyId, {
    requestId: "request-product-create",
    operationType: "SYNC_MERGE",
    operationId: null,
    payloadHash: hashSyncPayload(createProductPatch)
  });
  const productCreated = await withClient(process.env.DATABASE_URL, (client) =>
    client.query(
      `SELECT change_seq AS "changeSeq", company_id AS "companyId", entity_id AS "entityId",
              action, record_version AS "recordVersion", payload_hash AS "payloadHash",
              request_id AS "requestId", operation_id AS "operationId",
              transaction_id AS "transactionId", payload
       FROM sync_change_log WHERE company_id = $1 AND entity_id = 'product-1'
       ORDER BY change_seq`,
      [companyId]
    )
  );
  assert.equal(productCreated.rowCount, 1);
  assert.equal(productCreated.rows[0].action, "UPSERT");
  assert.equal(productCreated.rows[0].recordVersion, "1");
  assert.equal(productCreated.rows[0].operationId, "product-operation-create");
  assert.match(productCreated.rows[0].payloadHash, /^[a-f0-9]{64}$/);
  assert.match(productCreated.rows[0].transactionId, /^[a-f0-9-]{36}$/);

  const updateProductPatch = {
    products: [{
      ...createProductPatch.products[0],
      name: "Producto actualizado",
      operationId: "product-operation-update",
      updatedAt: "2026-07-31T13:00:00.000Z"
    }]
  };
  await db.mergeSnapshotPatch(updateProductPatch, companyId, {
    requestId: "request-product-update",
    operationType: "SYNC_MERGE",
    operationId: null,
    payloadHash: hashSyncPayload(updateProductPatch)
  });
  const productUpdated = await withClient(process.env.DATABASE_URL, (client) =>
    client.query(
      `SELECT change_seq AS "changeSeq", record_version AS "recordVersion",
              payload_hash AS "payloadHash", payload->>'name' AS name
       FROM sync_change_log WHERE company_id = $1 AND entity_id = 'product-1'
       ORDER BY change_seq`,
      [companyId]
    )
  );
  assert.equal(productUpdated.rowCount, 2);
  assert.deepEqual(productUpdated.rows.map((row) => row.recordVersion), ["1", "2"]);
  assert(productUpdated.rows[1].changeSeq > productUpdated.rows[0].changeSeq);
  assert.notEqual(productUpdated.rows[1].payloadHash, productUpdated.rows[0].payloadHash);
  assert.equal(productUpdated.rows[1].name, "Producto actualizado");

  await db.mergeSnapshotPatch({ deletions: { clients: ["client-1"] } }, companyId, {
    requestId: "request-phase31-delete",
    operationType: "SYNC_MERGE",
    operationId: null,
    payloadHash: hashSyncPayload({ deletions: { clients: ["client-1"] } })
  });
  const tombstone = await withClient(process.env.DATABASE_URL, (client) =>
    client.query(
      `SELECT action, is_tombstone AS "isTombstone", payload, record_version AS "recordVersion"
       FROM sync_change_log WHERE company_id = $1 AND entity_id = 'client-1'
       ORDER BY change_seq DESC LIMIT 1`,
      [companyId]
    )
  );
  assert.deepEqual(tombstone.rows[0], {
    action: "DELETE",
    isTombstone: true,
    payload: null,
    recordVersion: "2"
  });

  const beforeSnapshotFailure = await db.getSnapshot(companyId);
  const beforeSnapshotFailureLogCount = await withClient(process.env.DATABASE_URL, async (client) => {
    const result = await client.query("SELECT count(*)::int AS count FROM sync_change_log WHERE company_id = $1", [companyId]);
    return result.rows[0].count;
  });
  await assert.rejects(
    db.mergeSnapshotPatch({ clients: [
      { id: "duplicate-a", identification: "0999999999", name: "A", updatedAt: "2026-07-31T14:00:00.000Z" },
      { id: "duplicate-b", identification: "0999999999", name: "B", updatedAt: "2026-07-31T14:00:01.000Z" }
    ] }, companyId)
  );
  const afterSnapshotFailure = await db.getSnapshot(companyId);
  const afterSnapshotFailureLogCount = await withClient(process.env.DATABASE_URL, async (client) => {
    const result = await client.query("SELECT count(*)::int AS count FROM sync_change_log WHERE company_id = $1", [companyId]);
    return result.rows[0].count;
  });
  assert.deepEqual(afterSnapshotFailure.data.clients, beforeSnapshotFailure.data.clients);
  assert.equal(afterSnapshotFailureLogCount, beforeSnapshotFailureLogCount);
  const normalizedAfterSnapshotFailure = await withClient(process.env.DATABASE_URL, async (client) => {
    const result = await client.query(
      "SELECT count(*)::int AS count FROM clients WHERE company_id = $1 AND identification = '0999999999'",
      [companyId]
    );
    return result.rows[0].count;
  });
  assert.equal(normalizedAfterSnapshotFailure, 0);

  const beforeRollback = await db.getSnapshot(companyId);
  await withClient(process.env.DATABASE_URL, async (client) => {
    await client.query(`
      CREATE OR REPLACE FUNCTION reject_phase31_change() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'PHASE31_FORCED_ROLLBACK';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER trg_reject_phase31_change
      BEFORE INSERT ON sync_change_log
      FOR EACH ROW EXECUTE FUNCTION reject_phase31_change();
    `);
  });
  await assert.rejects(
    db.mergeSnapshotPatch({ products: [{ id: "product-rollback", code: "R1", name: "No persistir", price: 1, stock: 0 }] }, companyId),
    /PHASE31_FORCED_ROLLBACK/
  );
  const afterRollback = await db.getSnapshot(companyId);
  assert.deepEqual(afterRollback.data.products, beforeRollback.data.products);
  const normalizedAfterChangeLogFailure = await withClient(process.env.DATABASE_URL, async (client) => {
    const result = await client.query(
      "SELECT count(*)::int AS count FROM products WHERE company_id = $1 AND code = 'R1'",
      [companyId]
    );
    return result.rows[0].count;
  });
  assert.equal(normalizedAfterChangeLogFailure, 0);
  await withClient(process.env.DATABASE_URL, async (client) => {
    await client.query("DROP TRIGGER trg_reject_phase31_change ON sync_change_log");
    await client.query("DROP FUNCTION reject_phase31_change()");
  });

  const concurrentBase = {
    id: "product-concurrent",
    code: "PC",
    name: "Base",
    price: 1,
    stock: 1,
    updatedAt: "2026-07-31T15:00:00.000Z"
  };
  await db.mergeSnapshotPatch({ products: [concurrentBase] }, companyId);
  await Promise.all([
    db.mergeSnapshotPatch({ products: [{ ...concurrentBase, name: "Concurrente anterior", updatedAt: "2026-07-31T15:01:00.000Z" }] }, companyId),
    db.mergeSnapshotPatch({ products: [{ ...concurrentBase, name: "Concurrente final", updatedAt: "2026-07-31T15:02:00.000Z" }] }, companyId)
  ]);
  await Promise.all([
    db.mergeSnapshotPatch({ products: [{ id: "parallel-a", code: "PA", name: "A", price: 1, stock: 0, updatedAt: "2026-07-31T15:03:00.000Z" }] }, companyId),
    db.mergeSnapshotPatch({ products: [{ id: "parallel-b", code: "PB", name: "B", price: 1, stock: 0, updatedAt: "2026-07-31T15:03:00.000Z" }] }, companyId)
  ]);
  const concurrency = await withClient(process.env.DATABASE_URL, async (client) => {
    const same = await client.query(
      `SELECT record_version AS version FROM sync_change_log
       WHERE company_id = $1 AND entity_id = 'product-concurrent' ORDER BY change_seq`,
      [companyId]
    );
    const distinct = await client.query(
      `SELECT entity_id AS id, count(*)::int AS count FROM sync_change_log
       WHERE company_id = $1 AND entity_id IN ('parallel-a', 'parallel-b')
       GROUP BY entity_id ORDER BY entity_id`,
      [companyId]
    );
    return { same: same.rows.map((row) => row.version), distinct: distinct.rows };
  });
  assert.deepEqual(concurrency.same, concurrency.same.map((_, index) => String(index + 1)));
  assert.deepEqual(concurrency.distinct, [{ id: "parallel-a", count: 1 }, { id: "parallel-b", count: 1 }]);

  const companyId2 = "company-phase31-2";
  await withClient(process.env.DATABASE_URL, (client) => client.query(
    `INSERT INTO saas_companies
     (id, ruc, business_name, trade_name, email, phone, status, created_at, updated_at)
     VALUES ($1, '1790012345002', 'Empresa fase 3.1 B', '', 'admin-b@example.com', '', 'active', now(), now())`,
    [companyId2]
  ));
  await db.saveSnapshot(baseData(), companyId2);
  await withClient(process.env.DATABASE_URL, (client) => client.query("DELETE FROM sync_change_log WHERE company_id = $1", [companyId2]));
  const sharedRequest = "request-shared-between-tenants";
  for (const tenant of [companyId, companyId2]) {
    const tenantPatch = { products: [{ id: "tenant-product", code: `T-${tenant}`, name: tenant, price: 1, stock: 0, updatedAt: "2026-07-31T16:00:00.000Z" }] };
    await db.mergeSnapshotPatch(tenantPatch, tenant, {
      requestId: sharedRequest,
      operationType: "SYNC_MERGE",
      operationId: null,
      payloadHash: hashSyncPayload(tenantPatch)
    });
  }
  const isolation = await withClient(process.env.DATABASE_URL, (client) => client.query(
    `SELECT company_id AS "companyId", count(*)::int AS count
     FROM sync_change_log WHERE request_id = $1 GROUP BY company_id ORDER BY company_id`,
    [sharedRequest]
  ));
  assert.deepEqual(isolation.rows, [
    { companyId, count: 1 },
    { companyId: companyId2, count: 1 }
  ]);

  await db.mergeSnapshotPatch({ users: [{
    id: "security-user",
    name: "Usuario seguro",
    email: "secure@example.com",
    role: "vendedor",
    password: "plain-secret",
    passwordHash: "hash-secret",
    token: "token-secret",
    refreshToken: "refresh-secret",
    secret: "other-secret",
    updatedAt: "2026-07-31T17:00:00.000Z"
  }] }, companyId);
  const securityPayload = await withClient(process.env.DATABASE_URL, async (client) => {
    const result = await client.query(
      "SELECT payload FROM sync_change_log WHERE company_id = $1 AND entity_id = 'security-user' ORDER BY change_seq DESC LIMIT 1",
      [companyId]
    );
    return result.rows[0].payload;
  });
  for (const field of ["password", "passwordHash", "token", "refreshToken", "secret"]) {
    assert.equal(securityPayload[field], undefined, `campo sensible expuesto: ${field}`);
  }

  const bulkProducts = Array.from({ length: 250 }, (_, index) => ({
    id: `bulk-${String(index).padStart(4, "0")}`,
    code: `B-${String(index).padStart(4, "0")}`,
    name: `Producto masivo ${index}`,
    price: index + 1,
    stock: index,
    updatedAt: "2026-07-31T18:00:00.000Z"
  }));
  const bulkStartedAt = Date.now();
  await db.mergeSnapshotPatch({ products: bulkProducts }, companyId);
  const bulkDurationMs = Date.now() - bulkStartedAt;
  const explain = await withClient(process.env.DATABASE_URL, async (client) => {
    await client.query(
      `INSERT INTO sync_change_log (
         company_id, module, entity_type, entity_id, action, record_version,
         payload, payload_hash, occurred_at, transaction_id, protocol_version, is_tombstone
       )
       SELECT $1, 'performance', 'noise', 'noise-' || value::text, 'UPSERT', 1,
              jsonb_build_object('value', value), repeat('a', 64), now(),
              '22222222-2222-4222-8222-222222222222'::uuid, 1, false
       FROM generate_series(1, 5000) AS value`,
      [companyId2]
    );
    await client.query("ANALYZE sync_change_log");
    const result = await client.query(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
       SELECT change_seq, entity_type, entity_id
       FROM sync_change_log
       WHERE company_id = $1 AND change_seq > 0
       ORDER BY change_seq ASC LIMIT 100`,
      [companyId]
    );
    return result.rows[0]["QUERY PLAN"][0];
  });
  const explainText = JSON.stringify(explain);
  assert(explainText.includes("idx_sync_change_log_company_sequence"));
  const schema = await withClient(process.env.DATABASE_URL, async (client) => {
    const counts = await client.query(
      `SELECT action, count(*)::int AS count
       FROM sync_change_log WHERE company_id = $1 GROUP BY action ORDER BY action`,
      [companyId]
    );
    const indexes = await client.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'sync_change_log' ORDER BY indexname`
    );
    return { counts: counts.rows, indexes: indexes.rows.map((row) => row.indexname) };
  });
  assert.equal(schema.counts.find((row) => row.action === "DELETE")?.count, 1);
  assert(schema.counts.find((row) => row.action === "UPSERT")?.count >= 259);
  assert(schema.indexes.includes("idx_sync_change_log_company_sequence"));
  console.log(JSON.stringify({
    ok: true,
    existingMigration,
    productCreated: productCreated.rows[0],
    productUpdated: productUpdated.rows,
    tombstone: tombstone.rows[0],
    snapshotFailureRollback: afterSnapshotFailureLogCount === beforeSnapshotFailureLogCount,
    snapshotFailureNormalizedRows: normalizedAfterSnapshotFailure,
    changeLogFailureRollback: true,
    changeLogFailureNormalizedRows: normalizedAfterChangeLogFailure,
    concurrency,
    isolation: isolation.rows,
    securityFields: Object.keys(securityPayload).sort(),
    bulk: { rows: bulkProducts.length, durationMs: bulkDurationMs },
    explain,
    ...schema
  }));
  await db.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
