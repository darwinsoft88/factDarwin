const { Pool } = require("pg");
const config = require("./config");
const {
  applySnapshotPatch,
  compactSnapshotForStorage,
  normalizeClientIdentification,
  normalizeDocumentScopes,
  normalizeProductCode,
  normalizeTenantKey,
  normalizeUserEmail,
  scopeFromDocument,
  summarizeSnapshot,
  validateSnapshot
} = require("./db-utils");
const { verifyPassword } = require("./auth");
const { buildInitialTenantData, uid } = require("./saas");

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
      CREATE INDEX IF NOT EXISTS idx_sale_items_company_sale
        ON sale_items(company_id, sale_id);
      CREATE INDEX IF NOT EXISTS idx_inventory_company_created_at
        ON inventory_movements(company_id, created_at DESC);
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
      CREATE INDEX IF NOT EXISTS idx_guides_company_created_at
        ON remission_guides(company_id, created_at DESC);
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
    `);
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

async function saveSnapshot(data, companyId = "") {
  data = normalizeDocumentScopes(data);
  validateSnapshot(data);
  await ensureSchema();

  const client = await pool.connect();
  const updatedAt = new Date().toISOString();
  try {
    await client.query("BEGIN");
    let mergedData = data;
    if (companyId) {
      const locked = await client.query("SELECT data FROM saas_snapshots WHERE company_id = $1 FOR UPDATE", [companyId]);
      const currentData = locked.rows[0]?.data
        ? typeof locked.rows[0].data === "string" ? JSON.parse(locked.rows[0].data) : locked.rows[0].data
        : null;
      mergedData = currentData
        ? normalizeDocumentScopes(applySnapshotPatch(currentData, { ...data, baseData: currentData }))
        : normalizeDocumentScopes(data);
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

async function mergeSnapshotPatch(patch, companyId = "") {
  await ensureSchema();

  const client = await pool.connect();
  const updatedAt = new Date().toISOString();
  try {
    await client.query("BEGIN");
    const locked = companyId
      ? await client.query("SELECT data FROM saas_snapshots WHERE company_id = $1 FOR UPDATE", [companyId])
      : await client.query("SELECT data FROM app_snapshots WHERE id = 1 FOR UPDATE");
    const currentData = locked.rows[0]?.data
      ? typeof locked.rows[0].data === "string" ? JSON.parse(locked.rows[0].data) : locked.rows[0].data
      : null;
    const data = normalizeDocumentScopes(applySnapshotPatch(currentData, patch));
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

    const summary = summarizeSnapshot(data);
    await insertBackendAudit(client, "APP_INCREMENTAL_MERGE", {
      ...summary,
      sales: patch.sales?.length || 0,
      products: patch.products?.length || 0,
      inventoryMovements: patch.inventoryMovements?.length || 0,
      auditLogs: patch.auditLogs?.length || 0
    });
    await client.query("COMMIT");
    return { ok: true, updatedAt, summary };
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
  return { items: rows.rows.map((row) => typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload), total, limit, offset, hasMore: offset + rows.rows.length < total };
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
    id: user.id,
    company_id: companyId,
    name: user.name || "",
    email: normalizeUserEmail(user.email || ""),
    role: user.role || "vendedor",
    payload: user,
    updated_at: updatedAt
  }), companyId);

  await replaceTable(client, "clients", data.clients || [], (item) => ({
    id: item.id,
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
    id: item.id,
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
    id: sale.id,
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

  await replaceTable(client, "sale_items", (data.sales || []).flatMap((sale) => (sale.items || []).map((item, index) => ({ sale, item, index }))), ({ sale, item, index }) => ({
    id: `${sale.id}:${index}`,
    company_id: companyId,
    sale_id: sale.id,
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
    id: guide.id,
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
    id: movement.id,
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
    id: entry.id,
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
    id: closing.id,
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
}

const companyScopedTables = new Set(["users", "clients", "products", "sales", "sale_items", "remission_guides", "inventory_movements", "app_audit_logs", "cash_closings"]);

async function replaceTable(client, table, items, mapRow, companyId = "") {
  if (companyScopedTables.has(table)) {
    await client.query(`DELETE FROM ${table} WHERE company_id = $1`, [companyId]);
  } else {
    await client.query(`DELETE FROM ${table}`);
  }
  const rows = items.map(mapRow).filter((row) => row.id);
  await insertRows(client, table, rows);
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

async function authenticateCompanyUser(email, password, device = {}, companyId = "") {
  await ensureSchema();
  const normalizedEmail = normalizeUserEmail(email);
  const normalizedRuc = normalizeTenantKey(email);
  const result = await pool.query(
    `SELECT u.id, u.company_id AS "companyId", u.name, u.email, u.role, u.password_hash AS "passwordHash",
            u.password_must_change AS "mustChangePassword",
            c.ruc, c.business_name AS "businessName", c.trade_name AS "tradeName", c.status AS "companyStatus"
     FROM saas_users u
     JOIN saas_companies c ON c.id = u.company_id
     WHERE u.status = 'active'
       AND (u.email = $1 OR (c.ruc = $2 AND u.role = 'admin'))
       AND ($3 = '' OR u.company_id = $3)
     ORDER BY CASE WHEN u.email = $1 THEN 0 ELSE 1 END
     LIMIT 20`,
    [normalizedEmail, normalizedRuc, String(companyId || "")]
  );
  const matchingRows = result.rows.filter((row) => verifyPassword(password, row.passwordHash));
  if (matchingRows.length > 1 && !companyId) {
    const error = new Error("Este correo tiene varias empresas. Elija con cual desea trabajar.");
    error.statusCode = 409;
    error.companyOptions = matchingRows.map(companyOptionFromAuthRow);
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
      await client.query("UPDATE saas_snapshots SET data = $1::jsonb, updated_at = $2 WHERE company_id = $3", [JSON.stringify({ ...data, users: nextUsers }), now, row.companyId]);
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
      await client.query("UPDATE saas_snapshots SET data = $1::jsonb, updated_at = $2 WHERE company_id = $3", [JSON.stringify({ ...data, users: nextUsers }), now, row.companyId]);
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

module.exports = {
  addAudit,
  authenticateCompanyUser,
  close,
  createCompanyAccount,
  engine: "postgres",
  getAudit,
  getSnapshot,
  initialize: ensureSchema,
  listGuidesHistory,
  listSalesHistory,
  listTenantAccounts,
  mergeSnapshotPatch,
  reserveDocumentSequence,
  resetCompanyUserPassword,
  changeCompanyUserPassword,
  saveSnapshot
};
