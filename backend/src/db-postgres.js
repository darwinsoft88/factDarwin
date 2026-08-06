const { Pool } = require("pg");
const fs = require("node:fs");
const path = require("node:path");
const config = require("./config");
const { createAutomaticEmailOperations } = require("./document-email-operations");
const {
  applySnapshotPatch,
  assertDomainOperationReplay,
  compactSnapshotForStorage,
  createDomainEntityOperationConflictError,
  createSyncOperationMismatchError,
  normalizeClientIdentification,
  normalizeDocumentScopes,
  normalizeProductCode,
  normalizeTenantKey,
  normalizeUserEmail,
  prepareDomainOperation,
  scopeFromDocument,
  summarizeSnapshot,
  validateSnapshot
} = require("./db-utils");
const { verifyPassword } = require("./auth");
const { buildInitialTenantData, uid } = require("./saas");
const documentEmailMigrationSql = fs.readFileSync(path.join(__dirname, "migrations", "001-document-email-operations.sql"), "utf8");
const documentEmailSimulationMigrationSql = fs.readFileSync(path.join(__dirname, "migrations", "002-document-email-simulation.sql"), "utf8");
const documentEmailSmtpMigrationSql = fs.readFileSync(path.join(__dirname, "migrations", "003-document-email-smtp.sql"), "utf8");
const syncChangeLogMigrationSql = fs.readFileSync(path.join(__dirname, "migrations", "004-sync-change-log.sql"), "utf8");
const documentHistoryMigrationSql = fs.readFileSync(path.join(__dirname, "migrations", "005-document-history-index.sql"), "utf8");
const { appendSnapshotChanges } = require("./sync-change-log");

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined
});

let readyPromise;

async function ensureSchema() {
  if (!readyPromise) {
    readyPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS app_snapshots (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_snapshot_history (
        id BIGSERIAL PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id BIGSERIAL PRIMARY KEY,
        event TEXT NOT NULL,
        payload JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        role TEXT NOT NULL,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id TEXT NOT NULL DEFAULT '';
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;

      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        identification TEXT NOT NULL,
        identification_type TEXT,
        email TEXT,
        phone TEXT,
        address TEXT,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS company_id TEXT NOT NULL DEFAULT '';
      ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_identification_key;

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL DEFAULT '',
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        price NUMERIC(14, 6) NOT NULL DEFAULT 0,
        cost NUMERIC(14, 6) NOT NULL DEFAULT 0,
        iva_rate NUMERIC(8, 6) NOT NULL DEFAULT 0,
        stock NUMERIC(14, 6) NOT NULL DEFAULT 0,
        min_stock NUMERIC(14, 6) NOT NULL DEFAULT 5,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      ALTER TABLE products ADD COLUMN IF NOT EXISTS company_id TEXT NOT NULL DEFAULT '';
      ALTER TABLE products DROP CONSTRAINT IF EXISTS products_code_key;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS cost NUMERIC(14, 6) NOT NULL DEFAULT 0;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock NUMERIC(14, 6) NOT NULL DEFAULT 5;

      CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL DEFAULT '',
        environment TEXT NOT NULL DEFAULT '',
        establishment TEXT NOT NULL DEFAULT '',
        emission_point TEXT NOT NULL DEFAULT '',
        document_type TEXT NOT NULL,
        client_id TEXT,
        user_id TEXT,
        sequence TEXT NOT NULL,
        access_key TEXT,
        authorization_number TEXT,
        status TEXT NOT NULL,
        subtotal NUMERIC(14, 6) NOT NULL DEFAULT 0,
        tax NUMERIC(14, 6) NOT NULL DEFAULT 0,
        total NUMERIC(14, 6) NOT NULL DEFAULT 0,
        source_sale_id TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS company_id TEXT NOT NULL DEFAULT '';
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT '';
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS establishment TEXT NOT NULL DEFAULT '';
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS emission_point TEXT NOT NULL DEFAULT '';
      DROP INDEX IF EXISTS idx_sales_company_document_sequence;
      DROP INDEX IF EXISTS idx_sales_company_document_sequence_unique;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_company_document_sequence_unique
        ON sales(company_id, document_type, environment, establishment, emission_point, sequence)
        WHERE company_id <> '' AND sequence <> '';

      DROP INDEX IF EXISTS idx_sales_access_key_unique;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_company_access_key_unique
        ON sales(company_id, access_key)
        WHERE access_key IS NOT NULL AND access_key <> '';

      CREATE TABLE IF NOT EXISTS sale_items (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL DEFAULT '',
        sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        line_index INTEGER NOT NULL,
        product_id TEXT,
        code TEXT,
        name TEXT NOT NULL,
        quantity NUMERIC(14, 6) NOT NULL DEFAULT 0,
        unit_price NUMERIC(14, 6) NOT NULL DEFAULT 0,
        discount NUMERIC(14, 6) NOT NULL DEFAULT 0,
        iva_rate NUMERIC(8, 6) NOT NULL DEFAULT 0,
        source_line_key TEXT,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS company_id TEXT NOT NULL DEFAULT '';

      CREATE TABLE IF NOT EXISTS remission_guides (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL DEFAULT '',
        environment TEXT NOT NULL DEFAULT '',
        establishment TEXT NOT NULL DEFAULT '',
        emission_point TEXT NOT NULL DEFAULT '',
        source_sale_id TEXT,
        client_id TEXT,
        user_id TEXT,
        sequence TEXT NOT NULL,
        access_key TEXT,
        authorization_number TEXT,
        status TEXT NOT NULL,
        transporter_name TEXT,
        transporter_identification TEXT,
        plate TEXT,
        start_date TEXT,
        end_date TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      ALTER TABLE remission_guides ADD COLUMN IF NOT EXISTS company_id TEXT NOT NULL DEFAULT '';
      ALTER TABLE remission_guides ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT '';
      ALTER TABLE remission_guides ADD COLUMN IF NOT EXISTS establishment TEXT NOT NULL DEFAULT '';
      ALTER TABLE remission_guides ADD COLUMN IF NOT EXISTS emission_point TEXT NOT NULL DEFAULT '';
      DROP INDEX IF EXISTS idx_guides_company_sequence;
      DROP INDEX IF EXISTS idx_guides_company_sequence_unique;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_guides_company_sequence_unique
        ON remission_guides(company_id, environment, establishment, emission_point, sequence)
        WHERE company_id <> '' AND sequence <> '';

      DROP INDEX IF EXISTS idx_guides_access_key_unique;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_guides_company_access_key_unique
        ON remission_guides(company_id, access_key)
        WHERE access_key IS NOT NULL AND access_key <> '';

      CREATE TABLE IF NOT EXISTS inventory_movements (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL DEFAULT '',
        product_id TEXT,
        product_name TEXT,
        type TEXT NOT NULL,
        quantity NUMERIC(14, 6) NOT NULL DEFAULT 0,
        stock_before NUMERIC(14, 6) NOT NULL DEFAULT 0,
        stock_after NUMERIC(14, 6) NOT NULL DEFAULT 0,
        reason TEXT,
        reference TEXT,
        user_id TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS company_id TEXT NOT NULL DEFAULT '';

      CREATE TABLE IF NOT EXISTS app_audit_logs (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL DEFAULT '',
        event TEXT NOT NULL,
        entity TEXT,
        entity_id TEXT,
        summary TEXT,
        user_id TEXT,
        user_name TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      ALTER TABLE app_audit_logs ADD COLUMN IF NOT EXISTS company_id TEXT NOT NULL DEFAULT '';

      CREATE TABLE IF NOT EXISTS cash_closings (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL DEFAULT '',
        environment TEXT NOT NULL DEFAULT '',
        establishment TEXT NOT NULL DEFAULT '',
        emission_point TEXT NOT NULL DEFAULT '',
        closing_date TEXT NOT NULL,
        user_id TEXT,
        user_name TEXT,
        document_count INTEGER NOT NULL DEFAULT 0,
        total NUMERIC(14, 6) NOT NULL DEFAULT 0,
        cash_expected NUMERIC(14, 6) NOT NULL DEFAULT 0,
        cash_counted NUMERIC(14, 6) NOT NULL DEFAULT 0,
        difference NUMERIC(14, 6) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS company_id TEXT NOT NULL DEFAULT '';
      ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT '';
      ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS establishment TEXT NOT NULL DEFAULT '';
      ALTER TABLE cash_closings ADD COLUMN IF NOT EXISTS emission_point TEXT NOT NULL DEFAULT '';

      CREATE TABLE IF NOT EXISTS document_sequences (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL DEFAULT '',
        document_type TEXT NOT NULL,
        establishment TEXT NOT NULL,
        emission_point TEXT NOT NULL,
        environment TEXT NOT NULL,
        current_value INTEGER NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      ALTER TABLE document_sequences ADD COLUMN IF NOT EXISTS company_id TEXT NOT NULL DEFAULT '';

      CREATE TABLE IF NOT EXISTS saas_companies (
        id TEXT PRIMARY KEY,
        ruc TEXT NOT NULL UNIQUE,
        business_name TEXT NOT NULL,
        trade_name TEXT,
        email TEXT NOT NULL,
        phone TEXT,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS saas_users (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES saas_companies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        password_must_change BOOLEAN NOT NULL DEFAULT FALSE,
        role TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      ALTER TABLE saas_users ADD COLUMN IF NOT EXISTS password_must_change BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE saas_users DROP CONSTRAINT IF EXISTS saas_users_email_key;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_saas_users_company_email_unique
        ON saas_users(company_id, email);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_company_email_unique
        ON users(company_id, email);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_company_identification_unique
        ON clients(company_id, identification);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_products_company_code_unique
        ON products(company_id, code);
      CREATE INDEX IF NOT EXISTS idx_clients_company_name
        ON clients(company_id, name);
      CREATE INDEX IF NOT EXISTS idx_products_company_name
        ON products(company_id, name);
      CREATE INDEX IF NOT EXISTS idx_products_company_updated_at
        ON products(company_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sale_items_company_sale
        ON sale_items(company_id, sale_id);
      CREATE INDEX IF NOT EXISTS idx_sale_items_company_product
        ON sale_items(company_id, product_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_company_created_at
        ON inventory_movements(company_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_inventory_company_product_created_at
        ON inventory_movements(company_id, product_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_app_audit_logs_company_created_at
        ON app_audit_logs(company_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_document_sequences_company
        ON document_sequences(company_id, document_type, environment, establishment, emission_point);
      CREATE INDEX IF NOT EXISTS idx_sales_company_created_at
        ON sales(company_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sales_company_client_created_at
        ON sales(company_id, client_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sales_company_status_created_at
        ON sales(company_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sales_company_document_status_created_at
        ON sales(company_id, document_type, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_guides_company_created_at
        ON remission_guides(company_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_guides_company_status_created_at
        ON remission_guides(company_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_guides_company_client_created_at
        ON remission_guides(company_id, client_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_cash_closings_company_date
        ON cash_closings(company_id, closing_date DESC);

      CREATE TABLE IF NOT EXISTS saas_devices (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES saas_companies(id) ON DELETE CASCADE,
        user_id TEXT,
        device_label TEXT,
        platform TEXT,
        first_seen_at TIMESTAMPTZ NOT NULL,
        last_seen_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS saas_snapshots (
        company_id TEXT PRIMARY KEY REFERENCES saas_companies(id) ON DELETE CASCADE,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS saas_snapshot_history (
        id BIGSERIAL PRIMARY KEY,
        company_id TEXT NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_saas_devices_company_last_seen
        ON saas_devices(company_id, last_seen_at DESC);
      CREATE INDEX IF NOT EXISTS idx_saas_devices_user_last_seen
        ON saas_devices(user_id, last_seen_at DESC);
      CREATE INDEX IF NOT EXISTS idx_saas_snapshot_history_company_created_at
        ON saas_snapshot_history(company_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS sync_operations (
        company_id TEXT NOT NULL DEFAULT '',
        request_id TEXT NOT NULL,
        operation_type TEXT NOT NULL,
        operation_id TEXT,
        payload_hash TEXT NOT NULL,
        result_json JSONB,
        http_status INTEGER,
        processed_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (company_id, request_id)
      );

      CREATE TABLE IF NOT EXISTS sync_domain_operations (
        company_id TEXT NOT NULL DEFAULT '',
        operation_type TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        batch_operation_id TEXT,
        result_json JSONB,
        processed_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (company_id, operation_type, operation_id),
        UNIQUE (company_id, operation_type, entity_id)
      );

      CREATE INDEX IF NOT EXISTS idx_sync_domain_operations_batch
        ON sync_domain_operations (company_id, batch_operation_id)
        WHERE batch_operation_id IS NOT NULL;

      ${documentEmailMigrationSql}
      ${documentEmailSimulationMigrationSql}
      ${documentEmailSmtpMigrationSql}
      ${syncChangeLogMigrationSql}
      ${documentHistoryMigrationSql}
    `).then(() => {
      reconcileSaasUsersFromSnapshots().catch((error) => {
        console.error("No se pudo reconciliar usuarios SaaS al iniciar:", error.message);
      });
    });
  }
  return readyPromise;
}

async function getSnapshot(companyId = "") {
  await ensureSchema();
  if (companyId) {
    const result = await pool.query("SELECT data, updated_at AS \"updatedAt\" FROM saas_snapshots WHERE company_id = $1", [companyId]);
    const row = result.rows[0];
    if (!row) return null;
    const data = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
    return {
      data,
      updatedAt: new Date(row.updatedAt).toISOString(),
      summary: { ...summarizeSnapshot(data), historyCount: await countSnapshotHistory(pool, companyId) }
    };
  }
  const result = await pool.query("SELECT data, updated_at AS \"updatedAt\" FROM app_snapshots WHERE id = 1");
  const row = result.rows[0];
  if (!row) return null;
  const data = typeof row.data === "string" ? JSON.parse(row.data) : row.data;

  return {
    data,
    updatedAt: new Date(row.updatedAt).toISOString(),
    summary: { ...summarizeSnapshot(data), historyCount: await countSnapshotHistory() }
  };
}

async function saveSnapshot(data, companyId = "", changeContext = {}) {
  data = reconcileProductStockFromMovements(normalizeDocumentScopes(data));
  validateSnapshot(data);
  await ensureSchema();

  const client = await pool.connect();
  const updatedAt = new Date().toISOString();
  try {
    await client.query("BEGIN");
    let mergedData = data;
    let currentData = null;
    if (companyId) {
      const locked = await client.query("SELECT data FROM saas_snapshots WHERE company_id = $1 FOR UPDATE", [companyId]);
      currentData = locked.rows[0]?.data
        ? typeof locked.rows[0].data === "string" ? JSON.parse(locked.rows[0].data) : locked.rows[0].data
        : null;
      mergedData = currentData
        ? normalizeDocumentScopes(applySnapshotPatch(currentData, { ...data, baseData: currentData }))
        : normalizeDocumentScopes(data);
      mergedData = reconcileProductStockFromMovements(mergedData);
      validateSnapshot(mergedData);
      const storedData = compactSnapshotForStorage(mergedData);
      await client.query(
        `INSERT INTO saas_snapshots (company_id, data, updated_at)
         VALUES ($1, $2::jsonb, $3)
         ON CONFLICT(company_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
        [companyId, JSON.stringify(storedData), updatedAt]
      );
      await client.query("INSERT INTO saas_snapshot_history (company_id, data, created_at) VALUES ($1, $2::jsonb, $3)", [companyId, JSON.stringify(storedData), updatedAt]);
      await syncNormalizedTables(client, mergedData, updatedAt, companyId);
    } else {
      const storedData = compactSnapshotForStorage(data);
      await client.query(
        `INSERT INTO app_snapshots (id, data, updated_at)
         VALUES (1, $1::jsonb, $2)
         ON CONFLICT(id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
        [JSON.stringify(storedData), updatedAt]
      );
      await client.query("INSERT INTO app_snapshot_history (data, created_at) VALUES ($1::jsonb, $2)", [JSON.stringify(storedData), updatedAt]);
      await syncNormalizedTables(client, data, updatedAt);
    }

    if (companyId) {
      await appendSnapshotChanges(client, {
        shadowConfig: config.incrementalSyncShadow,
        companyId,
        currentData,
        finalData: mergedData,
        occurredAt: updatedAt,
        origin: changeContext.origin || "legacy_snapshot",
        userId: changeContext.userId || null,
        deviceId: changeContext.deviceId || null
      });
    }

    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const before = await countSnapshotHistory(client, companyId);
    if (companyId) {
      await client.query("DELETE FROM saas_snapshot_history WHERE company_id = $1 AND created_at < $2", [companyId, cutoff]);
    } else {
      await client.query("DELETE FROM app_snapshot_history WHERE created_at < $1", [cutoff]);
    }
    const after = await countSnapshotHistory(client, companyId);
    const summary = summarizeSnapshot(mergedData);
    await insertBackendAudit(client, companyId ? "TENANT_SNAPSHOT_MERGED" : "APP_SNAPSHOT_SAVED", { ...summary, historyCount: after, prunedHistory: Math.max(0, before - after) });
    await client.query("COMMIT");

    return { ok: true, updatedAt, summary: { ...summary, historyCount: after, prunedHistory: Math.max(0, before - after) } };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function exportTenantSnapshot(companyId = "") {
  await ensureSchema();
  const normalizedCompanyId = String(companyId || "");
  if (!normalizedCompanyId) {
    const error = new Error("companyId es obligatorio para exportar una empresa.");
    error.statusCode = 400;
    throw error;
  }

  const companyResult = await pool.query(
    `SELECT id, ruc, business_name AS "businessName", trade_name AS "tradeName", email, phone, status, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM saas_companies
     WHERE id = $1`,
    [normalizedCompanyId]
  );
  const snapshot = await getSnapshot(normalizedCompanyId);
  if (!companyResult.rows[0] || !snapshot?.data) {
    const error = new Error("Empresa no encontrada o sin snapshot para exportar.");
    error.statusCode = 404;
    throw error;
  }

  const company = companyResult.rows[0];
  const payload = {
    type: "factudarwin-tenant-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    company: {
      id: String(company.id),
      ruc: String(company.ruc || ""),
      businessName: String(company.businessName || ""),
      tradeName: String(company.tradeName || ""),
      email: String(company.email || ""),
      phone: String(company.phone || ""),
      status: String(company.status || ""),
      createdAt: company.createdAt ? new Date(company.createdAt).toISOString() : "",
      updatedAt: company.updatedAt ? new Date(company.updatedAt).toISOString() : ""
    },
    snapshot: {
      data: snapshot.data,
      updatedAt: snapshot.updatedAt,
      summary: snapshot.summary
    }
  };

  await addAudit("TENANT_EXPORTED", { companyId: normalizedCompanyId, summary: snapshot.summary || null });
  return payload;
}

async function restoreTenantSnapshot(companyId = "", backup = {}, options = {}) {
  await ensureSchema();
  const normalizedCompanyId = String(companyId || "");
  if (!normalizedCompanyId) {
    const error = new Error("companyId es obligatorio para restaurar una empresa.");
    error.statusCode = 400;
    throw error;
  }

  const data = backup?.snapshot?.data || backup?.data || backup;
  if (!data || typeof data !== "object") {
    const error = new Error("Backup invalido: falta snapshot.data.");
    error.statusCode = 400;
    throw error;
  }

  const expectedRuc = String(options.expectedRuc || backup?.company?.ruc || "").trim();
  const companyResult = await pool.query("SELECT id, ruc FROM saas_companies WHERE id = $1", [normalizedCompanyId]);
  const company = companyResult.rows[0];
  if (!company) {
    const error = new Error("Empresa destino no encontrada.");
    error.statusCode = 404;
    throw error;
  }
  if (expectedRuc && String(company.ruc || "") !== expectedRuc) {
    const error = new Error(`El backup pertenece al RUC ${expectedRuc}, pero la empresa destino tiene RUC ${company.ruc}.`);
    error.statusCode = 409;
    throw error;
  }

  const restoredData = reconcileProductStockFromMovements(normalizeDocumentScopes(data));
  validateSnapshot(restoredData);
  const storedData = compactSnapshotForStorage(restoredData);
  const updatedAt = new Date().toISOString();
  const summary = summarizeSnapshot(restoredData);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT data FROM saas_snapshots WHERE company_id = $1 FOR UPDATE", [normalizedCompanyId]);
    if (current.rows[0]?.data) {
      await client.query("INSERT INTO saas_snapshot_history (company_id, data, created_at) VALUES ($1, $2::jsonb, $3)", [normalizedCompanyId, JSON.stringify(current.rows[0].data), updatedAt]);
    }
    await client.query(
      `INSERT INTO saas_snapshots (company_id, data, updated_at)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT(company_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
      [normalizedCompanyId, JSON.stringify(storedData), updatedAt]
    );
    await clearTenantNormalizedTables(client, normalizedCompanyId);
    await syncNormalizedTables(client, restoredData, updatedAt, normalizedCompanyId);
    await appendSnapshotChanges(client, {
      shadowConfig: config.incrementalSyncShadow,
      companyId: normalizedCompanyId,
      currentData: current.rows[0]?.data || {},
      finalData: restoredData,
      occurredAt: updatedAt,
      origin: "admin_operation",
      userId: options.userId || null
    });
    await insertBackendAudit(client, "TENANT_RESTORED", { companyId: normalizedCompanyId, summary });
    await client.query("COMMIT");
    return { ok: true, companyId: normalizedCompanyId, updatedAt, summary };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getDomainOperation(client, companyId, operationType, operationId) {
  const result = await client.query(
    `SELECT operation_type AS "operationType", operation_id AS "operationId", entity_id AS "entityId",
            payload_hash AS "payloadHash", batch_operation_id AS "batchOperationId", result_json AS "resultJson",
            processed_at AS "processedAt"
     FROM sync_domain_operations
     WHERE company_id = $1 AND operation_type = $2 AND operation_id = $3`,
    [companyId, operationType, operationId]
  );
  return result.rows[0] || null;
}

function extractDomainOperations(patch = {}) {
  const operations = [];
  const byIdentity = new Map();
  const byEntity = new Map();
  const add = (descriptor) => {
    const prepared = prepareDomainOperation(descriptor);
    const identityKey = `${prepared.operationType}:${prepared.operationId}`;
    const entityKey = `${prepared.operationType}:${prepared.entityId}`;
    const previousIdentity = byIdentity.get(identityKey);
    if (previousIdentity) {
      assertDomainOperationReplay(previousIdentity.prepared, prepared);
      return;
    }
    const previousEntity = byEntity.get(entityKey);
    if (previousEntity && previousEntity.prepared.operationId !== prepared.operationId) {
      throw createDomainEntityOperationConflictError(prepared, previousEntity.prepared.operationId);
    }
    const operation = { ...descriptor, prepared };
    byIdentity.set(identityKey, operation);
    byEntity.set(entityKey, operation);
    operations.push(operation);
  };

  for (const payment of Array.isArray(patch.creditPayments) ? patch.creditPayments : []) {
    if (!payment || typeof payment !== "object" || Array.isArray(payment)) continue;
    if (Object.prototype.hasOwnProperty.call(payment, "operationId")) {
      const { voidOperationId, voidedAt, voidedByUserId, voidedByUserName, voidReason, ...createPayload } = payment;
      void voidOperationId; void voidedAt; void voidedByUserId; void voidedByUserName; void voidReason;
      add({ operationType: "CREDIT_PAYMENT_CREATE", operationId: payment.operationId, entityId: payment.id, batchOperationId: payment.batchOperationId, payload: createPayload, collection: "creditPayments", action: "CREATE" });
    }
    if (Object.prototype.hasOwnProperty.call(payment, "voidOperationId")) {
      add({
        operationType: "CREDIT_PAYMENT_VOID",
        operationId: payment.voidOperationId,
        entityId: payment.id,
        payload: { paymentId: payment.id, saleId: payment.saleId, clientId: payment.clientId, amount: payment.amount, voidedAt: payment.voidedAt, voidedByUserId: payment.voidedByUserId, voidedByUserName: payment.voidedByUserName, voidReason: payment.voidReason },
        collection: "creditPayments",
        action: "VOID"
      });
    }
  }

  for (const adjustment of Array.isArray(patch.creditAdjustments) ? patch.creditAdjustments : []) {
    if (!adjustment || typeof adjustment !== "object" || Array.isArray(adjustment)) continue;
    if (Object.prototype.hasOwnProperty.call(adjustment, "operationId")) {
      const { state, reversedAt, reverseOperationId, ...applyPayload } = adjustment;
      void state; void reversedAt; void reverseOperationId;
      add({ operationType: "CREDIT_ADJUSTMENT_APPLY", operationId: adjustment.operationId, entityId: adjustment.id, payload: applyPayload, collection: "creditAdjustments", action: "APPLY" });
    }
    if (Object.prototype.hasOwnProperty.call(adjustment, "reverseOperationId")) {
      add({
        operationType: "CREDIT_ADJUSTMENT_REVERSE",
        operationId: adjustment.reverseOperationId,
        entityId: adjustment.id,
        payload: { adjustmentId: adjustment.id, sourceCreditNoteId: adjustment.sourceCreditNoteId, sourceSaleId: adjustment.sourceSaleId, amount: adjustment.amount, reversedAt: adjustment.reversedAt, state: adjustment.state },
        collection: "creditAdjustments",
        action: "REVERSE"
      });
    }
  }
  return operations;
}

function effectiveDomainPatch(patch, operations, outcomes) {
  const descriptorsByEntity = new Map();
  operations.forEach((operation, index) => {
    const key = `${operation.collection}:${operation.entityId}`;
    const current = descriptorsByEntity.get(key) || [];
    current.push({ operation, status: outcomes[index].status });
    descriptorsByEntity.set(key, current);
  });
  const effective = { ...patch };
  for (const collection of ["creditPayments", "creditAdjustments"]) {
    if (!Array.isArray(patch[collection])) continue;
    const included = new Set();
    effective[collection] = patch[collection].filter((item) => {
      const key = `${collection}:${item?.id}`;
      const descriptors = descriptorsByEntity.get(key);
      if (!descriptors?.length) return true;
      const hasLegacyTransition = collection === "creditPayments"
        ? Boolean(item?.voidedAt) && !Object.prototype.hasOwnProperty.call(item, "voidOperationId")
        : item?.state === "REVERSED" && !Object.prototype.hasOwnProperty.call(item, "reverseOperationId");
      if (!hasLegacyTransition && !descriptors.some((entry) => entry.status === "NEW")) return false;
      if (included.has(item.id)) return false;
      included.add(item.id);
      return true;
    });
  }
  return effective;
}

function domainOperationSummary(operations, outcomes) {
  const summary = { new: [], replayed: [] };
  operations.forEach((operation, index) => {
    const item = { operationType: operation.operationType, operationId: operation.operationId, entityId: operation.entityId };
    (outcomes[index].status === "NEW" ? summary.new : summary.replayed).push(item);
  });
  return summary;
}

async function registerOrReplayDomainOperation(client, companyId = "", operation) {
  const prepared = prepareDomainOperation(operation);
  const processedAt = new Date().toISOString();
  const inserted = await client.query(
    `INSERT INTO sync_domain_operations
       (company_id, operation_type, operation_id, entity_id, payload_hash, batch_operation_id, processed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT DO NOTHING
     RETURNING operation_id`,
    [companyId, prepared.operationType, prepared.operationId, prepared.entityId, prepared.payloadHash, prepared.batchOperationId, processedAt]
  );
  if (inserted.rowCount === 1) return { status: "NEW", operation: prepared, result: null };

  const existing = await getDomainOperation(client, companyId, prepared.operationType, prepared.operationId);
  if (existing) return assertDomainOperationReplay(existing, prepared);

  const entityResult = await client.query(
    `SELECT operation_id AS "operationId"
     FROM sync_domain_operations
     WHERE company_id = $1 AND operation_type = $2 AND entity_id = $3`,
    [companyId, prepared.operationType, prepared.entityId]
  );
  throw createDomainEntityOperationConflictError(prepared, entityResult.rows[0]?.operationId);
}

async function completeDomainOperation(client, companyId = "", operationType, operationId, result) {
  await client.query(
    `UPDATE sync_domain_operations SET result_json = $1::jsonb
     WHERE company_id = $2 AND operation_type = $3 AND operation_id = $4 AND result_json IS NULL`,
    [JSON.stringify(result ?? null), companyId, operationType, operationId]
  );
  return getDomainOperation(client, companyId, operationType, operationId);
}

async function mergeSnapshotPatch(patch, companyId = "", syncOperation = null, changeContext = {}) {
  await ensureSchema();

  const client = await pool.connect();
  const updatedAt = new Date().toISOString();
  try {
    await client.query("BEGIN");
    const domainOperations = extractDomainOperations(patch);
    if (syncOperation) {
      const claimed = await client.query(
        `INSERT INTO sync_operations (company_id, request_id, operation_type, operation_id, payload_hash, processed_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (company_id, request_id) DO NOTHING RETURNING request_id`,
        [companyId, syncOperation.requestId, syncOperation.operationType, syncOperation.operationId, syncOperation.payloadHash, updatedAt]
      );
      if (claimed.rowCount === 0) {
        const existing = await client.query(
          `SELECT payload_hash AS "payloadHash", result_json AS "resultJson"
           FROM sync_operations WHERE company_id = $1 AND request_id = $2`,
          [companyId, syncOperation.requestId]
        );
        if (existing.rows[0]?.payloadHash !== syncOperation.payloadHash) {
          throw createSyncOperationMismatchError(syncOperation.requestId);
        }
        await client.query("COMMIT");
        return existing.rows[0].resultJson;
      }
    }
    const domainOutcomes = [];
    for (const operation of domainOperations) {
      domainOutcomes.push(await registerOrReplayDomainOperation(client, companyId, operation));
    }
    const effectivePatch = effectiveDomainPatch(patch, domainOperations, domainOutcomes);
    const locked = companyId
      ? await client.query("SELECT data FROM saas_snapshots WHERE company_id = $1 FOR UPDATE", [companyId])
      : await client.query("SELECT data FROM app_snapshots WHERE id = 1 FOR UPDATE");
    const currentData = locked.rows[0]?.data
      ? typeof locked.rows[0].data === "string" ? JSON.parse(locked.rows[0].data) : locked.rows[0].data
      : null;
    const data = reconcileProductStockFromMovements(normalizeDocumentScopes(applySnapshotPatch(currentData, effectivePatch)));
    validateSnapshot(data);
    const storedData = compactSnapshotForStorage(data);

    if (companyId) {
      await client.query(
        `INSERT INTO saas_snapshots (company_id, data, updated_at)
         VALUES ($1, $2::jsonb, $3)
         ON CONFLICT(company_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
        [companyId, JSON.stringify(storedData), updatedAt]
      );
      await client.query("INSERT INTO saas_snapshot_history (company_id, data, created_at) VALUES ($1, $2::jsonb, $3)", [companyId, JSON.stringify(storedData), updatedAt]);
      await syncNormalizedTables(client, data, updatedAt, companyId);
    } else {
      await client.query(
        `INSERT INTO app_snapshots (id, data, updated_at)
         VALUES (1, $1::jsonb, $2)
         ON CONFLICT(id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
        [JSON.stringify(storedData), updatedAt]
      );
      await client.query("INSERT INTO app_snapshot_history (data, created_at) VALUES ($1::jsonb, $2)", [JSON.stringify(storedData), updatedAt]);
      await syncNormalizedTables(client, data, updatedAt);
    }

    const automaticEmailOperations = await createAutomaticEmailOperations(client, companyId, currentData, data, updatedAt);
    if (companyId) {
      await appendSnapshotChanges(client, {
        shadowConfig: config.incrementalSyncShadow,
        companyId,
        currentData,
        finalData: data,
        requestId: syncOperation?.requestId || null,
        operationId: syncOperation?.operationId || null,
        occurredAt: updatedAt,
        origin: changeContext.origin || (domainOperations.length ? "domain_operation" : syncOperation ? "incremental_merge" : "legacy_merge"),
        userId: changeContext.userId || null,
        deviceId: changeContext.deviceId || null
      });
    }
    const summary = summarizeSnapshot(data);
    await insertBackendAudit(client, "APP_INCREMENTAL_MERGE", {
      ...summary,
      sales: patch.sales?.length || 0,
      products: patch.products?.length || 0,
      inventoryMovements: patch.inventoryMovements?.length || 0,
      auditLogs: patch.auditLogs?.length || 0,
      creditAdjustments: patch.creditAdjustments?.length || 0
    });
    for (let index = 0; index < domainOperations.length; index += 1) {
      if (domainOutcomes[index].status !== "NEW") continue;
      const operation = domainOperations[index];
      await completeDomainOperation(client, companyId, operation.operationType, operation.operationId, {
        status: "APPLIED",
        entityId: operation.entityId,
        operationType: operation.operationType
      });
    }
    const result = {
      ok: true,
      updatedAt,
      summary,
      domainOperations: domainOperationSummary(domainOperations, domainOutcomes),
      automaticEmailOperations
    };
    if (syncOperation) {
      await client.query(
        `UPDATE sync_operations SET result_json = $1::jsonb, http_status = 200, processed_at = $2
         WHERE company_id = $3 AND request_id = $4`,
        [JSON.stringify(result), updatedAt, companyId, syncOperation.requestId]
      );
    }
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function addAudit(event, payload) {
  await ensureSchema();
  await insertBackendAudit(pool, event, payload);
}

async function maximumSyncChangeSequence(companyId, timeoutMs = 5000) {
  await ensureSchema();
  const result = await pool.query({
    text: "SELECT COALESCE(MAX(change_seq), 0)::bigint AS sequence FROM sync_change_log WHERE company_id = $1",
    values: [String(companyId || "")],
    query_timeout: timeoutMs
  });
  return Number(result.rows[0]?.sequence || 0);
}

async function listDiagnosticSyncChanges({ companyId, after, watermark, limit, timeoutMs = 5000, entityTypes = null }) {
  await ensureSchema();
  const result = await pool.query({
    text: `SELECT change_seq AS "changeSeq", module, entity_type AS "entityType", entity_id AS "entityId",
                  action, record_version AS "recordVersion", payload, payload_hash AS "payloadHash",
                  origin, occurred_at AS "occurredAt", is_tombstone AS "isTombstone"
           FROM sync_change_log
           WHERE company_id = $1 AND change_seq > $2 AND change_seq <= $3
             AND ($5::text[] IS NULL OR entity_type = ANY($5::text[]))
           ORDER BY change_seq ASC LIMIT $4`,
    values: [String(companyId || ""), Number(after), Number(watermark), Number(limit), entityTypes],
    query_timeout: timeoutMs
  });
  return result.rows;
}

async function getIncrementalPilotBootstrap(companyId) {
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const snapshot = await client.query("SELECT data, updated_at AS \"updatedAt\" FROM saas_snapshots WHERE company_id=$1", [companyId]);
    const watermark = await client.query("SELECT COALESCE(MAX(change_seq),0)::bigint AS sequence FROM sync_change_log WHERE company_id=$1", [companyId]);
    const versions = await client.query(`SELECT DISTINCT ON (entity_type,entity_id) entity_type AS "entityType",entity_id AS "entityId",record_version AS "recordVersion",payload_hash AS "payloadHash",action FROM sync_change_log WHERE company_id=$1 AND entity_type IN ('client','product') ORDER BY entity_type,entity_id,change_seq DESC`, [companyId]);
    await client.query("COMMIT");
    return snapshot.rows[0] ? { data: snapshot.rows[0].data, updatedAt: snapshot.rows[0].updatedAt, watermark: Number(watermark.rows[0].sequence || 0), versions: versions.rows } : null;
  } catch (error) {
    await client.query("ROLLBACK"); throw error;
  } finally { client.release(); }
}

async function isIncrementalPilotDeviceTrusted({ companyId, userId, deviceId }) {
  await ensureSchema();
  if (!companyId || !userId || !deviceId) return false;
  const result = await pool.query("SELECT 1 FROM saas_devices WHERE company_id=$1 AND user_id=$2 AND id=$3 LIMIT 1", [companyId, userId, deviceId]);
  return result.rowCount === 1;
}

async function getAudit(limit = 50) {
  await ensureSchema();
  const result = await pool.query(
    "SELECT event, payload, created_at AS \"createdAt\" FROM audit_log ORDER BY id DESC LIMIT $1",
    [limit]
  );
  return result.rows.map((row) => ({
    event: String(row.event),
    payload: row.payload || null,
    createdAt: new Date(row.createdAt).toISOString()
  }));
}

async function listSalesHistory(companyId = "", filters = {}) {
  await ensureSchema();
  return listPayloadHistory("sales", companyId, filters, {
    documentType: true,
    searchColumns: ["sequence", "access_key", "authorization_number"]
  });
}

async function listGuidesHistory(companyId = "", filters = {}) {
  await ensureSchema();
  return listPayloadHistory("remission_guides", companyId, filters, {
    searchColumns: ["sequence", "access_key", "authorization_number", "plate"]
  });
}

async function searchClients(companyId = "", filters = {}) {
  await ensureSchema();
  const limit = clampLimit(filters.limit, 25, 100);
  const offset = Math.max(0, Number(filters.offset || 0));
  const values = [companyId || ""];
  const where = ["company_id = $1"];
  const search = String(filters.search || "").trim();

  if (search) {
    values.push(`%${search}%`);
    const index = values.length;
    where.push(`(name ILIKE $${index} OR identification ILIKE $${index} OR email ILIKE $${index} OR phone ILIKE $${index})`);
  }

  const whereSql = where.join(" AND ");
  const rows = await pool.query(
    `SELECT payload FROM clients WHERE ${whereSql} ORDER BY name ASC, identification ASC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset]
  );
  const totalResult = await pool.query(`SELECT COUNT(*)::int AS total FROM clients WHERE ${whereSql}`, values);
  const total = Number(totalResult.rows[0]?.total || 0);
  return { items: rows.rows.map(payloadFromPgRow), total, limit, offset, hasMore: offset + rows.rows.length < total };
}

async function searchProducts(companyId = "", filters = {}) {
  await ensureSchema();
  const limit = clampLimit(filters.limit, 25, 100);
  const offset = Math.max(0, Number(filters.offset || 0));
  const values = [companyId || ""];
  const where = ["company_id = $1"];
  const search = String(filters.search || "").trim();

  if (search) {
    values.push(`%${search}%`);
    const index = values.length;
    where.push(`(code ILIKE $${index} OR name ILIKE $${index})`);
  }

  const whereSql = where.join(" AND ");
  const rows = await pool.query(
    `SELECT payload FROM products WHERE ${whereSql} ORDER BY code ASC, name ASC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset]
  );
  const totalResult = await pool.query(`SELECT COUNT(*)::int AS total FROM products WHERE ${whereSql}`, values);
  const total = Number(totalResult.rows[0]?.total || 0);
  return { items: rows.rows.map(payloadFromPgRow), total, limit, offset, hasMore: offset + rows.rows.length < total };
}

async function findDocumentByAccessKey(companyId = "", accessKey = "") {
  await ensureSchema();
  const normalizedAccessKey = String(accessKey || "").trim();
  if (!normalizedAccessKey) return null;

  const params = [companyId || "", normalizedAccessKey];
  const sale = await pool.query(
    "SELECT payload FROM sales WHERE company_id = $1 AND access_key = $2 ORDER BY updated_at DESC LIMIT 1",
    params
  );
  if (sale.rows[0]) return { type: "sale", payload: payloadFromPgRow(sale.rows[0]) };

  const guide = await pool.query(
    "SELECT payload FROM remission_guides WHERE company_id = $1 AND access_key = $2 ORDER BY updated_at DESC LIMIT 1",
    params
  );
  if (guide.rows[0]) return { type: "guide", payload: payloadFromPgRow(guide.rows[0]) };

  return null;
}

async function listPayloadHistory(table, companyId, filters, options = {}) {
  const limit = clampLimit(filters.limit, 50, 500);
  const offset = Math.max(0, Number(filters.offset || 0));
  const values = [companyId || ""];
  const where = ["company_id = $1"];

  addOptionalPgFilter(where, values, "client_id", filters.clientId);
  addOptionalPgFilter(where, values, "status", filters.status);
  if (options.documentType) addOptionalPgFilter(where, values, "document_type", filters.documentType);
  addDatePgFilter(where, values, "created_at", ">=", filters.dateFrom);
  addDatePgFilter(where, values, "created_at", "<=", filters.dateTo);

  if (filters.search) {
    values.push(`%${String(filters.search).trim()}%`);
    const index = values.length;
    where.push(`(${options.searchColumns.map((column) => `${column} ILIKE $${index}`).join(" OR ")})`);
  }

  const whereSql = where.join(" AND ");
  const rows = await pool.query(
    `SELECT payload FROM ${table} WHERE ${whereSql} ORDER BY created_at DESC, sequence DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset]
  );
  const totalResult = await pool.query(`SELECT COUNT(*)::int AS total FROM ${table} WHERE ${whereSql}`, values);
  const total = Number(totalResult.rows[0]?.total || 0);
  return { items: rows.rows.map(payloadFromPgRow), total, limit, offset, hasMore: offset + rows.rows.length < total };
}

function payloadFromPgRow(row) {
  return typeof row?.payload === "string" ? JSON.parse(row.payload) : row?.payload || null;
}

function reconcileProductStockFromMovements(data) {
  if (!data || !Array.isArray(data.products) || !Array.isArray(data.inventoryMovements)) return data;

  const movementsByProduct = new Map();
  data.inventoryMovements.forEach((movement) => {
    const productId = String(movement?.productId || "");
    if (!productId) return;
    if (!movementsByProduct.has(productId)) movementsByProduct.set(productId, []);
    movementsByProduct.get(productId).push(movement);
  });

  const products = data.products.map((product) => {
    const movements = movementsByProduct.get(product.id);
    if (!movements?.length) return product;

    const sorted = [...movements].sort(compareInventoryMovements);
    let stock = finiteNumber(sorted[0]?.stockBefore, product.stock);
    let updatedAt = product.updatedAt || "";
    sorted.forEach((movement) => {
      const quantity = Math.max(0, finiteNumber(movement.quantity, 0));
      if (movement.type === "entrada") stock += quantity;
      if (movement.type === "salida") stock -= quantity;
      if (movement.type === "ajuste") stock = finiteNumber(movement.stockAfter, stock);
      if (timestampOf(movement.createdAt) >= timestampOf(updatedAt)) updatedAt = movement.createdAt || updatedAt;
    });

    return { ...product, stock, updatedAt: updatedAt || product.updatedAt };
  });

  return { ...data, products };
}

function compareInventoryMovements(a, b) {
  const dateDiff = timestampOf(a?.createdAt) - timestampOf(b?.createdAt);
  if (dateDiff !== 0) return dateDiff;
  return String(a?.id || "").localeCompare(String(b?.id || ""));
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function timestampOf(value) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

async function reserveDocumentSequence({ documentType = "factura", issuer, createdAt, companyId = "" }) {
  await ensureSchema();
  const client = await pool.connect();
  const now = new Date().toISOString();
  issuer = normalizedIssuerForSequence(issuer);
  const key = sequenceKey(documentType, issuer, companyId);

  try {
    await client.query("BEGIN");
    const initialValue = await initialSequenceValue(client, documentType, issuer, companyId);
    await client.query(
      `INSERT INTO document_sequences (id, company_id, document_type, establishment, emission_point, environment, current_value, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT(id) DO NOTHING`,
      [key, companyId || "", documentType, issuer.establishment, issuer.emissionPoint, issuer.environment, initialValue, now]
    );
    await client.query(
      `UPDATE document_sequences
       SET current_value = GREATEST(current_value, $2), updated_at = $3
       WHERE id = $1`,
      [key, initialValue, now]
    );
    const result = await client.query(
      `UPDATE document_sequences
       SET current_value = current_value + 1, updated_at = $2
       WHERE id = $1
       RETURNING current_value AS "currentValue"`,
      [key, now]
    );
    const sequence = Number(result.rows[0].currentValue);
    await insertBackendAudit(client, "DOCUMENT_SEQUENCE_RESERVED", {
      documentType,
      establishment: issuer.establishment,
      emissionPoint: issuer.emissionPoint,
      environment: issuer.environment,
      sequence,
      createdAt
    });
    await client.query("COMMIT");
    return sequence;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function syncNormalizedTables(client, data, updatedAt, companyId = "") {
  await replaceTable(client, "users", data.users || [], (user) => ({
    id: scopedRowId(companyId, user.id),
    company_id: companyId,
    name: user.name || "",
    email: normalizeUserEmail(user.email || ""),
    role: user.role || "vendedor",
    payload: user,
    updated_at: updatedAt
  }), companyId);
  await syncSaasUsersFromSnapshot(client, data.users || [], companyId, updatedAt);

  await replaceTable(client, "clients", data.clients || [], (item) => ({
    id: scopedRowId(companyId, item.id),
    company_id: companyId,
    name: item.name || "",
    identification: normalizeClientIdentification(item.identification || ""),
    identification_type: item.identificationType || "",
    email: item.email || "",
    phone: item.phone || "",
    address: item.address || "",
    payload: item,
    updated_at: updatedAt
  }), companyId);

  await replaceTable(client, "products", data.products || [], (item) => ({
    id: scopedRowId(companyId, item.id),
    company_id: companyId,
    code: normalizeProductCode(item.code || ""),
    name: item.name || "",
    price: Number(item.price || 0),
    cost: Number(item.cost || 0),
    iva_rate: Number(item.ivaRate || 0),
    stock: Number(item.stock || 0),
    min_stock: Number(item.minStock || 5),
    payload: item,
    updated_at: updatedAt
  }), companyId);

  await replaceTable(client, "sales", data.sales || [], (sale) => ({
    id: scopedRowId(companyId, sale.id),
    company_id: companyId,
    ...documentScopeFromDocument(sale, data.issuer),
    document_type: sale.documentType || "factura",
    client_id: sale.clientId || "",
    user_id: sale.userId || "",
    sequence: sale.sequence || "",
    access_key: sale.accessKey || "",
    authorization_number: sale.authorizationNumber || "",
    status: sale.status || "BORRADOR",
    subtotal: Number(sale.subtotal || 0),
    tax: Number(sale.tax || 0),
    total: Number(sale.total || 0),
    source_sale_id: sale.sourceSaleId || "",
    created_at: sale.createdAt || updatedAt,
    payload: sale,
    updated_at: updatedAt
  }), companyId);
  if (companyId) await syncDocumentHistoryIndex(client, companyId, updatedAt, data.sales || []);

  await replaceTable(client, "sale_items", (data.sales || []).flatMap((sale) => (sale.items || []).map((item, index) => ({ sale, item, index }))), ({ sale, item, index }) => ({
    id: `${scopedRowId(companyId, sale.id)}:${index}`,
    company_id: companyId,
    sale_id: scopedRowId(companyId, sale.id),
    line_index: index,
    product_id: item.productId || "",
    code: item.code || "",
    name: item.name || "",
    quantity: Number(item.quantity || 0),
    unit_price: Number(item.unitPrice || 0),
    discount: Number(item.discount || 0),
    iva_rate: Number(item.ivaRate || 0),
    source_line_key: item.sourceLineKey || "",
    payload: item,
    updated_at: updatedAt
  }), companyId);

  await replaceTable(client, "remission_guides", data.guides || [], (guide) => ({
    id: scopedRowId(companyId, guide.id),
    company_id: companyId,
    ...documentScopeFromDocument(guide, data.issuer),
    source_sale_id: guide.sourceSaleId || "",
    client_id: guide.clientId || "",
    user_id: guide.userId || "",
    sequence: guide.sequence || "",
    access_key: guide.accessKey || "",
    authorization_number: guide.authorizationNumber || "",
    status: guide.status || "BORRADOR",
    transporter_name: guide.transporterName || "",
    transporter_identification: guide.transporterIdentification || "",
    plate: guide.plate || "",
    start_date: guide.startDate || "",
    end_date: guide.endDate || "",
    created_at: guide.createdAt || updatedAt,
    payload: guide,
    updated_at: updatedAt
  }), companyId);

  await replaceTable(client, "inventory_movements", data.inventoryMovements || [], (movement) => ({
    id: scopedRowId(companyId, movement.id),
    company_id: companyId,
    product_id: movement.productId || "",
    product_name: movement.productName || "",
    type: movement.type || "ajuste",
    quantity: Number(movement.quantity || 0),
    stock_before: Number(movement.stockBefore || 0),
    stock_after: Number(movement.stockAfter || 0),
    reason: movement.reason || "",
    reference: movement.reference || "",
    user_id: movement.userId || "",
    created_at: movement.createdAt || updatedAt,
    payload: movement,
    updated_at: updatedAt
  }), companyId);

  await replaceTable(client, "app_audit_logs", data.auditLogs || [], (entry) => ({
    id: scopedRowId(companyId, entry.id),
    company_id: companyId,
    event: entry.event || "",
    entity: entry.entity || "",
    entity_id: entry.entityId || "",
    summary: entry.summary || "",
    user_id: entry.userId || "",
    user_name: entry.userName || "",
    created_at: entry.createdAt || updatedAt,
    payload: entry,
    updated_at: updatedAt
  }), companyId);

  await replaceTable(client, "cash_closings", data.cashClosings || [], (closing) => ({
    id: scopedRowId(companyId, closing.id),
    company_id: companyId,
    ...documentScopeFromDocument(closing, data.issuer),
    closing_date: closing.date || "",
    user_id: closing.userId || "",
    user_name: closing.userName || "",
    document_count: Number(closing.documentCount || 0),
    total: Number(closing.total || 0),
    cash_expected: Number(closing.cashExpected || 0),
    cash_counted: Number(closing.cashCounted || 0),
    difference: Number(closing.difference || 0),
    created_at: closing.createdAt || updatedAt,
    payload: closing,
    updated_at: updatedAt
  }), companyId);
  await applyNormalizedDeletions(client, data.deletedIds || {}, companyId);
}

const companyScopedTables = new Set(["users", "clients", "products", "sales", "sale_items", "remission_guides", "inventory_movements", "app_audit_logs", "cash_closings"]);

async function clearTenantNormalizedTables(client, companyId = "") {
  if (!companyId) {
    const error = new Error("companyId es obligatorio para limpiar datos normalizados.");
    error.statusCode = 400;
    throw error;
  }
  await client.query("DELETE FROM sale_items WHERE company_id = $1", [companyId]);
  await client.query("DELETE FROM document_sequences WHERE company_id = $1", [companyId]);
  for (const table of ["cash_closings", "inventory_movements", "app_audit_logs", "remission_guides", "sales", "products", "clients", "users"]) {
    await client.query(`DELETE FROM ${table} WHERE company_id = $1`, [companyId]);
  }
}

async function syncSaasUsersFromSnapshot(client, users, companyId, updatedAt) {
  if (!companyId || !Array.isArray(users) || !users.length) return 0;

  const activeAuthIds = [];
  let syncedUsers = 0;
  for (const user of users) {
    const id = String(user?.id || "");
    const email = normalizeUserEmail(user?.email || "");
    if (!id || !email || user?.supportAccess) continue;

    const passwordHash = String(user.passwordHash || "");
    const existing = await client.query(
      `SELECT id, password_hash AS "passwordHash"
       FROM saas_users
       WHERE id = $1 OR (company_id = $2 AND email = $3)
       ORDER BY CASE WHEN id = $1 THEN 0 ELSE 1 END
       LIMIT 1`,
      [id, companyId, email]
    );
    const row = existing.rows[0];
    const payload = [
      user.name || email,
      email,
      passwordHash,
      user.role || "vendedor",
      Boolean(user.mustChangePassword),
      updatedAt
    ];

    if (row) {
      await client.query(
        `UPDATE saas_users
         SET name = $1,
             email = $2,
             password_hash = COALESCE(NULLIF($3, ''), password_hash),
             role = $4,
             status = 'active',
             password_must_change = $5,
             updated_at = $6
         WHERE id = $7`,
        [...payload, row.id]
      );
      activeAuthIds.push(row.id);
      syncedUsers += 1;
      continue;
    }

    if (!passwordHash) continue;
    await client.query(
      `INSERT INTO saas_users (id, company_id, name, email, password_hash, role, status, password_must_change, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $8)`,
      [id, companyId, user.name || email, email, passwordHash, user.role || "vendedor", Boolean(user.mustChangePassword), updatedAt]
    );
    activeAuthIds.push(id);
    syncedUsers += 1;
  }

  if (!activeAuthIds.length) return syncedUsers;
  await client.query(
    `UPDATE saas_users
     SET status = 'inactive', updated_at = $2
     WHERE company_id = $1 AND NOT (id = ANY($3::text[]))`,
    [companyId, updatedAt, activeAuthIds]
  );
  return syncedUsers;
}

async function reconcileSaasUsersFromSnapshots() {
  const client = await pool.connect();
  const now = new Date().toISOString();
  let syncedUsers = 0;
  let companies = 0;
  try {
    const result = await client.query("SELECT company_id AS \"companyId\", data, updated_at AS \"updatedAt\" FROM saas_snapshots");
    for (const row of result.rows) {
      const data = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
      companies += 1;
      syncedUsers += await syncSaasUsersFromSnapshot(client, data?.users || [], row.companyId, row.updatedAt || now);
    }
  } finally {
    client.release();
  }
  return { companies, syncedUsers };
}

async function replaceTable(client, table, items, mapRow, companyId = "") {
  const rows = uniqueRowsById(items.map(mapRow).filter((row) => row.id));
  if (companyScopedTables.has(table) && companyId) {
    if (table === "sale_items") {
      const saleIds = Array.from(new Set(rows.map((row) => row.sale_id).filter(Boolean)));
      if (saleIds.length) {
        await client.query("DELETE FROM sale_items WHERE company_id = $1 AND sale_id = ANY($2)", [companyId, saleIds]);
      }
    }
    if (table === "sales") {
      await deleteConflictingDocuments(client, "sales", rows, companyId, true);
    }
    if (table === "remission_guides") {
      await deleteConflictingDocuments(client, "remission_guides", rows, companyId, false);
    }
    await upsertRows(client, table, rows);
  } else {
    await client.query(`DELETE FROM ${table}`);
    await insertRows(client, table, rows);
  }
}

async function deleteConflictingDocuments(client, table, rows, companyId, includeDocumentType) {
  for (const row of rows) {
    if (row.access_key) {
      await client.query(`DELETE FROM ${table} WHERE company_id = $1 AND access_key = $2 AND id <> $3`, [companyId, row.access_key, row.id]);
    }
    if (row.sequence && row.environment && row.establishment && row.emission_point) {
      const params = includeDocumentType
        ? [companyId, row.document_type, row.environment, row.establishment, row.emission_point, row.sequence, row.id]
        : [companyId, row.environment, row.establishment, row.emission_point, row.sequence, row.id];
      await client.query(
        includeDocumentType
          ? `DELETE FROM ${table} WHERE company_id = $1 AND document_type = $2 AND environment = $3 AND establishment = $4 AND emission_point = $5 AND sequence = $6 AND id <> $7`
          : `DELETE FROM ${table} WHERE company_id = $1 AND environment = $2 AND establishment = $3 AND emission_point = $4 AND sequence = $5 AND id <> $6`,
        params
      );
    }
  }
}

function uniqueRowsById(rows) {
  const byId = new Map();
  rows.forEach((row) => {
    byId.set(row.id, row);
  });
  return Array.from(byId.values());
}

async function insertRows(client, table, rows) {
  if (!rows.length) return;

  const columns = Object.keys(rows[0]);
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;
  for (const row of rows) {
    const values = columns.map((column) => column === "payload" ? JSON.stringify(row[column]) : row[column]);
    await client.query(sql, values);
  }
}

async function upsertRows(client, table, rows) {
  if (!rows.length) return;

  const columns = Object.keys(rows[0]);
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  const updates = columns.filter((column) => column !== "id").map((column) => `${column} = EXCLUDED.${column}`).join(", ");
  const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates}`;
  for (const row of rows) {
    const values = columns.map((column) => column === "payload" ? JSON.stringify(row[column]) : row[column]);
    await client.query(sql, values);
  }
}

async function applyNormalizedDeletions(client, deletedIds, companyId = "") {
  if (!companyId) return;
  for (const [table, ids] of [["clients", deletedIds.clients], ["products", deletedIds.products], ["users", deletedIds.users]]) {
    const scopedIds = (Array.isArray(ids) ? ids : []).flatMap((id) => [scopedRowId(companyId, id), String(id || "")]).filter(Boolean);
    if (scopedIds.length) {
      await client.query(`DELETE FROM ${table} WHERE company_id = $1 AND id = ANY($2)`, [companyId, scopedIds]);
    }
  }
}

function scopedRowId(companyId, id) {
  const value = String(id || "");
  return companyId && value ? `${companyId}:${value}` : value;
}

function clampLimit(value, fallback, max) {
  const limit = Number(value || fallback);
  if (!Number.isFinite(limit)) return fallback;
  return Math.min(max, Math.max(1, Math.trunc(limit)));
}

function addOptionalPgFilter(where, values, column, value) {
  if (!value) return;
  values.push(String(value));
  where.push(`${column} = $${values.length}`);
}

function addDatePgFilter(where, values, column, operator, value) {
  if (!value) return;
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return;
  values.push(date.toISOString());
  where.push(`${column} ${operator} $${values.length}`);
}

async function syncDocumentHistoryIndex(client, companyId, updatedAt, sales) {
  const presentDocumentIds = sales
    .filter((sale) => (sale.documentType || "factura") === "factura")
    .map((sale) => String(sale.id || ""))
    .filter(Boolean);
  const eligibleDocumentIds = sales
    .filter((sale) => (sale.documentType || "factura") === "factura"
      && sale.status === "AUTORIZADA"
      && sale.inventoryState !== "RECONCILIATION_PENDING")
    .map((sale) => String(sale.id || ""))
    .filter(Boolean);
  if (presentDocumentIds.length) {
    await client.query(
      `UPDATE document_history_index
       SET is_visible = FALSE, summary_updated_at = $2
       WHERE company_id = $1
         AND document_type = 'factura'
         AND document_id = ANY($3::text[])
         AND is_visible = TRUE`,
      [companyId, updatedAt, presentDocumentIds]
    );
  }
  if (!eligibleDocumentIds.length) return;
  await client.query(
    `INSERT INTO document_history_index (
       company_id, document_type, document_id, environment, establishment,
       emission_point, document_scope, sequence, sequence_number, created_at,
       client_id, client_name, client_identification, total_micros,
       payment_condition, credit_balance_micros, status, sri_status,
       authorization_number, access_key, inventory_status, email_status,
       has_authorized_xml, has_ride_data, is_visible, summary_updated_at
     )
     SELECT
       sale.company_id,
       'factura',
       COALESCE(NULLIF(sale.payload->>'id', ''), sale.id),
       sale.environment,
       sale.establishment,
       sale.emission_point,
       sale.establishment || '-' || sale.emission_point,
       sale.sequence,
       CASE WHEN sale.sequence ~ '^[0-9]+$' THEN sale.sequence::bigint ELSE 0 END,
       sale.created_at,
       COALESCE(sale.client_id, ''),
       COALESCE(client_row.name, ''),
       COALESCE(client_row.identification, ''),
       round(sale.total * 1000000)::bigint,
       NULLIF(sale.payload->>'paymentCondition', ''),
       CASE
         WHEN sale.payload ? 'creditBalance'
           THEN round(COALESCE((sale.payload->>'creditBalance')::numeric, 0) * 1000000)::bigint
         ELSE NULL
       END,
       sale.status,
       sale.status,
       COALESCE(sale.authorization_number, ''),
       COALESCE(sale.access_key, ''),
       COALESCE(sale.payload->>'inventoryState', ''),
       CASE
         WHEN jsonb_typeof(sale.payload->'emailHistory') = 'array'
          AND jsonb_array_length(sale.payload->'emailHistory') > 0
           THEN COALESCE(sale.payload->'emailHistory'->-1->>'status', 'none')
         ELSE 'none'
       END,
       COALESCE(sale.payload->>'authorizedXml', '') <> '',
       COALESCE(sale.payload->>'authorizedXml', '') <> '',
       TRUE,
       $2
     FROM sales sale
     LEFT JOIN clients client_row
       ON client_row.company_id = sale.company_id
      AND client_row.id IN (sale.client_id, sale.company_id || ':' || sale.client_id)
     WHERE sale.company_id = $1
       AND COALESCE(NULLIF(sale.payload->>'id', ''), sale.id) = ANY($3::text[])
       AND sale.document_type = 'factura'
       AND sale.status = 'AUTORIZADA'
       AND COALESCE(sale.payload->>'inventoryState', '') <> 'RECONCILIATION_PENDING'
     ORDER BY sale.created_at, sale.id
     ON CONFLICT (company_id, document_type, document_id) DO UPDATE SET
       environment = EXCLUDED.environment,
       establishment = EXCLUDED.establishment,
       emission_point = EXCLUDED.emission_point,
       document_scope = EXCLUDED.document_scope,
       sequence = EXCLUDED.sequence,
       sequence_number = EXCLUDED.sequence_number,
       created_at = EXCLUDED.created_at,
       client_id = EXCLUDED.client_id,
       client_name = EXCLUDED.client_name,
       client_identification = EXCLUDED.client_identification,
       total_micros = EXCLUDED.total_micros,
       payment_condition = EXCLUDED.payment_condition,
       credit_balance_micros = EXCLUDED.credit_balance_micros,
       status = EXCLUDED.status,
       sri_status = EXCLUDED.sri_status,
       authorization_number = EXCLUDED.authorization_number,
       access_key = EXCLUDED.access_key,
       inventory_status = EXCLUDED.inventory_status,
       email_status = EXCLUDED.email_status,
       has_authorized_xml = EXCLUDED.has_authorized_xml,
       has_ride_data = EXCLUDED.has_ride_data,
       is_visible = TRUE,
       summary_updated_at = EXCLUDED.summary_updated_at`,
    [companyId, updatedAt, eligibleDocumentIds]
  );
}

async function maximumDocumentHistorySequence(companyId = "", timeoutMs = 10_000) {
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query(`SET LOCAL statement_timeout = '${Math.max(1, Math.trunc(timeoutMs))}ms'`);
    const result = await client.query(
      `SELECT COALESCE((
         SELECT history_seq
         FROM document_history_index
         WHERE company_id = $1 AND is_visible = TRUE
         ORDER BY history_seq DESC
         LIMIT 1
       ), 0)::text AS sequence`,
      [companyId]
    );
    await client.query("COMMIT");
    return String(result.rows[0]?.sequence || "0");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function listDocumentHistoryPage({ companyId = "", filters, watermark, after = null, limit = 51, timeoutMs = 10_000 }) {
  await ensureSchema();
  const client = await pool.connect();
  const values = [companyId, filters.documentType, filters.status, filters.documentScope, String(watermark)];
  const where = [
    "company_id = $1",
    "document_type = $2",
    "status = $3",
    "document_scope = $4",
    "history_seq <= $5::bigint",
    "is_visible = TRUE"
  ];
  if (filters.dateFrom) {
    values.push(`${filters.dateFrom}T00:00:00.000Z`);
    where.push(`created_at >= $${values.length}::timestamptz`);
  }
  if (filters.dateTo) {
    values.push(`${filters.dateTo}T00:00:00.000Z`);
    where.push(`created_at < ($${values.length}::timestamptz + interval '1 day')`);
  }
  if (filters.search) {
    const fullNumber = /^(\d{3})-(\d{3})-(\d{1,9})$/.exec(filters.search);
    if (fullNumber) {
      values.push(fullNumber[1], fullNumber[2], fullNumber[3].padStart(9, "0"));
      where.push(`(establishment = $${values.length - 2} AND emission_point = $${values.length - 1} AND sequence = $${values.length})`);
    } else {
      values.push(filters.search);
      where.push(`(access_key = $${values.length} OR sequence = $${values.length} OR client_identification = $${values.length})`);
    }
  }
  if (after) {
    values.push(after.createdAt, after.sequenceNumber, after.documentId);
    where.push(`(created_at, sequence_number, document_id) < ($${values.length - 2}::timestamptz, $${values.length - 1}::bigint, $${values.length}::text)`);
  }
  values.push(limit);
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query(`SET LOCAL statement_timeout = '${Math.max(1, Math.trunc(timeoutMs))}ms'`);
    const result = await client.query(
      `SELECT document_id AS "documentId", establishment, emission_point AS "emissionPoint",
              sequence, sequence_number AS "sequenceNumber", created_at AS "createdAt",
              created_at::date::text AS "issueDate", client_id AS "clientId",
              client_name AS "clientName", client_identification AS "clientIdentification",
              total_micros AS "totalMicros", payment_condition AS "paymentCondition",
              credit_balance_micros AS "creditBalanceMicros", authorization_number AS "authorizationNumber",
              inventory_status AS "inventoryStatus", email_status AS "emailStatus",
              has_authorized_xml AS "hasAuthorizedXml", has_ride_data AS "hasRideData"
       FROM document_history_index
       WHERE ${where.join(" AND ")}
       ORDER BY created_at DESC, sequence_number DESC, document_id DESC
       LIMIT $${values.length}`,
      values
    );
    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function countSnapshotHistory(client = pool, companyId = "") {
  const result = companyId
    ? await client.query("SELECT COUNT(*)::int AS count FROM saas_snapshot_history WHERE company_id = $1", [companyId])
    : await client.query("SELECT COUNT(*)::int AS count FROM app_snapshot_history");
  return Number(result.rows[0]?.count || 0);
}

async function insertBackendAudit(client, event, payload) {
  await client.query(
    "INSERT INTO audit_log (event, payload, created_at) VALUES ($1, $2::jsonb, $3)",
    [event, payload ? JSON.stringify(payload) : null, new Date().toISOString()]
  );
}

function sequenceKey(documentType, issuer, companyId = "") {
  return [companyId || "legacy", documentType, issuer.environment, issuer.establishment, issuer.emissionPoint].join(":");
}

async function initialSequenceValue(client, documentType, issuer, companyId = "") {
  const snapshot = await getSnapshot(companyId);
  const snapshotIssuer = snapshot?.data?.issuer || {};
  const scopedIssuer = issuerSequenceConfig(snapshotIssuer, issuer);
  const snapshotNext = Number(
    documentType === "nota_credito"
      ? scopedIssuer.creditNoteSequential || 1
      : documentType === "guia_remision"
        ? scopedIssuer.remissionSequential || 1
        : scopedIssuer.sequential || 1
  );
  const requestNext = Number(
    documentType === "nota_credito"
      ? issuer.creditNoteSequential || 1
      : documentType === "guia_remision"
        ? issuer.remissionSequential || 1
        : issuer.sequential || 1
  );
  const configuredNext = Math.max(snapshotNext, requestNext, 1);
  const table = documentType === "guia_remision" ? "remission_guides" : "sales";
  const dbDocumentType = documentType === "nota_credito" ? "nota_credito" : "factura";
  const result = await client.query(
    table === "sales"
      ? "SELECT COALESCE(MAX(sequence::int), 0)::int AS max FROM sales WHERE company_id = $1 AND document_type = $2 AND environment = $3 AND establishment = $4 AND emission_point = $5 AND sequence ~ '^[0-9]+$'"
      : "SELECT COALESCE(MAX(sequence::int), 0)::int AS max FROM remission_guides WHERE company_id = $1 AND environment = $2 AND establishment = $3 AND emission_point = $4 AND sequence ~ '^[0-9]+$'",
    table === "sales"
      ? [companyId || "", dbDocumentType, String(issuer.environment || ""), String(issuer.establishment || ""), String(issuer.emissionPoint || "")]
      : [companyId || "", String(issuer.environment || ""), String(issuer.establishment || ""), String(issuer.emissionPoint || "")]
  );
  return Math.max(0, configuredNext - 1, Number(result.rows[0]?.max || 0));
}

function issuerSequenceConfig(snapshotIssuer = {}, issuer = {}) {
  const establishments = Array.isArray(snapshotIssuer.establishments) ? snapshotIssuer.establishments : [];
  const scoped = establishments.find((item) =>
    String(item?.establishment || "") === String(issuer.establishment || "")
    && String(item?.emissionPoint || "") === String(issuer.emissionPoint || "")
  );
  return scoped || snapshotIssuer || {};
}

function normalizedIssuerForSequence(issuer = {}) {
  return {
    ...issuer,
    environment: String(issuer.environment || "1"),
    establishment: normalizeThreeDigits(issuer.establishment),
    emissionPoint: normalizeThreeDigits(issuer.emissionPoint),
    sequential: Math.max(1, Number(issuer.sequential || 1)),
    remissionSequential: Math.max(1, Number(issuer.remissionSequential || 1)),
    creditNoteSequential: Math.max(1, Number(issuer.creditNoteSequential || 1))
  };
}

function normalizeThreeDigits(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return (digits || "1").padStart(3, "0").slice(-3);
}

function documentScopeFromDocument(document, issuer = {}) {
  const scope = scopeFromDocument(document, issuer);
  return {
    environment: scope.environment,
    establishment: scope.establishment,
    emission_point: scope.emissionPoint
  };
}

async function close() {
  await pool.end();
}

async function createCompanyAccount({ company, admin, passwordHash, device }) {
  await ensureSchema();
  const client = await pool.connect();
  const now = new Date().toISOString();
  const companyId = uid("co");
  const userId = uid("u");
  const normalizedRuc = normalizeTenantKey(company.ruc);
  const normalizedEmail = normalizeUserEmail(admin.email);

  try {
    await client.query("BEGIN");
    const existingCompany = await client.query("SELECT id FROM saas_companies WHERE ruc = $1 LIMIT 1", [normalizedRuc]);
    if (existingCompany.rows.length) {
      const error = new Error("El RUC ingresado ya tiene una cuenta registrada. Inicie sesion o contacte soporte para recuperar el acceso.");
      error.statusCode = 409;
      throw error;
    }
    const adminUser = {
      id: userId,
      name: admin.name,
      email: normalizedEmail,
      passwordHash,
      role: "admin",
      updatedAt: now
    };
    const tenantCompany = {
      id: companyId,
      ruc: normalizedRuc,
      businessName: company.businessName,
      tradeName: company.tradeName || company.businessName,
      email: normalizedEmail,
      phone: company.phone || "",
      address: company.address || "Ecuador"
    };
    const data = normalizeDocumentScopes(buildInitialTenantData({ company: tenantCompany, adminUser }));
    validateSnapshot(data);

    await client.query(
      `INSERT INTO saas_companies (id, ruc, business_name, trade_name, email, phone, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'trial', $7, $8)`,
      [companyId, normalizedRuc, tenantCompany.businessName, tenantCompany.tradeName, normalizedEmail, tenantCompany.phone, now, now]
    );
    await client.query(
      `INSERT INTO saas_users (id, company_id, name, email, password_hash, role, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'admin', 'active', $6, $7)`,
      [userId, companyId, admin.name, normalizedEmail, passwordHash, now, now]
    );
    if (device?.deviceId) {
      await client.query(
        `INSERT INTO saas_devices (id, company_id, user_id, device_label, platform, first_seen_at, last_seen_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [String(device.deviceId), companyId, userId, String(device.deviceLabel || ""), String(device.platform || ""), now, now]
      );
    }
    await client.query("INSERT INTO saas_snapshots (company_id, data, updated_at) VALUES ($1, $2::jsonb, $3)", [companyId, JSON.stringify(data), now]);
    await appendSnapshotChanges(client, {
      shadowConfig: config.incrementalSyncShadow,
      companyId,
      currentData: {},
      finalData: data,
      occurredAt: now,
      origin: "system_operation",
      userId,
      deviceId: device?.deviceId || null
    });
    await insertBackendAudit(client, "TENANT_REGISTERED", { companyId, ruc: normalizedRuc, email: normalizedEmail });
    await client.query("COMMIT");

    return {
      company: { id: companyId, ruc: normalizedRuc, businessName: tenantCompany.businessName, tradeName: tenantCompany.tradeName, status: "trial" },
      user: { id: userId, companyId, name: admin.name, email: normalizedEmail, role: "admin" },
      data,
      updatedAt: now
    };
  } catch (error) {
    await client.query("ROLLBACK");
    if (error?.code === "23505") {
      const duplicate = new Error(error.constraint === "saas_companies_ruc_key"
        ? "El RUC ingresado ya tiene una cuenta registrada. Inicie sesion o contacte soporte para recuperar el acceso."
        : "Ya existe un usuario con ese correo dentro de la misma empresa.");
      duplicate.statusCode = 409;
      throw duplicate;
    }
    throw error;
  } finally {
    client.release();
  }
}

async function authenticateCompanyUser(
  identifier,
  password,
  device = {},
  companyId = "",
  username = ""
) {
  await ensureSchema();
  const normalizedEmail = normalizeUserEmail(identifier);
  const normalizedRuc = normalizeTenantKey(identifier);
  const normalizedUsername = String(username || "")
    .trim()
    .toLowerCase();
  const result = await pool.query(
    `SELECT u.id, u.company_id AS "companyId", u.name, u.email, u.role, u.password_hash AS "passwordHash",
            u.password_must_change AS "mustChangePassword",
            c.ruc, c.business_name AS "businessName", c.trade_name AS "tradeName", c.status AS "companyStatus"
     FROM saas_users u
     JOIN saas_companies c ON c.id = u.company_id
     WHERE u.status = 'active'
      AND (
      u.email = $1
      OR (
          c.ruc = $2
          AND (
              LOWER(u.name) = $4
              OR LOWER(split_part(u.email,'@',1)) = $4
          )
      )
)
       AND ($3 = '' OR u.company_id = $3)
     ORDER BY CASE WHEN u.email = $1 THEN 0 ELSE 1 END
     LIMIT 20`,
    [
      normalizedEmail,
      normalizedRuc,
      String(companyId || ""),
      normalizedUsername
    ]
  );
  const matchingRows = result.rows.filter((row) => verifyPassword(password, row.passwordHash));
  const matchingCompanies = uniqueCompanyAuthRows(matchingRows);
  if (matchingCompanies.length > 1 && !companyId) {
    const error = new Error("Este correo tiene varias empresas. Elija con cual desea trabajar.");
    error.statusCode = 409;
    error.companyOptions = matchingCompanies.map(companyOptionFromAuthRow);
    throw error;
  }
  if (result.rows.length > 0 && matchingRows.length === 0) {
    const error = new Error("La clave no coincide con la cuenta ingresada. Revise la clave o solicite restablecimiento al soporte.");
    error.statusCode = 401;
    throw error;
  }
  const row = matchingRows[0];
  if (!row) return null;
  if (device?.deviceId) {
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO saas_devices (id, company_id, user_id, device_label, platform, first_seen_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT(id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at, user_id = EXCLUDED.user_id`,
      [String(device.deviceId), row.companyId, row.id, String(device.deviceLabel || ""), String(device.platform || ""), now, now]
    );
  }
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    email: row.email,
    role: row.role || "admin",
    mustChangePassword: Boolean(row.mustChangePassword),
    company: {
      id: row.companyId,
      ruc: row.ruc,
      businessName: row.businessName,
      tradeName: row.tradeName,
      status: row.companyStatus
    }
  };
}

async function authenticateSupportUser(identifier, password, device = {}, companyId = "") {
  await ensureSchema();
  if (!supportPasswordMatches(password)) return null;

  const normalizedRuc = normalizeTenantKey(identifier);
  const selectedCompanyId = String(companyId || "");
  const result = selectedCompanyId
    ? await pool.query(
      `SELECT id, ruc, business_name AS "businessName", trade_name AS "tradeName", status AS "companyStatus"
       FROM saas_companies
       WHERE id = $1 AND status <> 'deleted'
       LIMIT 1`,
      [selectedCompanyId]
    )
    : /^\d{13}$/.test(normalizedRuc)
      ? await pool.query(
        `SELECT id, ruc, business_name AS "businessName", trade_name AS "tradeName", status AS "companyStatus"
         FROM saas_companies
         WHERE ruc = $1 AND status <> 'deleted'
         LIMIT 1`,
        [normalizedRuc]
      )
      : { rows: [] };
  const row = result.rows[0];
  if (!row) return null;

  const supportUser = supportUserForCompany(row);
  if (device?.deviceId) {
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO saas_devices (id, company_id, user_id, device_label, platform, first_seen_at, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT(id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at, user_id = EXCLUDED.user_id`,
      [String(device.deviceId), row.id, supportUser.id, String(device.deviceLabel || ""), String(device.platform || ""), now, now]
    );
  }
  await insertBackendAudit(pool, "SUPPORT_TENANT_LOGIN", { companyId: row.id, ruc: row.ruc, email: config.supportAdmin.email });
  return supportUser;
}

async function resetCompanyUserPassword({ identifier, passwordHash }) {
  await ensureSchema();
  const normalizedEmail = normalizeUserEmail(identifier);
  const normalizedRuc = normalizeTenantKey(identifier);
  const client = await pool.connect();
  const now = new Date().toISOString();

  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT u.id, u.company_id AS "companyId", u.name, u.email, u.role,
              c.ruc, c.business_name AS "businessName", c.trade_name AS "tradeName"
       FROM saas_users u
       JOIN saas_companies c ON c.id = u.company_id
       WHERE u.status = 'active'
         AND (u.email = $1 OR (c.ruc = $2 AND u.role = 'admin'))
       ORDER BY CASE WHEN c.ruc = $2 THEN 0 ELSE 1 END, CASE WHEN u.role = 'admin' THEN 0 ELSE 1 END
       LIMIT 20`,
      [normalizedEmail, normalizedRuc]
    );

    if (!result.rows.length) {
      await client.query("ROLLBACK");
      return null;
    }
    if (result.rows.length > 1 && normalizedEmail && !/^\d{13}$/.test(String(identifier || "").trim())) {
      const error = new Error("Ese correo pertenece a varias empresas. Ingrese el RUC de la empresa para recuperar la contrasena.");
      error.statusCode = 409;
      throw error;
    }

    const row = result.rows[0];
    await client.query("UPDATE saas_users SET password_hash = $1, password_must_change = TRUE, updated_at = $2 WHERE id = $3", [passwordHash, now, row.id]);

    const snapshot = await client.query("SELECT data FROM saas_snapshots WHERE company_id = $1", [row.companyId]);
    const data = snapshot.rows[0]?.data;
    if (data) {
      const users = Array.isArray(data.users) ? data.users : [];
      const nextUsers = users.map((user) => {
        const sameUser = String(user.id || "") === row.id || normalizeUserEmail(user.email) === row.email;
        return sameUser ? { ...user, password: undefined, passwordHash, mustChangePassword: true, updatedAt: now } : user;
      });
      const finalData = { ...data, users: nextUsers };
      await client.query("UPDATE saas_snapshots SET data = $1::jsonb, updated_at = $2 WHERE company_id = $3", [JSON.stringify(finalData), now, row.companyId]);
      await appendSnapshotChanges(client, {
        shadowConfig: config.incrementalSyncShadow,
        companyId: row.companyId,
        currentData: data,
        finalData,
        occurredAt: now,
        origin: "system_operation",
        userId: row.id
      });
    }

    await insertBackendAudit(client, "PASSWORD_RESET_REQUESTED", { companyId: row.companyId, email: row.email });
    await client.query("COMMIT");
    return {
      company: { id: row.companyId, ruc: row.ruc, businessName: row.businessName, tradeName: row.tradeName },
      user: { id: row.id, companyId: row.companyId, name: row.name, email: row.email, role: row.role || "admin" }
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function supportPasswordMatches(password) {
  if (!config.supportAdmin.enabled) return false;
  if (config.supportAdmin.passwordHash) return verifyPassword(password, config.supportAdmin.passwordHash);
  return Boolean(config.supportAdmin.password) && String(password || "") === config.supportAdmin.password;
}

function supportUserForCompany(row) {
  return {
    id: `support:${row.id}`,
    companyId: row.id,
    name: config.supportAdmin.name,
    email: config.supportAdmin.email,
    role: "admin",
    supportAccess: true,
    company: {
      id: row.id,
      ruc: row.ruc,
      businessName: row.businessName,
      tradeName: row.tradeName,
      status: row.companyStatus
    }
  };
}

async function changeCompanyUserPassword({ companyId, userId, passwordHash }) {
  await ensureSchema();
  const client = await pool.connect();
  const now = new Date().toISOString();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT id, company_id AS "companyId", name, email, role
       FROM saas_users
       WHERE id = $1 AND company_id = $2 AND status = 'active'`,
      [String(userId || ""), String(companyId || "")]
    );
    const row = result.rows[0];
    if (!row) {
      const error = new Error("No se encontro el usuario activo para cambiar la contrasena.");
      error.statusCode = 404;
      throw error;
    }
    await client.query("UPDATE saas_users SET password_hash = $1, password_must_change = FALSE, updated_at = $2 WHERE id = $3", [passwordHash, now, row.id]);

    const snapshot = await client.query("SELECT data FROM saas_snapshots WHERE company_id = $1", [row.companyId]);
    const data = snapshot.rows[0]?.data;
    if (data) {
      const users = Array.isArray(data.users) ? data.users : [];
      const nextUsers = users.map((user) => {
        const sameUser = String(user.id || "") === row.id || normalizeUserEmail(user.email) === row.email;
        return sameUser ? { ...user, password: undefined, passwordHash, mustChangePassword: false, updatedAt: now } : user;
      });
      const finalData = { ...data, users: nextUsers };
      await client.query("UPDATE saas_snapshots SET data = $1::jsonb, updated_at = $2 WHERE company_id = $3", [JSON.stringify(finalData), now, row.companyId]);
      await appendSnapshotChanges(client, {
        shadowConfig: config.incrementalSyncShadow,
        companyId: row.companyId,
        currentData: data,
        finalData,
        occurredAt: now,
        origin: "admin_operation",
        userId: row.id
      });
    }

    await insertBackendAudit(client, "PASSWORD_CHANGED", { companyId: row.companyId, email: row.email });
    await client.query("COMMIT");
    return { id: row.id, companyId: row.companyId, name: row.name, email: row.email, role: row.role || "admin", mustChangePassword: false };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function companyOptionFromAuthRow(row) {
  return {
    id: row.companyId,
    ruc: row.ruc,
    businessName: row.businessName,
    tradeName: row.tradeName,
    role: row.role || "admin",
    status: row.companyStatus
  };
}

function uniqueCompanyAuthRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = row.companyId || row.ruc;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function listTenantAccounts() {
  await ensureSchema();
  const result = await pool.query(`
    SELECT
      c.id,
      c.ruc,
      c.business_name AS "businessName",
      c.trade_name AS "tradeName",
      c.email,
      c.phone,
      c.status,
      c.created_at AS "createdAt",
      c.updated_at AS "updatedAt",
      s.updated_at AS "snapshotUpdatedAt",
      s.data AS "snapshotData",
      (SELECT COUNT(*)::int FROM saas_users u WHERE u.company_id = c.id) AS "userCount",
      (SELECT COUNT(*)::int FROM saas_devices d WHERE d.company_id = c.id) AS "deviceCount",
      (SELECT d.platform FROM saas_devices d WHERE d.company_id = c.id ORDER BY d.last_seen_at DESC LIMIT 1) AS "lastDevicePlatform",
      (SELECT d.device_label FROM saas_devices d WHERE d.company_id = c.id ORDER BY d.last_seen_at DESC LIMIT 1) AS "lastDeviceLabel",
      (SELECT d.last_seen_at FROM saas_devices d WHERE d.company_id = c.id ORDER BY d.last_seen_at DESC LIMIT 1) AS "lastDeviceAt"
    FROM saas_companies c
    LEFT JOIN saas_snapshots s ON s.company_id = c.id
    ORDER BY c.created_at DESC
  `);
  return result.rows.map((row) => {
    const data = typeof row.snapshotData === "string" ? JSON.parse(row.snapshotData) : row.snapshotData;
    return {
      id: String(row.id),
      ruc: String(row.ruc || ""),
      businessName: String(row.businessName || ""),
      tradeName: String(row.tradeName || ""),
      email: String(row.email || ""),
      phone: String(row.phone || ""),
      status: String(row.status || ""),
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : "",
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : "",
      snapshotUpdatedAt: row.snapshotUpdatedAt ? new Date(row.snapshotUpdatedAt).toISOString() : "",
      userCount: Number(row.userCount || 0),
      deviceCount: Number(row.deviceCount || 0),
      lastDevice: row.lastDeviceAt ? {
        platform: String(row.lastDevicePlatform || ""),
        label: String(row.lastDeviceLabel || ""),
        lastSeenAt: new Date(row.lastDeviceAt).toISOString()
      } : null,
      summary: data ? summarizeSnapshot(data) : null,
      license: data?.license || null
    };
  });
}

async function getSnapshotMetadata(companyId = "") {
  await ensureSchema();

  if (companyId) {
    const result = await pool.query(
      `SELECT updated_at AS "updatedAt"
       FROM saas_snapshots
       WHERE company_id = $1`,
      [companyId]
    );

    if (!result.rows.length) return null;

    return {
      updatedAt: new Date(result.rows[0].updatedAt).toISOString()
    };
  }

  const result = await pool.query(
    `SELECT updated_at AS "updatedAt"
     FROM app_snapshots
     WHERE id = 1`
  );

  if (!result.rows.length) return null;

  return {
    updatedAt: new Date(result.rows[0].updatedAt).toISOString()
  };
}

module.exports = {
  addAudit,
  authenticateCompanyUser,
  authenticateSupportUser,
  completeDomainOperation,
  close,
  createCompanyAccount,
  engine: "postgres",
  exportTenantSnapshot,
  getAudit,
  getDomainOperation,
  getSnapshot,
  findDocumentByAccessKey,
  initialize: ensureSchema,
  listGuidesHistory,
  listDocumentHistoryPage,
  listSalesHistory,
  listDiagnosticSyncChanges,
  listTenantAccounts,
  mergeSnapshotPatch,
  maximumSyncChangeSequence,
  maximumDocumentHistorySequence,
  getIncrementalPilotBootstrap,
  isIncrementalPilotDeviceTrusted,
  reconcileSaasUsersFromSnapshots,
  registerOrReplayDomainOperation,
  reserveDocumentSequence,
  resetCompanyUserPassword,
  restoreTenantSnapshot,
  searchClients,
  searchProducts,
  changeCompanyUserPassword,
  getSnapshotMetadata,
  saveSnapshot
};
