const config = require("./config");
const { applySnapshotPatch, compactSnapshotForStorage, createSyncOperationMismatchError, normalizeDocumentScopes, scopeFromDocument } = require("./db-utils");

if (config.databaseUrl) {
  module.exports = require("./db-postgres");
} else {
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const { verifyPassword } = require("./auth");
const { buildInitialTenantData, uid } = require("./saas");

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
backupExistingDatabaseFile();

const db = new Database(config.dbPath);
safePragma("journal_mode = PERSIST");
safePragma("synchronous = FULL");
safePragma("foreign_keys = ON");
safePragma("busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS app_snapshots (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_snapshot_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event TEXT NOT NULL,
    payload TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    identification TEXT NOT NULL,
    identification_type TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL DEFAULT '',
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    cost REAL NOT NULL DEFAULT 0,
    iva_rate REAL NOT NULL DEFAULT 0,
    stock REAL NOT NULL DEFAULT 0,
    min_stock REAL NOT NULL DEFAULT 5,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

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
    subtotal REAL NOT NULL DEFAULT 0,
    tax REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    source_sale_id TEXT,
    created_at TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );


  CREATE TABLE IF NOT EXISTS sale_items (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL DEFAULT '',
    sale_id TEXT NOT NULL,
    line_index INTEGER NOT NULL,
    product_id TEXT,
    code TEXT,
    name TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 0,
    unit_price REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    iva_rate REAL NOT NULL DEFAULT 0,
    source_line_key TEXT,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
  );

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
    created_at TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );


  CREATE TABLE IF NOT EXISTS inventory_movements (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL DEFAULT '',
    product_id TEXT,
    product_name TEXT,
    type TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 0,
    stock_before REAL NOT NULL DEFAULT 0,
    stock_after REAL NOT NULL DEFAULT 0,
    reason TEXT,
    reference TEXT,
    user_id TEXT,
    created_at TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_audit_logs (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL DEFAULT '',
    event TEXT NOT NULL,
    entity TEXT,
    entity_id TEXT,
    summary TEXT,
    user_id TEXT,
    user_name TEXT,
    created_at TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

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
    total REAL NOT NULL DEFAULT 0,
    cash_expected REAL NOT NULL DEFAULT 0,
    cash_counted REAL NOT NULL DEFAULT 0,
    difference REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS document_sequences (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL DEFAULT '',
    document_type TEXT NOT NULL,
    establishment TEXT NOT NULL,
    emission_point TEXT NOT NULL,
    environment TEXT NOT NULL,
    current_value INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS saas_companies (
    id TEXT PRIMARY KEY,
    ruc TEXT NOT NULL UNIQUE,
    business_name TEXT NOT NULL,
    trade_name TEXT,
    email TEXT NOT NULL,
    phone TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS saas_users (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_must_change INTEGER NOT NULL DEFAULT 0,
    role TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (company_id) REFERENCES saas_companies(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS saas_devices (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    user_id TEXT,
    device_label TEXT,
    platform TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    FOREIGN KEY (company_id) REFERENCES saas_companies(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS saas_snapshots (
    company_id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (company_id) REFERENCES saas_companies(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS saas_snapshot_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sync_operations (
    company_id TEXT NOT NULL DEFAULT '',
    request_id TEXT NOT NULL,
    operation_type TEXT NOT NULL,
    operation_id TEXT,
    payload_hash TEXT NOT NULL,
    result_json TEXT,
    http_status INTEGER,
    processed_at TEXT NOT NULL,
    PRIMARY KEY (company_id, request_id)
  );
`);

ensureColumn("sales", "company_id", "TEXT NOT NULL DEFAULT ''");
ensureColumn("users", "company_id", "TEXT NOT NULL DEFAULT ''");
ensureColumn("clients", "company_id", "TEXT NOT NULL DEFAULT ''");
ensureColumn("products", "company_id", "TEXT NOT NULL DEFAULT ''");
ensureColumn("sale_items", "company_id", "TEXT NOT NULL DEFAULT ''");
ensureColumn("inventory_movements", "company_id", "TEXT NOT NULL DEFAULT ''");
ensureColumn("app_audit_logs", "company_id", "TEXT NOT NULL DEFAULT ''");
ensureColumn("document_sequences", "company_id", "TEXT NOT NULL DEFAULT ''");
ensureColumn("sales", "environment", "TEXT NOT NULL DEFAULT ''");
ensureColumn("sales", "establishment", "TEXT NOT NULL DEFAULT ''");
ensureColumn("sales", "emission_point", "TEXT NOT NULL DEFAULT ''");
ensureColumn("remission_guides", "company_id", "TEXT NOT NULL DEFAULT ''");
ensureColumn("remission_guides", "environment", "TEXT NOT NULL DEFAULT ''");
ensureColumn("remission_guides", "establishment", "TEXT NOT NULL DEFAULT ''");
ensureColumn("remission_guides", "emission_point", "TEXT NOT NULL DEFAULT ''");
ensureColumn("cash_closings", "company_id", "TEXT NOT NULL DEFAULT ''");
ensureColumn("cash_closings", "environment", "TEXT NOT NULL DEFAULT ''");
ensureColumn("cash_closings", "establishment", "TEXT NOT NULL DEFAULT ''");
ensureColumn("cash_closings", "emission_point", "TEXT NOT NULL DEFAULT ''");
ensureColumn("saas_users", "password_must_change", "INTEGER NOT NULL DEFAULT 0");
db.exec(`
  DROP INDEX IF EXISTS idx_sales_access_key_unique;
  DROP INDEX IF EXISTS idx_guides_access_key_unique;
  DROP INDEX IF EXISTS idx_sales_company_document_sequence;
  DROP INDEX IF EXISTS idx_guides_company_sequence;
  DROP INDEX IF EXISTS idx_sales_company_document_sequence_unique;
  DROP INDEX IF EXISTS idx_guides_company_sequence_unique;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_company_access_key_unique
    ON sales(company_id, access_key)
    WHERE access_key IS NOT NULL AND access_key <> '';
  CREATE UNIQUE INDEX IF NOT EXISTS idx_guides_company_access_key_unique
    ON remission_guides(company_id, access_key)
    WHERE access_key IS NOT NULL AND access_key <> '';
  CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_company_document_sequence_unique
    ON sales(company_id, document_type, environment, establishment, emission_point, sequence)
    WHERE company_id <> '' AND sequence <> '';
  CREATE UNIQUE INDEX IF NOT EXISTS idx_guides_company_sequence_unique
    ON remission_guides(company_id, environment, establishment, emission_point, sequence)
    WHERE company_id <> '' AND sequence <> '';
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
  CREATE INDEX IF NOT EXISTS idx_sale_items_company_sale
    ON sale_items(company_id, sale_id);
  CREATE INDEX IF NOT EXISTS idx_inventory_company_created_at
    ON inventory_movements(company_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_app_audit_logs_company_created_at
    ON app_audit_logs(company_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_document_sequences_company
    ON document_sequences(company_id, document_type, environment, establishment, emission_point);
`);
migrateSaasUsersEmailScope();

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_saas_users_company_email_unique
    ON saas_users(company_id, email);
  CREATE INDEX IF NOT EXISTS idx_sales_company_created_at
    ON sales(company_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sales_company_client_created_at
    ON sales(company_id, client_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sales_company_status_created_at
    ON sales(company_id, status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_guides_company_created_at
    ON remission_guides(company_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_cash_closings_company_date
    ON cash_closings(company_id, closing_date DESC);
`);

const saveSnapshotTx = db.transaction((data, updatedAt) => {
  const storedData = compactSnapshotForStorage(data);
  db.prepare(`
    INSERT INTO app_snapshots (id, data, updated_at)
    VALUES (1, @data, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run({ data: JSON.stringify(storedData), updatedAt });

  db.prepare("INSERT INTO app_snapshot_history (data, created_at) VALUES (@data, @createdAt)")
    .run({ data: JSON.stringify(storedData), createdAt: updatedAt });

  syncNormalizedTables(data, updatedAt);

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const before = countSnapshotHistory();
  db.prepare("DELETE FROM app_snapshot_history WHERE created_at < @cutoff").run({ cutoff });
  const after = countSnapshotHistory();
  const summary = summarizeSnapshot(data);

  insertBackendAudit("APP_SNAPSHOT_SAVED", { ...summary, historyCount: after, prunedHistory: Math.max(0, before - after) });

  return {
    historyCount: after,
    prunedHistory: Math.max(0, before - after)
  };
});

async function getSnapshot(companyId = "") {
  if (companyId) {
    const row = db.prepare("SELECT data, updated_at AS updatedAt FROM saas_snapshots WHERE company_id = @companyId").get({ companyId });
    if (!row) return null;
    const data = JSON.parse(String(row.data));
    return {
      data,
      updatedAt: String(row.updatedAt),
      summary: { ...summarizeSnapshot(data), historyCount: countSnapshotHistory(companyId) }
    };
  }
  const row = db.prepare("SELECT data, updated_at AS updatedAt FROM app_snapshots WHERE id = 1").get();
  if (!row) return null;
  const data = JSON.parse(String(row.data));

  return {
    data,
    updatedAt: String(row.updatedAt),
    summary: { ...summarizeSnapshot(data), historyCount: countSnapshotHistory() }
  };
}

async function saveSnapshot(data, companyId = "") {
  data = reconcileProductStockFromMovements(normalizeDocumentScopes(data));
  validateSnapshot(data);

  if (companyId) {
    const updatedAt = new Date().toISOString();
    return saveTenantSnapshotTx(companyId, data, updatedAt);
  }

  const updatedAt = new Date().toISOString();
  const retention = saveSnapshotTx(data, updatedAt);
  const summary = summarizeSnapshot(data);

  return { ok: true, updatedAt, summary: { ...summary, ...retention } };
}

const saveTenantSnapshotTx = db.transaction((companyId, data, updatedAt) => {
  const row = db.prepare("SELECT data FROM saas_snapshots WHERE company_id = @companyId").get({ companyId });
  const currentData = row?.data ? JSON.parse(String(row.data)) : null;
  const mergedData = currentData
    ? normalizeDocumentScopes(applySnapshotPatch(currentData, { ...data, baseData: currentData }))
    : normalizeDocumentScopes(data);
  const reconciledData = reconcileProductStockFromMovements(mergedData);
  validateSnapshot(reconciledData);
  const storedData = compactSnapshotForStorage(reconciledData);
  db.prepare(`
    INSERT INTO saas_snapshots (company_id, data, updated_at)
    VALUES (@companyId, @data, @updatedAt)
    ON CONFLICT(company_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run({ companyId, data: JSON.stringify(storedData), updatedAt });

  db.prepare("INSERT INTO saas_snapshot_history (company_id, data, created_at) VALUES (@companyId, @data, @createdAt)")
    .run({ companyId, data: JSON.stringify(storedData), createdAt: updatedAt });
  syncNormalizedTables(reconciledData, updatedAt, companyId);

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const before = countSnapshotHistory(companyId);
  db.prepare("DELETE FROM saas_snapshot_history WHERE company_id = @companyId AND created_at < @cutoff").run({ companyId, cutoff });
  const after = countSnapshotHistory(companyId);
  const summary = summarizeSnapshot(reconciledData);
  insertBackendAudit("TENANT_SNAPSHOT_MERGED", { companyId, ...summary, historyCount: after, prunedHistory: Math.max(0, before - after) });
  return { ok: true, updatedAt, summary: { ...summary, historyCount: after, prunedHistory: Math.max(0, before - after) } };
});

const mergeSnapshotPatchTx = db.transaction((patch, updatedAt, companyId = "", syncOperation = null) => {
  if (syncOperation) {
    const existing = db.prepare("SELECT payload_hash AS payloadHash, result_json AS resultJson FROM sync_operations WHERE company_id = @companyId AND request_id = @requestId")
      .get({ companyId, requestId: syncOperation.requestId });
    if (existing) {
      if (existing.payloadHash !== syncOperation.payloadHash) throw createSyncOperationMismatchError(syncOperation.requestId);
      return { replayResult: JSON.parse(String(existing.resultJson)) };
    }
  }

  let summary;
  if (companyId) {
    const row = db.prepare("SELECT data FROM saas_snapshots WHERE company_id = @companyId").get({ companyId });
    const currentData = row?.data ? JSON.parse(String(row.data)) : null;
    const data = reconcileProductStockFromMovements(normalizeDocumentScopes(applySnapshotPatch(currentData, patch)));
    validateSnapshot(data);
    const storedData = compactSnapshotForStorage(data);
    db.prepare(`
      INSERT INTO saas_snapshots (company_id, data, updated_at)
      VALUES (@companyId, @data, @updatedAt)
      ON CONFLICT(company_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
    `).run({ companyId, data: JSON.stringify(storedData), updatedAt });
    db.prepare("INSERT INTO saas_snapshot_history (company_id, data, created_at) VALUES (@companyId, @data, @createdAt)")
      .run({ companyId, data: JSON.stringify(storedData), createdAt: updatedAt });
    syncNormalizedTables(data, updatedAt, companyId);
    const summary = summarizeSnapshot(data);
    insertBackendAudit("TENANT_INCREMENTAL_MERGE", { companyId, ...summary });
    if (syncOperation) return completeSyncOperation(syncOperation, companyId, updatedAt, summary);
    return { summary };
  }

  const row = db.prepare("SELECT data FROM app_snapshots WHERE id = 1").get();
  const currentData = row?.data ? JSON.parse(String(row.data)) : null;
  const data = reconcileProductStockFromMovements(normalizeDocumentScopes(applySnapshotPatch(currentData, patch)));
  validateSnapshot(data);
  const storedData = compactSnapshotForStorage(data);

  db.prepare(`
    INSERT INTO app_snapshots (id, data, updated_at)
    VALUES (1, @data, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
  `).run({ data: JSON.stringify(storedData), updatedAt });
  db.prepare("INSERT INTO app_snapshot_history (data, created_at) VALUES (@data, @createdAt)")
    .run({ data: JSON.stringify(storedData), createdAt: updatedAt });
  syncNormalizedTables(data, updatedAt);
  summary = summarizeSnapshot(data);
  insertBackendAudit("APP_INCREMENTAL_MERGE", {
    ...summary,
    sales: patch.sales?.length || 0,
    products: patch.products?.length || 0,
    inventoryMovements: patch.inventoryMovements?.length || 0,
    auditLogs: patch.auditLogs?.length || 0,
    creditAdjustments: patch.creditAdjustments?.length || 0
  });
  if (syncOperation) return completeSyncOperation(syncOperation, companyId, updatedAt, summary);
  return { summary };
});

function completeSyncOperation(syncOperation, companyId, updatedAt, summary) {
  const result = { ok: true, updatedAt, summary };
  db.prepare(`INSERT INTO sync_operations
    (company_id, request_id, operation_type, operation_id, payload_hash, result_json, http_status, processed_at)
    VALUES (@companyId, @requestId, @operationType, @operationId, @payloadHash, @resultJson, 200, @processedAt)`)
    .run({ companyId, ...syncOperation, resultJson: JSON.stringify(result), processedAt: updatedAt });
  return { replayResult: result };
}

async function mergeSnapshotPatch(patch, companyId = "", syncOperation = null) {
  const updatedAt = new Date().toISOString();
  const outcome = mergeSnapshotPatchTx(patch, updatedAt, companyId, syncOperation);
  return outcome.replayResult || { ok: true, updatedAt, summary: outcome.summary };
}

async function addAudit(event, payload) {
  insertBackendAudit(event, payload);
}

async function getAudit(limit = 50) {
  return db.prepare("SELECT event, payload, created_at AS createdAt FROM audit_log ORDER BY id DESC LIMIT @limit")
    .all({ limit })
    .map((row) => ({
      event: String(row.event),
      payload: row.payload ? JSON.parse(String(row.payload)) : null,
      createdAt: String(row.createdAt)
    }));
}

async function listSalesHistory(companyId = "", filters = {}) {
  const limit = clampLimit(filters.limit, 50, 500);
  const offset = Math.max(0, Number(filters.offset || 0));
  const params = { companyId: companyId || "", limit, offset };
  const where = ["company_id = @companyId"];

  addOptionalFilter(where, params, "client_id", "clientId", filters.clientId);
  addOptionalFilter(where, params, "status", "status", filters.status);
  addOptionalFilter(where, params, "document_type", "documentType", filters.documentType);
  addDateFilter(where, params, "created_at", "dateFrom", ">=", filters.dateFrom);
  addDateFilter(where, params, "created_at", "dateTo", "<=", filters.dateTo);

  if (filters.search) {
    params.search = `%${String(filters.search).trim()}%`;
    where.push("(sequence LIKE @search OR access_key LIKE @search OR authorization_number LIKE @search)");
  }

  const whereSql = where.join(" AND ");
  const rows = db.prepare(`
    SELECT payload FROM sales
    WHERE ${whereSql}
    ORDER BY datetime(created_at) DESC, sequence DESC
    LIMIT @limit OFFSET @offset
  `).all(params);
  const total = Number(db.prepare(`SELECT COUNT(*) AS total FROM sales WHERE ${whereSql}`).get(params)?.total || 0);
  return { items: rows.map(payloadFromRow), total, limit, offset, hasMore: offset + rows.length < total };
}

async function listGuidesHistory(companyId = "", filters = {}) {
  const limit = clampLimit(filters.limit, 50, 500);
  const offset = Math.max(0, Number(filters.offset || 0));
  const params = { companyId: companyId || "", limit, offset };
  const where = ["company_id = @companyId"];

  addOptionalFilter(where, params, "client_id", "clientId", filters.clientId);
  addOptionalFilter(where, params, "status", "status", filters.status);
  addDateFilter(where, params, "created_at", "dateFrom", ">=", filters.dateFrom);
  addDateFilter(where, params, "created_at", "dateTo", "<=", filters.dateTo);

  if (filters.search) {
    params.search = `%${String(filters.search).trim()}%`;
    where.push("(sequence LIKE @search OR access_key LIKE @search OR authorization_number LIKE @search OR plate LIKE @search)");
  }

  const whereSql = where.join(" AND ");
  const rows = db.prepare(`
    SELECT payload FROM remission_guides
    WHERE ${whereSql}
    ORDER BY datetime(created_at) DESC, sequence DESC
    LIMIT @limit OFFSET @offset
  `).all(params);
  const total = Number(db.prepare(`SELECT COUNT(*) AS total FROM remission_guides WHERE ${whereSql}`).get(params)?.total || 0);
  return { items: rows.map(payloadFromRow), total, limit, offset, hasMore: offset + rows.length < total };
}

async function searchClients(companyId = "", filters = {}) {
  const limit = clampLimit(filters.limit, 25, 100);
  const offset = Math.max(0, Number(filters.offset || 0));
  const params = { companyId: companyId || "", limit, offset };
  const where = ["company_id = @companyId"];
  const search = String(filters.search || "").trim();

  if (search) {
    params.search = `%${search}%`;
    where.push("(name LIKE @search OR identification LIKE @search OR email LIKE @search OR phone LIKE @search)");
  }

  const whereSql = where.join(" AND ");
  const rows = db.prepare(`
    SELECT payload FROM clients
    WHERE ${whereSql}
    ORDER BY name ASC, identification ASC
    LIMIT @limit OFFSET @offset
  `).all(params);
  const total = Number(db.prepare(`SELECT COUNT(*) AS total FROM clients WHERE ${whereSql}`).get(params)?.total || 0);
  return { items: rows.map(payloadFromRow), total, limit, offset, hasMore: offset + rows.length < total };
}

async function searchProducts(companyId = "", filters = {}) {
  const limit = clampLimit(filters.limit, 25, 100);
  const offset = Math.max(0, Number(filters.offset || 0));
  const params = { companyId: companyId || "", limit, offset };
  const where = ["company_id = @companyId"];
  const search = String(filters.search || "").trim();

  if (search) {
    params.search = `%${search}%`;
    where.push("(code LIKE @search OR name LIKE @search)");
  }

  const whereSql = where.join(" AND ");
  const rows = db.prepare(`
    SELECT payload FROM products
    WHERE ${whereSql}
    ORDER BY code ASC, name ASC
    LIMIT @limit OFFSET @offset
  `).all(params);
  const total = Number(db.prepare(`SELECT COUNT(*) AS total FROM products WHERE ${whereSql}`).get(params)?.total || 0);
  return { items: rows.map(payloadFromRow), total, limit, offset, hasMore: offset + rows.length < total };
}

async function findDocumentByAccessKey(companyId = "", accessKey = "") {
  const normalizedAccessKey = String(accessKey || "").trim();
  if (!normalizedAccessKey) return null;

  const params = { companyId: companyId || "", accessKey: normalizedAccessKey };
  const sale = db.prepare(`
    SELECT payload FROM sales
    WHERE company_id = @companyId AND access_key = @accessKey
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(params);
  if (sale) return { type: "sale", payload: payloadFromRow(sale) };

  const guide = db.prepare(`
    SELECT payload FROM remission_guides
    WHERE company_id = @companyId AND access_key = @accessKey
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(params);
  if (guide) return { type: "guide", payload: payloadFromRow(guide) };

  return null;
}

const reserveDocumentSequenceTx = db.transaction(({ documentType = "factura", issuer, createdAt, companyId = "" }) => {
  const now = new Date().toISOString();
  issuer = normalizedIssuerForSequence(issuer);
  const id = sequenceKey(documentType, issuer, companyId);
  const initialValue = initialSequenceValue(documentType, issuer, companyId);

  db.prepare(`
    INSERT INTO document_sequences (id, company_id, document_type, establishment, emission_point, environment, current_value, updated_at)
    VALUES (@id, @companyId, @documentType, @establishment, @emissionPoint, @environment, @currentValue, @updatedAt)
    ON CONFLICT(id) DO NOTHING
  `).run({
    id,
    companyId: companyId || "",
    documentType,
    establishment: issuer.establishment,
    emissionPoint: issuer.emissionPoint,
    environment: issuer.environment,
    currentValue: initialValue,
    updatedAt: now
  });
  db.prepare("UPDATE document_sequences SET current_value = MAX(current_value, @initialValue), updated_at = @updatedAt WHERE id = @id").run({ id, initialValue, updatedAt: now });
  db.prepare("UPDATE document_sequences SET current_value = current_value + 1, updated_at = @updatedAt WHERE id = @id").run({ id, updatedAt: now });
  const sequence = Number(db.prepare("SELECT current_value AS currentValue FROM document_sequences WHERE id = @id").get({ id })?.currentValue || 1);
  insertBackendAudit("DOCUMENT_SEQUENCE_RESERVED", {
    documentType,
    establishment: issuer.establishment,
    emissionPoint: issuer.emissionPoint,
    environment: issuer.environment,
    sequence,
    createdAt
  });
  return sequence;
});

async function reserveDocumentSequence(payload) {
  return reserveDocumentSequenceTx(payload);
}

function syncNormalizedTables(data, updatedAt, companyId = "") {
  replaceTable("users", data.users || [], updatedAt, (user) => ({
    id: scopedRowId(companyId, user.id),
    company_id: companyId,
    name: user.name || "",
    email: normalizeUserEmail(user.email || ""),
    role: user.role || "vendedor",
    payload: JSON.stringify(user),
    updated_at: updatedAt
  }), companyId);
  syncSaasUsersFromSnapshot(data.users || [], updatedAt, companyId);

  ensureColumn("products", "cost", "REAL NOT NULL DEFAULT 0");
  ensureColumn("products", "min_stock", "REAL NOT NULL DEFAULT 5");

  replaceTable("clients", data.clients || [], updatedAt, (client) => ({
    id: scopedRowId(companyId, client.id),
    company_id: companyId,
    name: client.name || "",
    identification: normalizeClientIdentification(client.identification || ""),
    identification_type: client.identificationType || "",
    email: client.email || "",
    phone: client.phone || "",
    address: client.address || "",
    payload: JSON.stringify(client),
    updated_at: updatedAt
  }), companyId);

  replaceTable("products", data.products || [], updatedAt, (product) => ({
    id: scopedRowId(companyId, product.id),
    company_id: companyId,
    code: normalizeProductCode(product.code || ""),
    name: product.name || "",
    price: Number(product.price || 0),
    cost: Number(product.cost || 0),
    iva_rate: Number(product.ivaRate || 0),
    stock: Number(product.stock || 0),
    min_stock: Number(product.minStock || 5),
    payload: JSON.stringify(product),
    updated_at: updatedAt
  }), companyId);

  replaceTable("sales", data.sales || [], updatedAt, (sale) => ({
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
    payload: JSON.stringify(sale),
    updated_at: updatedAt
  }), companyId);

  replaceTable("sale_items", (data.sales || []).flatMap((sale) => (sale.items || []).map((item, index) => ({ sale, item, index }))), updatedAt, ({ sale, item, index }) => ({
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
    payload: JSON.stringify(item),
    updated_at: updatedAt
  }), companyId);

  replaceTable("remission_guides", data.guides || [], updatedAt, (guide) => ({
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
    payload: JSON.stringify(guide),
    updated_at: updatedAt
  }), companyId);

  replaceTable("inventory_movements", data.inventoryMovements || [], updatedAt, (movement) => ({
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
    payload: JSON.stringify(movement),
    updated_at: updatedAt
  }), companyId);

  replaceTable("app_audit_logs", data.auditLogs || [], updatedAt, (entry) => ({
    id: scopedRowId(companyId, entry.id),
    company_id: companyId,
    event: entry.event || "",
    entity: entry.entity || "",
    entity_id: entry.entityId || "",
    summary: entry.summary || "",
    user_id: entry.userId || "",
    user_name: entry.userName || "",
    created_at: entry.createdAt || updatedAt,
    payload: JSON.stringify(entry),
    updated_at: updatedAt
  }), companyId);

  replaceTable("cash_closings", data.cashClosings || [], updatedAt, (closing) => ({
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
    payload: JSON.stringify(closing),
    updated_at: updatedAt
  }), companyId);
  applyNormalizedDeletions(data.deletedIds || {}, companyId);
}

const companyScopedTables = new Set(["users", "clients", "products", "sales", "sale_items", "remission_guides", "inventory_movements", "app_audit_logs", "cash_closings"]);

function syncSaasUsersFromSnapshot(users, updatedAt, companyId) {
  if (!companyId || !Array.isArray(users) || !users.length) return 0;

  const findUser = db.prepare(`
    SELECT id, password_hash AS passwordHash
    FROM saas_users
    WHERE id = @id OR (company_id = @companyId AND email = @email)
    ORDER BY CASE WHEN id = @id THEN 0 ELSE 1 END
    LIMIT 1
  `);
  const updateUser = db.prepare(`
    UPDATE saas_users
    SET name = @name,
        email = @email,
        password_hash = COALESCE(NULLIF(@passwordHash, ''), password_hash),
        role = @role,
        status = 'active',
        password_must_change = @mustChangePassword,
        updated_at = @updatedAt
    WHERE id = @authId
  `);
  const insertUser = db.prepare(`
    INSERT INTO saas_users (id, company_id, name, email, password_hash, role, status, password_must_change, created_at, updated_at)
    VALUES (@id, @companyId, @name, @email, @passwordHash, @role, 'active', @mustChangePassword, @updatedAt, @updatedAt)
  `);
  const activeAuthIds = new Set();
  let syncedUsers = 0;

  users.forEach((user) => {
    const id = String(user?.id || "");
    const email = normalizeUserEmail(user?.email || "");
    if (!id || !email || user?.supportAccess) return;

    const passwordHash = String(user.passwordHash || "");
    const existing = findUser.get({ id, companyId, email });
    const payload = {
      id,
      companyId,
      name: user.name || email,
      email,
      passwordHash,
      role: user.role || "vendedor",
      mustChangePassword: user.mustChangePassword ? 1 : 0,
      updatedAt
    };

    if (existing) {
      updateUser.run({ ...payload, authId: existing.id });
      activeAuthIds.add(existing.id);
      syncedUsers += 1;
      return;
    }

    if (!passwordHash) return;
    insertUser.run(payload);
    activeAuthIds.add(id);
    syncedUsers += 1;
  });

  if (!activeAuthIds.size) return syncedUsers;
  const deactivateUser = db.prepare("UPDATE saas_users SET status = 'inactive', updated_at = @updatedAt WHERE company_id = @companyId AND id = @id");
  db.prepare("SELECT id FROM saas_users WHERE company_id = @companyId").all({ companyId }).forEach((row) => {
    if (!activeAuthIds.has(row.id)) {
      deactivateUser.run({ companyId, id: row.id, updatedAt });
    }
  });
  return syncedUsers;
}

function reconcileSaasUsersFromSnapshots() {
  const now = new Date().toISOString();
  let companies = 0;
  let syncedUsers = 0;
  db.prepare("SELECT company_id AS companyId, data, updated_at AS updatedAt FROM saas_snapshots").all().forEach((row) => {
    const data = row.data ? JSON.parse(String(row.data)) : null;
    companies += 1;
    syncedUsers += syncSaasUsersFromSnapshot(data?.users || [], row.updatedAt || now, row.companyId);
  });
  return { companies, syncedUsers };
}

function replaceTable(table, items, updatedAt, mapRow, companyId = "") {
  const rows = uniqueRowsById(items.map(mapRow).filter((row) => row.id));
  if (companyScopedTables.has(table) && companyId) {
    if (table === "sale_items") {
      const saleIds = Array.from(new Set(rows.map((row) => row.sale_id).filter(Boolean)));
      const deleteBySale = db.prepare("DELETE FROM sale_items WHERE company_id = @companyId AND sale_id = @saleId");
      saleIds.forEach((saleId) => deleteBySale.run({ companyId, saleId }));
    }
    if (table === "sales") {
      deleteConflictingDocuments("sales", rows, companyId, true);
    }
    if (table === "remission_guides") {
      deleteConflictingDocuments("remission_guides", rows, companyId, false);
    }
    upsertRows(table, rows);
  } else {
    db.prepare(`DELETE FROM ${table}`).run();
    insertRows(table, rows);
  }
}

function deleteConflictingDocuments(table, rows, companyId, includeDocumentType) {
  const deleteByAccessKey = db.prepare(`DELETE FROM ${table} WHERE company_id = @companyId AND access_key = @accessKey AND id <> @id`);
  const deleteBySaleSequence = includeDocumentType
    ? db.prepare(`DELETE FROM ${table} WHERE company_id = @companyId AND document_type = @documentType AND environment = @environment AND establishment = @establishment AND emission_point = @emissionPoint AND sequence = @sequence AND id <> @id`)
    : db.prepare(`DELETE FROM ${table} WHERE company_id = @companyId AND environment = @environment AND establishment = @establishment AND emission_point = @emissionPoint AND sequence = @sequence AND id <> @id`);

  rows.forEach((row) => {
    if (row.access_key) {
      deleteByAccessKey.run({ companyId, accessKey: row.access_key, id: row.id });
    }
    if (row.sequence && row.environment && row.establishment && row.emission_point) {
      deleteBySaleSequence.run({
        companyId,
        documentType: row.document_type,
        environment: row.environment,
        establishment: row.establishment,
        emissionPoint: row.emission_point,
        sequence: row.sequence,
        id: row.id
      });
    }
  });
}

function uniqueRowsById(rows) {
  const byId = new Map();
  rows.forEach((row) => {
    byId.set(row.id, row);
  });
  return Array.from(byId.values());
}

function insertRows(table, rows) {
  if (!rows.length) return;

  const columns = Object.keys(rows[0]);
  const insert = db.prepare(`
    INSERT INTO ${table} (${columns.join(", ")})
    VALUES (${columns.map((column) => `@${column}`).join(", ")})
  `);
  rows.forEach((row) => insert.run(row));
}

function upsertRows(table, rows) {
  if (!rows.length) return;

  const columns = Object.keys(rows[0]);
  const updates = columns.filter((column) => column !== "id").map((column) => `${column} = excluded.${column}`).join(", ");
  const insert = db.prepare(`
    INSERT INTO ${table} (${columns.join(", ")})
    VALUES (${columns.map((column) => `@${column}`).join(", ")})
    ON CONFLICT(id) DO UPDATE SET ${updates}
  `);
  rows.forEach((row) => insert.run(row));
}

function applyNormalizedDeletions(deletedIds, companyId = "") {
  if (!companyId) return;
  for (const [table, ids] of [["clients", deletedIds.clients], ["products", deletedIds.products], ["users", deletedIds.users]]) {
    const deleteRow = db.prepare(`DELETE FROM ${table} WHERE company_id = @companyId AND id = @id`);
    (Array.isArray(ids) ? ids : []).flatMap((id) => [scopedRowId(companyId, id), String(id || "")]).filter(Boolean).forEach((id) => {
      deleteRow.run({ companyId, id });
    });
  }
}

function scopedRowId(companyId, id) {
  const value = String(id || "");
  return companyId && value ? `${companyId}:${value}` : value;
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

function payloadFromRow(row) {
  return row?.payload ? JSON.parse(String(row.payload)) : null;
}

function clampLimit(value, fallback, max) {
  const limit = Number(value || fallback);
  if (!Number.isFinite(limit)) return fallback;
  return Math.min(max, Math.max(1, Math.trunc(limit)));
}

function addOptionalFilter(where, params, column, name, value) {
  if (!value) return;
  params[name] = String(value);
  where.push(`${column} = @${name}`);
}

function addDateFilter(where, params, column, name, operator, value) {
  if (!value) return;
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return;
  params[name] = date.toISOString();
  where.push(`${column} ${operator} @${name}`);
}

function validateSnapshot(data) {
  if (!data || typeof data !== "object") {
    throwBadSnapshot("Debe enviar data como objeto.");
  }
  for (const field of ["users", "clients", "products", "sales"]) {
    if (!Array.isArray(data[field])) {
      throwBadSnapshot(`Respaldo invalido: falta la lista ${field}.`);
    }
  }
  if (!data.issuer || typeof data.issuer !== "object") {
    throwBadSnapshot("Respaldo invalido: falta configuracion del emisor.");
  }

  assertNoDuplicateValues(data.clients, "identification", "cliente", normalizeClientIdentification);
  assertNoDuplicateValues(data.products, "code", "producto", normalizeProductCode);
  assertNoDuplicateValues(data.users, "email", "usuario", normalizeUserEmail);
}

function assertNoDuplicateValues(items, field, label, normalize) {
  if (!Array.isArray(items)) return;

  const seen = new Map();
  for (const item of items) {
    const value = normalize(String(item?.[field] || ""));
    if (!value) continue;

    const previous = seen.get(value);
    if (previous) {
      throwBadSnapshot(`Duplicado en ${label}: ${value}.`);
    }
    seen.set(value, item);
  }
}

function normalizeClientIdentification(value) {
  return value.trim().replace(/\s+/g, "");
}

function normalizeProductCode(value) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

function normalizeUserEmail(value) {
  return value.trim().toLowerCase();
}

function throwBadSnapshot(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

function summarizeSnapshot(data) {
  return {
    users: data.users?.length || 0,
    clients: data.clients?.length || 0,
    products: data.products?.length || 0,
    sales: data.sales?.length || 0,
    guides: data.guides?.length || 0,
    receivedRetentions: data.receivedRetentions?.length || 0,
    inventoryMovements: data.inventoryMovements?.length || 0,
    auditLogs: data.auditLogs?.length || 0,
    cashClosings: data.cashClosings?.length || 0
  };
}

function countSnapshotHistory(companyId = "") {
  if (companyId) {
    return Number(db.prepare("SELECT COUNT(*) AS count FROM saas_snapshot_history WHERE company_id = @companyId").get({ companyId })?.count || 0);
  }
  return Number(db.prepare("SELECT COUNT(*) AS count FROM app_snapshot_history").get()?.count || 0);
}

function insertBackendAudit(event, payload) {
  db.prepare("INSERT INTO audit_log (event, payload, created_at) VALUES (@event, @payload, @createdAt)").run({
    event,
    payload: payload ? JSON.stringify(payload) : null,
    createdAt: new Date().toISOString()
  });
}

function sequenceKey(documentType, issuer, companyId = "") {
  return [companyId || "legacy", documentType, issuer.environment, issuer.establishment, issuer.emissionPoint].join(":");
}

function initialSequenceValue(documentType, issuer, companyId = "") {
  const snapshot = companyId
    ? db.prepare("SELECT data FROM saas_snapshots WHERE company_id = @companyId").get({ companyId })
    : db.prepare("SELECT data FROM app_snapshots WHERE id = 1").get();
  const snapshotIssuer = snapshot ? JSON.parse(String(snapshot.data)).issuer || {} : {};
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
  const maxExisting = documentType === "guia_remision"
    ? Number(db.prepare("SELECT COALESCE(MAX(CAST(sequence AS INTEGER)), 0) AS max FROM remission_guides WHERE company_id = @companyId AND environment = @environment AND establishment = @establishment AND emission_point = @emissionPoint AND sequence GLOB '[0-9]*'").get({ companyId: companyId || "", environment: String(issuer.environment || ""), establishment: String(issuer.establishment || ""), emissionPoint: String(issuer.emissionPoint || "") })?.max || 0)
    : Number(db.prepare("SELECT COALESCE(MAX(CAST(sequence AS INTEGER)), 0) AS max FROM sales WHERE company_id = @companyId AND document_type = @documentType AND environment = @environment AND establishment = @establishment AND emission_point = @emissionPoint AND sequence GLOB '[0-9]*'").get({ companyId: companyId || "", documentType: documentType === "nota_credito" ? "nota_credito" : "factura", environment: String(issuer.environment || ""), establishment: String(issuer.establishment || ""), emissionPoint: String(issuer.emissionPoint || "") })?.max || 0);
  return Math.max(0, configuredNext - 1, maxExisting);
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

function backupExistingDatabaseFile() {
  if (!fs.existsSync(config.dbPath) || fs.statSync(config.dbPath).size === 0) return;

  const backupPath = `${config.dbPath}.before-real-db.bak`;
  if (fs.existsSync(backupPath)) return;

  fs.copyFileSync(config.dbPath, backupPath);
}

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => String(row.name));
  if (columns.includes(column)) return;
  db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
}

const createCompanyAccountTx = db.transaction(({ company, admin, passwordHash, device }) => {
  const now = new Date().toISOString();
  const companyId = uid("co");
  const userId = uid("u");
  const normalizedRuc = normalizeTenantKey(company.ruc);
  const normalizedEmail = normalizeUserEmail(admin.email);

  const existingCompany = db.prepare("SELECT id FROM saas_companies WHERE ruc = @ruc LIMIT 1").get({ ruc: normalizedRuc });
  if (existingCompany) {
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

  db.prepare(`
    INSERT INTO saas_companies (id, ruc, business_name, trade_name, email, phone, status, created_at, updated_at)
    VALUES (@id, @ruc, @businessName, @tradeName, @email, @phone, 'trial', @createdAt, @updatedAt)
  `).run({ ...tenantCompany, createdAt: now, updatedAt: now });
  db.prepare(`
    INSERT INTO saas_users (id, company_id, name, email, password_hash, role, status, created_at, updated_at)
    VALUES (@id, @companyId, @name, @email, @passwordHash, 'admin', 'active', @createdAt, @updatedAt)
  `).run({ ...adminUser, companyId, createdAt: now, updatedAt: now });
  if (device?.deviceId) {
    db.prepare(`
      INSERT INTO saas_devices (id, company_id, user_id, device_label, platform, first_seen_at, last_seen_at)
      VALUES (@id, @companyId, @userId, @deviceLabel, @platform, @firstSeenAt, @lastSeenAt)
    `).run({
      id: String(device.deviceId),
      companyId,
      userId,
      deviceLabel: String(device.deviceLabel || ""),
      platform: String(device.platform || ""),
      firstSeenAt: now,
      lastSeenAt: now
    });
  }
  db.prepare("INSERT INTO saas_snapshots (company_id, data, updated_at) VALUES (@companyId, @data, @updatedAt)")
    .run({ companyId, data: JSON.stringify(data), updatedAt: now });
  insertBackendAudit("TENANT_REGISTERED", { companyId, ruc: normalizedRuc, email: normalizedEmail });

  return {
    company: { id: companyId, ruc: normalizedRuc, businessName: tenantCompany.businessName, tradeName: tenantCompany.tradeName, status: "trial" },
    user: { id: userId, companyId, name: admin.name, email: normalizedEmail, role: "admin" },
    data,
    updatedAt: now
  };
});

async function createCompanyAccount(payload) {
  try {
    return createCompanyAccountTx(payload);
  } catch (error) {
    if (error?.code === "SQLITE_CONSTRAINT_UNIQUE") {
      const duplicate = new Error("El RUC ingresado ya tiene una cuenta registrada. Inicie sesion o contacte soporte para recuperar el acceso.");
      duplicate.statusCode = 409;
      throw duplicate;
    }
    throw error;
  }
}

async function authenticateCompanyUser(email, password, device = {}, companyId = "") {
  const normalizedEmail = normalizeUserEmail(email);
  const normalizedRuc = normalizeTenantKey(email);
  const rows = db.prepare(`
    SELECT u.id, u.company_id AS companyId, u.name, u.email, u.role, u.password_hash AS passwordHash,
           u.password_must_change AS mustChangePassword,
           c.ruc, c.business_name AS businessName, c.trade_name AS tradeName, c.status AS companyStatus
    FROM saas_users u
    JOIN saas_companies c ON c.id = u.company_id
    WHERE u.status = 'active'
      AND (u.email = @email OR (c.ruc = @ruc AND u.role = 'admin'))
      AND (@companyId = '' OR u.company_id = @companyId)
    ORDER BY CASE WHEN u.email = @email THEN 0 ELSE 1 END
  `).all({ email: normalizedEmail, ruc: normalizedRuc, companyId: String(companyId || "") });
  const matchingRows = rows.filter((row) => verifyPassword(password, row.passwordHash));
  const matchingCompanies = uniqueCompanyAuthRows(matchingRows);
  if (matchingCompanies.length > 1 && !companyId) {
    const error = new Error("Este correo tiene varias empresas. Elija con cual desea trabajar.");
    error.statusCode = 409;
    error.companyOptions = matchingCompanies.map(companyOptionFromAuthRow);
    throw error;
  }
  if (rows.length > 0 && matchingRows.length === 0) {
    const error = new Error("La clave no coincide con la cuenta ingresada. Revise la clave o solicite restablecimiento al soporte.");
    error.statusCode = 401;
    throw error;
  }
  const row = matchingRows[0];
  if (!row) return null;
  const now = new Date().toISOString();
  if (device?.deviceId) {
    db.prepare(`
      INSERT INTO saas_devices (id, company_id, user_id, device_label, platform, first_seen_at, last_seen_at)
      VALUES (@id, @companyId, @userId, @deviceLabel, @platform, @firstSeenAt, @lastSeenAt)
      ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at, user_id = excluded.user_id
    `).run({
      id: String(device.deviceId),
      companyId: row.companyId,
      userId: row.id,
      deviceLabel: String(device.deviceLabel || ""),
      platform: String(device.platform || ""),
      firstSeenAt: now,
      lastSeenAt: now
    });
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
  if (!supportPasswordMatches(password)) return null;

  const normalizedRuc = normalizeTenantKey(identifier);
  const selectedCompanyId = String(companyId || "");
  const row = selectedCompanyId
    ? db.prepare(`
      SELECT id, ruc, business_name AS businessName, trade_name AS tradeName, status AS companyStatus
      FROM saas_companies
      WHERE id = @companyId AND status <> 'deleted'
      LIMIT 1
    `).get({ companyId: selectedCompanyId })
    : /^\d{13}$/.test(normalizedRuc)
      ? db.prepare(`
        SELECT id, ruc, business_name AS businessName, trade_name AS tradeName, status AS companyStatus
        FROM saas_companies
        WHERE ruc = @ruc AND status <> 'deleted'
        LIMIT 1
      `).get({ ruc: normalizedRuc })
      : null;
  if (!row) return null;

  const supportUser = supportUserForCompany(row);
  if (device?.deviceId) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO saas_devices (id, company_id, user_id, device_label, platform, first_seen_at, last_seen_at)
      VALUES (@id, @companyId, @userId, @deviceLabel, @platform, @firstSeenAt, @lastSeenAt)
      ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at, user_id = excluded.user_id
    `).run({
      id: String(device.deviceId),
      companyId: row.id,
      userId: supportUser.id,
      deviceLabel: String(device.deviceLabel || ""),
      platform: String(device.platform || ""),
      firstSeenAt: now,
      lastSeenAt: now
    });
  }
  insertBackendAudit("SUPPORT_TENANT_LOGIN", { companyId: row.id, ruc: row.ruc, email: config.supportAdmin.email });
  return supportUser;
}

const resetCompanyUserPasswordTx = db.transaction(({ identifier, passwordHash }) => {
  const normalizedEmail = normalizeUserEmail(identifier);
  const normalizedRuc = normalizeTenantKey(identifier);
  const rows = db.prepare(`
    SELECT u.id, u.company_id AS companyId, u.name, u.email, u.role,
           c.ruc, c.business_name AS businessName, c.trade_name AS tradeName
    FROM saas_users u
    JOIN saas_companies c ON c.id = u.company_id
    WHERE u.status = 'active'
      AND (u.email = @email OR (c.ruc = @ruc AND u.role = 'admin'))
    ORDER BY CASE WHEN c.ruc = @ruc THEN 0 ELSE 1 END, CASE WHEN u.role = 'admin' THEN 0 ELSE 1 END
  `).all({ email: normalizedEmail, ruc: normalizedRuc });

  if (!rows.length) return null;
  if (rows.length > 1 && normalizedEmail && !/^\d{13}$/.test(String(identifier || "").trim())) {
    const error = new Error("Ese correo pertenece a varias empresas. Ingrese el RUC de la empresa para recuperar la contrasena.");
    error.statusCode = 409;
    throw error;
  }

  const row = rows[0];
  const now = new Date().toISOString();
  db.prepare("UPDATE saas_users SET password_hash = @passwordHash, password_must_change = 1, updated_at = @updatedAt WHERE id = @id")
    .run({ id: row.id, passwordHash, updatedAt: now });

  const snapshot = db.prepare("SELECT data FROM saas_snapshots WHERE company_id = @companyId").get({ companyId: row.companyId });
  if (snapshot?.data) {
    const data = JSON.parse(snapshot.data);
    const users = Array.isArray(data.users) ? data.users : [];
    const nextUsers = users.map((user) => {
      const sameUser = String(user.id || "") === row.id || normalizeUserEmail(user.email) === row.email;
      return sameUser ? { ...user, password: undefined, passwordHash, mustChangePassword: true, updatedAt: now } : user;
    });
    db.prepare("UPDATE saas_snapshots SET data = @data, updated_at = @updatedAt WHERE company_id = @companyId")
      .run({ companyId: row.companyId, data: JSON.stringify({ ...data, users: nextUsers }), updatedAt: now });
  }

  insertBackendAudit("PASSWORD_RESET_REQUESTED", { companyId: row.companyId, email: row.email });
  return {
    company: { id: row.companyId, ruc: row.ruc, businessName: row.businessName, tradeName: row.tradeName },
    user: { id: row.id, companyId: row.companyId, name: row.name, email: row.email, role: row.role || "admin" }
  };
});

async function resetCompanyUserPassword(payload) {
  return resetCompanyUserPasswordTx(payload);
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

const changeCompanyUserPasswordTx = db.transaction(({ companyId, userId, passwordHash }) => {
  const row = db.prepare(`
    SELECT id, company_id AS companyId, name, email, role
    FROM saas_users
    WHERE id = @userId AND company_id = @companyId AND status = 'active'
  `).get({ userId: String(userId || ""), companyId: String(companyId || "") });
  if (!row) {
    const error = new Error("No se encontro el usuario activo para cambiar la contrasena.");
    error.statusCode = 404;
    throw error;
  }
  const now = new Date().toISOString();
  db.prepare("UPDATE saas_users SET password_hash = @passwordHash, password_must_change = 0, updated_at = @updatedAt WHERE id = @id")
    .run({ id: row.id, passwordHash, updatedAt: now });

  const snapshot = db.prepare("SELECT data FROM saas_snapshots WHERE company_id = @companyId").get({ companyId: row.companyId });
  if (snapshot?.data) {
    const data = JSON.parse(snapshot.data);
    const users = Array.isArray(data.users) ? data.users : [];
    const nextUsers = users.map((user) => {
      const sameUser = String(user.id || "") === row.id || normalizeUserEmail(user.email) === row.email;
      return sameUser ? { ...user, password: undefined, passwordHash, mustChangePassword: false, updatedAt: now } : user;
    });
    db.prepare("UPDATE saas_snapshots SET data = @data, updated_at = @updatedAt WHERE company_id = @companyId")
      .run({ companyId: row.companyId, data: JSON.stringify({ ...data, users: nextUsers }), updatedAt: now });
  }

  insertBackendAudit("PASSWORD_CHANGED", { companyId: row.companyId, email: row.email });
  return { id: row.id, companyId: row.companyId, name: row.name, email: row.email, role: row.role || "admin", mustChangePassword: false };
});

async function changeCompanyUserPassword(payload) {
  return changeCompanyUserPasswordTx(payload);
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
  return db.prepare(`
    SELECT
      c.id,
      c.ruc,
      c.business_name AS businessName,
      c.trade_name AS tradeName,
      c.email,
      c.phone,
      c.status,
      c.created_at AS createdAt,
      c.updated_at AS updatedAt,
      s.updated_at AS snapshotUpdatedAt,
      s.data AS snapshotData,
      (SELECT COUNT(*) FROM saas_users u WHERE u.company_id = c.id) AS userCount,
      (SELECT COUNT(*) FROM saas_devices d WHERE d.company_id = c.id) AS deviceCount,
      (SELECT d.platform FROM saas_devices d WHERE d.company_id = c.id ORDER BY d.last_seen_at DESC LIMIT 1) AS lastDevicePlatform,
      (SELECT d.device_label FROM saas_devices d WHERE d.company_id = c.id ORDER BY d.last_seen_at DESC LIMIT 1) AS lastDeviceLabel,
      (SELECT d.last_seen_at FROM saas_devices d WHERE d.company_id = c.id ORDER BY d.last_seen_at DESC LIMIT 1) AS lastDeviceAt
    FROM saas_companies c
    LEFT JOIN saas_snapshots s ON s.company_id = c.id
    ORDER BY c.created_at DESC
  `).all().map((row) => {
    const data = row.snapshotData ? JSON.parse(String(row.snapshotData)) : null;
    return {
      id: String(row.id),
      ruc: String(row.ruc || ""),
      businessName: String(row.businessName || ""),
      tradeName: String(row.tradeName || ""),
      email: String(row.email || ""),
      phone: String(row.phone || ""),
      status: String(row.status || ""),
      createdAt: String(row.createdAt || ""),
      updatedAt: String(row.updatedAt || ""),
      snapshotUpdatedAt: String(row.snapshotUpdatedAt || ""),
      userCount: Number(row.userCount || 0),
      deviceCount: Number(row.deviceCount || 0),
      lastDevice: row.lastDeviceAt ? {
        platform: String(row.lastDevicePlatform || ""),
        label: String(row.lastDeviceLabel || ""),
        lastSeenAt: String(row.lastDeviceAt || "")
      } : null,
      summary: data ? summarizeSnapshot(data) : null,
      license: data?.license || null
    };
  });
}

function normalizeTenantKey(value) {
  return String(value || "").replace(/\D/g, "");
}

function migrateSaasUsersEmailScope() {
  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'saas_users'").get();
  if (!String(table?.sql || "").includes("email TEXT NOT NULL UNIQUE")) return;

  db.exec(`
    ALTER TABLE saas_users RENAME TO saas_users_legacy_email_unique;

    CREATE TABLE saas_users (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (company_id) REFERENCES saas_companies(id) ON DELETE CASCADE
    );

    INSERT INTO saas_users (id, company_id, name, email, password_hash, role, status, created_at, updated_at)
    SELECT id, company_id, name, email, password_hash, role, status, created_at, updated_at
    FROM saas_users_legacy_email_unique;

    DROP TABLE saas_users_legacy_email_unique;
  `);
}

function safePragma(statement) {
  try {
    db.pragma(statement);
  } catch (error) {
    console.warn(`No se pudo aplicar PRAGMA ${statement}: ${error.message}`);
  }
}

async function initialize() {
  reconcileSaasUsersFromSnapshots();
  return true;
}

module.exports = { addAudit, authenticateCompanyUser, authenticateSupportUser, changeCompanyUserPassword, createCompanyAccount, engine: "better-sqlite3", findDocumentByAccessKey, getAudit, getSnapshot, initialize, listGuidesHistory, listSalesHistory, listTenantAccounts, mergeSnapshotPatch, reconcileSaasUsersFromSnapshots, reserveDocumentSequence, resetCompanyUserPassword, searchClients, searchProducts, saveSnapshot };
}
