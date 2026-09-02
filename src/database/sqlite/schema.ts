export const SQLITE_SCHEMA_VERSION = 12;

export const SQLITE_DATABASE_NAME = "factudarwin-v2.db";

export const SQLITE_PRAGMAS = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA busy_timeout = 5000;
`;

export const SQLITE_SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_metadata (
  tenant_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS clients (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  identification_type TEXT,
  identification TEXT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  created_at TEXT,
  updated_at TEXT,
  compatibility_json TEXT,
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_clients_tenant_identification
  ON clients (tenant_id, identification);
CREATE INDEX IF NOT EXISTS idx_clients_tenant_name
  ON clients (tenant_id, name);

CREATE TABLE IF NOT EXISTS products (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  code TEXT,
  auxiliary_code TEXT,
  name TEXT NOT NULL,
  description TEXT,
  unit_price_micros INTEGER NOT NULL DEFAULT 0,
  tax_rate_basis_points INTEGER NOT NULL DEFAULT 0,
  stock_micros INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT,
  updated_at TEXT,
  compatibility_json TEXT,
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_products_tenant_code
  ON products (tenant_id, code);
CREATE INDEX IF NOT EXISTS idx_products_tenant_name
  ON products (tenant_id, name);
`;

export const SQLITE_SCHEMA_V2 = `
ALTER TABLE clients ADD COLUMN record_hash TEXT;
`;

export const SQLITE_SCHEMA_V3 = `
ALTER TABLE products ADD COLUMN item_type TEXT;
ALTER TABLE products ADD COLUMN barcode TEXT;
ALTER TABLE products ADD COLUMN cost_micros INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN min_stock_micros INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN unit_measure TEXT;
ALTER TABLE products ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1));
ALTER TABLE products ADD COLUMN record_hash TEXT;
`;

export const SQLITE_SCHEMA_V4 = `
CREATE TABLE IF NOT EXISTS catalog_validation_receipts (
  tenant_id TEXT NOT NULL,
  catalog_type TEXT NOT NULL CHECK (catalog_type IN ('clients', 'products')),
  snapshot_generation TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('validated', 'dirty')),
  schema_version INTEGER NOT NULL,
  validated_at TEXT,
  updated_at TEXT NOT NULL,
  last_error_code TEXT,
  last_error_detail TEXT,
  PRIMARY KEY (tenant_id, catalog_type)
);

CREATE INDEX IF NOT EXISTS idx_catalog_receipts_tenant_status
  ON catalog_validation_receipts (tenant_id, status);
`;

export const SQLITE_SCHEMA_V5 = `
DROP INDEX IF EXISTS idx_catalog_receipts_tenant_status;

ALTER TABLE catalog_validation_receipts
  RENAME TO catalog_validation_receipts_v4;

CREATE TABLE catalog_validation_receipts (
  tenant_id TEXT NOT NULL,
  catalog_type TEXT NOT NULL CHECK (catalog_type IN ('clients', 'products', 'sales')),
  snapshot_generation TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('validated', 'dirty')),
  schema_version INTEGER NOT NULL,
  validated_at TEXT,
  updated_at TEXT NOT NULL,
  last_error_code TEXT,
  last_error_detail TEXT,
  validation_details_json TEXT,
  PRIMARY KEY (tenant_id, catalog_type)
);

INSERT INTO catalog_validation_receipts (
  tenant_id, catalog_type, snapshot_generation, source_hash, row_count,
  status, schema_version, validated_at, updated_at, last_error_code,
  last_error_detail, validation_details_json
)
SELECT
  tenant_id, catalog_type, snapshot_generation, source_hash, row_count,
  status, schema_version, validated_at, updated_at, last_error_code,
  last_error_detail, NULL
FROM catalog_validation_receipts_v4;

DROP TABLE catalog_validation_receipts_v4;

CREATE INDEX idx_catalog_receipts_tenant_status
  ON catalog_validation_receipts (tenant_id, status);

CREATE TABLE sales (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  document_type TEXT,
  establishment TEXT,
  emission_point TEXT,
  establishment_name TEXT,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sequence TEXT NOT NULL,
  access_key TEXT NOT NULL,
  authorization_number TEXT,
  authorization_date TEXT,
  sri_environment TEXT,
  sri_message TEXT,
  source_sale_id TEXT,
  inventory_state TEXT,
  inventory_operation_id TEXT,
  credit_note_inventory_state TEXT,
  credit_note_inventory_operation_id TEXT,
  auto_invoice_on_sync INTEGER CHECK (auto_invoice_on_sync IN (0, 1)),
  auto_invoice_attempted_at TEXT,
  auto_invoice_last_error TEXT,
  converted_at TEXT,
  converted_to_sale_id TEXT,
  converted_to_sequence TEXT,
  support_document_type TEXT,
  support_document_number TEXT,
  support_authorization_number TEXT,
  support_issue_date TEXT,
  credit_reason TEXT,
  void_reason TEXT,
  voided_at TEXT,
  subtotal_micros INTEGER NOT NULL,
  tax_micros INTEGER NOT NULL,
  total_micros INTEGER NOT NULL,
  payment_method TEXT NOT NULL,
  payment_condition TEXT,
  credit_due_date TEXT,
  credit_balance_micros INTEGER,
  credit_status TEXT,
  status TEXT NOT NULL,
  payments_present INTEGER NOT NULL CHECK (payments_present IN (0, 1)),
  additional_info_present INTEGER NOT NULL CHECK (additional_info_present IN (0, 1)),
  retry_history_present INTEGER NOT NULL CHECK (retry_history_present IN (0, 1)),
  email_history_present INTEGER NOT NULL CHECK (email_history_present IN (0, 1)),
  compatibility_json TEXT,
  record_hash TEXT NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE sale_xml_documents (
  tenant_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  signed_xml TEXT,
  authorized_xml TEXT,
  PRIMARY KEY (tenant_id, sale_id),
  FOREIGN KEY (tenant_id, sale_id)
    REFERENCES sales (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE sale_items (
  tenant_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  line_index INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  item_type TEXT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity_micros INTEGER NOT NULL,
  unit_price_micros INTEGER NOT NULL,
  cost_micros INTEGER,
  discount_micros INTEGER NOT NULL,
  iva_rate_micros INTEGER NOT NULL,
  source_line_key TEXT,
  compatibility_json TEXT,
  PRIMARY KEY (tenant_id, sale_id, line_index),
  FOREIGN KEY (tenant_id, sale_id)
    REFERENCES sales (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE sale_payment_splits (
  tenant_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  payment_index INTEGER NOT NULL,
  payment_id TEXT,
  payment_method TEXT NOT NULL,
  amount_micros INTEGER NOT NULL,
  bank TEXT,
  reference TEXT,
  compatibility_json TEXT,
  PRIMARY KEY (tenant_id, sale_id, payment_index),
  FOREIGN KEY (tenant_id, sale_id)
    REFERENCES sales (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE sale_additional_info (
  tenant_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  field_index INTEGER NOT NULL,
  field_id TEXT,
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  compatibility_json TEXT,
  PRIMARY KEY (tenant_id, sale_id, field_index),
  FOREIGN KEY (tenant_id, sale_id)
    REFERENCES sales (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE sale_retry_history (
  tenant_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  retry_index INTEGER NOT NULL,
  attempted_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, sale_id, retry_index),
  FOREIGN KEY (tenant_id, sale_id)
    REFERENCES sales (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE sale_email_history (
  tenant_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  history_index INTEGER NOT NULL,
  recipient TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  compatibility_json TEXT,
  PRIMARY KEY (tenant_id, sale_id, history_index),
  FOREIGN KEY (tenant_id, sale_id)
    REFERENCES sales (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_sales_tenant_created
  ON sales (tenant_id, created_at);
CREATE INDEX idx_sales_tenant_type_status_created
  ON sales (tenant_id, document_type, status, created_at);
CREATE INDEX idx_sales_tenant_client_created
  ON sales (tenant_id, client_id, created_at);
CREATE INDEX idx_sales_tenant_scope_created
  ON sales (tenant_id, establishment, emission_point, created_at);
CREATE INDEX idx_sales_tenant_sequence
  ON sales (tenant_id, sequence);
CREATE INDEX idx_sales_tenant_access_key
  ON sales (tenant_id, access_key);
CREATE INDEX idx_sales_tenant_authorization
  ON sales (tenant_id, authorization_number);
CREATE INDEX idx_sales_tenant_source
  ON sales (tenant_id, source_sale_id);
CREATE INDEX idx_sales_tenant_converted
  ON sales (tenant_id, converted_to_sale_id);
CREATE INDEX idx_sales_tenant_credit
  ON sales (tenant_id, payment_condition, credit_status, credit_due_date);
CREATE INDEX idx_sales_tenant_inventory_operation
  ON sales (tenant_id, inventory_operation_id);
CREATE INDEX idx_sale_items_tenant_product
  ON sale_items (tenant_id, product_id);
CREATE INDEX idx_sale_items_tenant_source_line
  ON sale_items (tenant_id, source_line_key);
`;

export const SQLITE_SCHEMA_V6 = `
ALTER TABLE sales ADD COLUMN source_index INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_sales_tenant_source_index
  ON sales (tenant_id, source_index);
`;

export const SQLITE_SCHEMA_V7 = `
DROP INDEX IF EXISTS idx_catalog_receipts_tenant_status;

ALTER TABLE catalog_validation_receipts
  RENAME TO catalog_validation_receipts_v6;

CREATE TABLE catalog_validation_receipts (
  tenant_id TEXT NOT NULL,
  catalog_type TEXT NOT NULL CHECK (
    catalog_type IN ('clients', 'products', 'sales', 'inventory_movements')
  ),
  snapshot_generation TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('validated', 'dirty')),
  schema_version INTEGER NOT NULL,
  validated_at TEXT,
  updated_at TEXT NOT NULL,
  last_error_code TEXT,
  last_error_detail TEXT,
  validation_details_json TEXT,
  PRIMARY KEY (tenant_id, catalog_type)
);

INSERT INTO catalog_validation_receipts (
  tenant_id, catalog_type, snapshot_generation, source_hash, row_count,
  status, schema_version, validated_at, updated_at, last_error_code,
  last_error_detail, validation_details_json
)
SELECT
  tenant_id, catalog_type, snapshot_generation, source_hash, row_count,
  status, schema_version, validated_at, updated_at, last_error_code,
  last_error_detail, validation_details_json
FROM catalog_validation_receipts_v6;

DROP TABLE catalog_validation_receipts_v6;

CREATE INDEX idx_catalog_receipts_tenant_status
  ON catalog_validation_receipts (tenant_id, status);

CREATE TABLE inventory_movements (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  source_index INTEGER NOT NULL,
  product_id TEXT,
  product_name TEXT,
  movement_type TEXT,
  quantity_micros INTEGER,
  stock_before_micros INTEGER,
  stock_after_micros INTEGER,
  reason TEXT,
  reference TEXT,
  sale_id TEXT,
  inventory_operation_id TEXT,
  inventory_operation_type TEXT,
  user_id TEXT,
  created_at TEXT,
  compatibility_json TEXT NOT NULL,
  record_hash TEXT NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX idx_inventory_movements_tenant_source
  ON inventory_movements (tenant_id, source_index);
CREATE INDEX idx_inventory_movements_tenant_product_created
  ON inventory_movements (tenant_id, product_id, created_at);
CREATE INDEX idx_inventory_movements_tenant_sale
  ON inventory_movements (tenant_id, sale_id);
CREATE INDEX idx_inventory_movements_tenant_operation
  ON inventory_movements (
    tenant_id, inventory_operation_id, inventory_operation_type
  );
CREATE INDEX idx_inventory_movements_tenant_type_created
  ON inventory_movements (tenant_id, movement_type, created_at);
`;

export const SQLITE_SCHEMA_V8 = `
DROP INDEX IF EXISTS idx_catalog_receipts_tenant_status;

ALTER TABLE catalog_validation_receipts
  RENAME TO catalog_validation_receipts_v7;

CREATE TABLE catalog_validation_receipts (
  tenant_id TEXT NOT NULL,
  catalog_type TEXT NOT NULL CHECK (
    catalog_type IN (
      'clients', 'products', 'sales', 'inventory_movements',
      'credit_payments', 'credit_adjustments'
    )
  ),
  snapshot_generation TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('validated', 'dirty')),
  schema_version INTEGER NOT NULL,
  validated_at TEXT,
  updated_at TEXT NOT NULL,
  last_error_code TEXT,
  last_error_detail TEXT,
  validation_details_json TEXT,
  PRIMARY KEY (tenant_id, catalog_type)
);

INSERT INTO catalog_validation_receipts (
  tenant_id, catalog_type, snapshot_generation, source_hash, row_count,
  status, schema_version, validated_at, updated_at, last_error_code,
  last_error_detail, validation_details_json
)
SELECT
  tenant_id, catalog_type, snapshot_generation, source_hash, row_count,
  status, schema_version, validated_at, updated_at, last_error_code,
  last_error_detail, validation_details_json
FROM catalog_validation_receipts_v7;

DROP TABLE catalog_validation_receipts_v7;

CREATE INDEX idx_catalog_receipts_tenant_status
  ON catalog_validation_receipts (tenant_id, status);

CREATE TABLE credit_payments (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  source_index INTEGER NOT NULL,
  operation_id TEXT,
  batch_id TEXT,
  batch_operation_id TEXT,
  batch_size INTEGER,
  void_operation_id TEXT,
  sale_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  establishment TEXT,
  emission_point TEXT,
  establishment_name TEXT,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  amount_micros INTEGER NOT NULL,
  payment_method TEXT NOT NULL,
  note TEXT,
  payment_date TEXT NOT NULL,
  voided_at TEXT,
  voided_by_user_id TEXT,
  voided_by_user_name TEXT,
  void_reason TEXT,
  compatibility_json TEXT NOT NULL,
  record_hash TEXT NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX idx_credit_payments_tenant_sale
  ON credit_payments (tenant_id, sale_id);
CREATE INDEX idx_credit_payments_tenant_client
  ON credit_payments (tenant_id, client_id);
CREATE INDEX idx_credit_payments_tenant_operation
  ON credit_payments (tenant_id, operation_id);
CREATE INDEX idx_credit_payments_tenant_batch_operation
  ON credit_payments (tenant_id, batch_operation_id);
CREATE INDEX idx_credit_payments_tenant_date
  ON credit_payments (tenant_id, payment_date);

CREATE TABLE credit_adjustments (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  source_index INTEGER NOT NULL,
  operation_id TEXT,
  reverse_operation_id TEXT,
  adjustment_type TEXT NOT NULL,
  credit_note_id TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  amount_micros INTEGER NOT NULL,
  status TEXT NOT NULL,
  applied_at TEXT,
  reversed_at TEXT,
  user_id TEXT NOT NULL,
  reason TEXT,
  compatibility_json TEXT NOT NULL,
  record_hash TEXT NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX idx_credit_adjustments_tenant_sale
  ON credit_adjustments (tenant_id, sale_id);
CREATE INDEX idx_credit_adjustments_tenant_credit_note
  ON credit_adjustments (tenant_id, credit_note_id);
CREATE INDEX idx_credit_adjustments_tenant_operation
  ON credit_adjustments (tenant_id, operation_id);
CREATE INDEX idx_credit_adjustments_tenant_status
  ON credit_adjustments (tenant_id, status);
`;

export const SQLITE_SCHEMA_V9 = `
DROP INDEX IF EXISTS idx_catalog_receipts_tenant_status;

ALTER TABLE catalog_validation_receipts
  RENAME TO catalog_validation_receipts_v8;

CREATE TABLE catalog_validation_receipts (
  tenant_id TEXT NOT NULL,
  catalog_type TEXT NOT NULL CHECK (
    catalog_type IN (
      'clients', 'products', 'sales', 'inventory_movements',
      'credit_payments', 'credit_adjustments', 'received_retentions'
    )
  ),
  snapshot_generation TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('validated', 'dirty')),
  schema_version INTEGER NOT NULL,
  validated_at TEXT,
  updated_at TEXT NOT NULL,
  last_error_code TEXT,
  last_error_detail TEXT,
  validation_details_json TEXT,
  PRIMARY KEY (tenant_id, catalog_type)
);

INSERT INTO catalog_validation_receipts (
  tenant_id, catalog_type, snapshot_generation, source_hash, row_count,
  status, schema_version, validated_at, updated_at, last_error_code,
  last_error_detail, validation_details_json
)
SELECT
  tenant_id, catalog_type, snapshot_generation, source_hash, row_count,
  status, schema_version, validated_at, updated_at, last_error_code,
  last_error_detail, validation_details_json
FROM catalog_validation_receipts_v8;

DROP TABLE catalog_validation_receipts_v8;

CREATE INDEX idx_catalog_receipts_tenant_status
  ON catalog_validation_receipts (tenant_id, status);

CREATE TABLE received_retentions (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  source_index INTEGER NOT NULL,
  sale_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  document_number TEXT NOT NULL,
  authorization_number TEXT,
  tax_type TEXT NOT NULL,
  retention_code TEXT,
  base_micros INTEGER NOT NULL,
  percentage_micros INTEGER NOT NULL,
  amount_micros INTEGER NOT NULL,
  notes TEXT,
  compatibility_json TEXT NOT NULL,
  record_hash TEXT NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX idx_received_retentions_tenant_source
  ON received_retentions (tenant_id, source_index);
CREATE INDEX idx_received_retentions_tenant_sale
  ON received_retentions (tenant_id, sale_id);
CREATE INDEX idx_received_retentions_tenant_client
  ON received_retentions (tenant_id, client_id);
CREATE INDEX idx_received_retentions_tenant_document
  ON received_retentions (tenant_id, document_number);
CREATE INDEX idx_received_retentions_tenant_authorization
  ON received_retentions (tenant_id, authorization_number);
CREATE INDEX idx_received_retentions_tenant_received
  ON received_retentions (tenant_id, received_at);
CREATE INDEX idx_received_retentions_tenant_tax
  ON received_retentions (tenant_id, tax_type, retention_code);
`;

export const SQLITE_SCHEMA_V10 = `
DROP INDEX IF EXISTS idx_catalog_receipts_tenant_status;
ALTER TABLE catalog_validation_receipts
  RENAME TO catalog_validation_receipts_v9;

CREATE TABLE catalog_validation_receipts (
  tenant_id TEXT NOT NULL,
  catalog_type TEXT NOT NULL CHECK (
    catalog_type IN (
      'clients', 'products', 'sales', 'inventory_movements',
      'credit_payments', 'credit_adjustments', 'received_retentions',
      'remission_guides'
    )
  ),
  snapshot_generation TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('validated', 'dirty')),
  schema_version INTEGER NOT NULL,
  validated_at TEXT,
  updated_at TEXT NOT NULL,
  last_error_code TEXT,
  last_error_detail TEXT,
  validation_details_json TEXT,
  PRIMARY KEY (tenant_id, catalog_type)
);

INSERT INTO catalog_validation_receipts (
  tenant_id, catalog_type, snapshot_generation, source_hash, row_count,
  status, schema_version, validated_at, updated_at, last_error_code,
  last_error_detail, validation_details_json
)
SELECT tenant_id, catalog_type, snapshot_generation, source_hash, row_count,
  status, schema_version, validated_at, updated_at, last_error_code,
  last_error_detail, validation_details_json
FROM catalog_validation_receipts_v9;
DROP TABLE catalog_validation_receipts_v9;
CREATE INDEX idx_catalog_receipts_tenant_status
  ON catalog_validation_receipts (tenant_id, status);

CREATE TABLE remission_guides (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  source_index INTEGER NOT NULL,
  establishment TEXT,
  emission_point TEXT,
  establishment_name TEXT,
  source_sale_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sequence TEXT NOT NULL,
  access_key TEXT NOT NULL,
  authorization_number TEXT,
  authorization_date TEXT,
  sri_environment TEXT,
  sri_message TEXT,
  status TEXT NOT NULL,
  transporter_name TEXT NOT NULL,
  transporter_identification TEXT NOT NULL,
  transporter_identification_type TEXT NOT NULL,
  plate TEXT NOT NULL,
  start_address TEXT NOT NULL,
  end_address TEXT NOT NULL,
  route TEXT NOT NULL,
  reason TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  retry_history_json TEXT NOT NULL,
  compatibility_json TEXT NOT NULL,
  record_hash TEXT NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE remission_guide_items (
  tenant_id TEXT NOT NULL,
  guide_id TEXT NOT NULL,
  line_index INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  item_type TEXT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity_micros INTEGER NOT NULL,
  unit_price_micros INTEGER NOT NULL,
  cost_micros INTEGER,
  discount_micros INTEGER NOT NULL,
  iva_rate_micros INTEGER NOT NULL,
  source_line_key TEXT,
  compatibility_json TEXT NOT NULL,
  PRIMARY KEY (tenant_id, guide_id, line_index),
  FOREIGN KEY (tenant_id, guide_id)
    REFERENCES remission_guides (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE remission_guide_xml_documents (
  tenant_id TEXT NOT NULL,
  guide_id TEXT NOT NULL,
  signed_xml TEXT,
  authorized_xml TEXT,
  PRIMARY KEY (tenant_id, guide_id),
  FOREIGN KEY (tenant_id, guide_id)
    REFERENCES remission_guides (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_remission_guides_tenant_source
  ON remission_guides (tenant_id, source_index);
CREATE INDEX idx_remission_guides_tenant_created
  ON remission_guides (tenant_id, created_at);
CREATE INDEX idx_remission_guides_tenant_status
  ON remission_guides (tenant_id, status);
CREATE INDEX idx_remission_guides_tenant_scope
  ON remission_guides (tenant_id, establishment, emission_point);
CREATE INDEX idx_remission_guides_tenant_sale
  ON remission_guides (tenant_id, source_sale_id);
CREATE INDEX idx_remission_guides_tenant_client
  ON remission_guides (tenant_id, client_id);
CREATE INDEX idx_remission_guides_tenant_access_key
  ON remission_guides (tenant_id, access_key);
CREATE INDEX idx_remission_guide_items_tenant_product
  ON remission_guide_items (tenant_id, product_id);
`;

export const SQLITE_SCHEMA_V11 = `
DROP INDEX IF EXISTS idx_catalog_receipts_tenant_status;
ALTER TABLE catalog_validation_receipts
  RENAME TO catalog_validation_receipts_v10;

CREATE TABLE catalog_validation_receipts (
  tenant_id TEXT NOT NULL,
  catalog_type TEXT NOT NULL CHECK (
    catalog_type IN (
      'clients', 'products', 'sales', 'inventory_movements',
      'credit_payments', 'credit_adjustments', 'received_retentions',
      'remission_guides', 'pending_sync_operations'
    )
  ),
  snapshot_generation TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('validated', 'dirty')),
  schema_version INTEGER NOT NULL,
  validated_at TEXT,
  updated_at TEXT NOT NULL,
  last_error_code TEXT,
  last_error_detail TEXT,
  validation_details_json TEXT,
  PRIMARY KEY (tenant_id, catalog_type)
);

INSERT INTO catalog_validation_receipts (
  tenant_id, catalog_type, snapshot_generation, source_hash, row_count,
  status, schema_version, validated_at, updated_at, last_error_code,
  last_error_detail, validation_details_json
)
SELECT tenant_id, catalog_type, snapshot_generation, source_hash, row_count,
  status, schema_version, validated_at, updated_at, last_error_code,
  last_error_detail, validation_details_json
FROM catalog_validation_receipts_v10;
DROP TABLE catalog_validation_receipts_v10;
CREATE INDEX idx_catalog_receipts_tenant_status
  ON catalog_validation_receipts (tenant_id, status);

CREATE TABLE pending_sync_operations (
  tenant_id TEXT NOT NULL,
  id TEXT NOT NULL,
  source_index INTEGER NOT NULL,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts >= 0),
  title TEXT NOT NULL,
  last_error TEXT,
  patch_json TEXT NOT NULL,
  record_hash TEXT NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX idx_pending_sync_tenant_source
  ON pending_sync_operations (tenant_id, source_index);
CREATE INDEX idx_pending_sync_tenant_request
  ON pending_sync_operations (tenant_id, request_id);
CREATE INDEX idx_pending_sync_tenant_created
  ON pending_sync_operations (tenant_id, created_at);
`;

export const SQLITE_SCHEMA_V12 = `
ALTER TABLE products ADD COLUMN image_key TEXT;
ALTER TABLE products ADD COLUMN image_version TEXT;
ALTER TABLE products ADD COLUMN image_updated_at TEXT;
ALTER TABLE products ADD COLUMN image_mime_type TEXT;
`;
