CREATE TABLE IF NOT EXISTS sync_change_log (
  change_seq BIGSERIAL PRIMARY KEY,
  company_id TEXT NOT NULL,
  module TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('UPSERT', 'DELETE')),
  record_version BIGINT NOT NULL CHECK (record_version > 0),
  payload JSONB,
  payload_hash TEXT NOT NULL,
  request_id TEXT,
  operation_id TEXT,
  device_id TEXT,
  user_id TEXT,
  origin TEXT NOT NULL DEFAULT 'unknown',
  occurred_at TIMESTAMPTZ NOT NULL,
  transaction_id UUID NOT NULL,
  protocol_version INTEGER NOT NULL DEFAULT 1,
  is_tombstone BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (company_id, entity_type, entity_id, record_version)
);

ALTER TABLE sync_change_log
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'unknown';

CREATE INDEX IF NOT EXISTS idx_sync_change_log_company_sequence
  ON sync_change_log (company_id, change_seq);

CREATE INDEX IF NOT EXISTS idx_sync_change_log_company_module_sequence
  ON sync_change_log (company_id, module, change_seq);

CREATE INDEX IF NOT EXISTS idx_sync_change_log_company_entity_sequence
  ON sync_change_log (company_id, entity_type, entity_id, change_seq DESC);

CREATE INDEX IF NOT EXISTS idx_sync_change_log_company_tombstone_sequence
  ON sync_change_log (company_id, is_tombstone, change_seq)
  WHERE is_tombstone = TRUE;

CREATE INDEX IF NOT EXISTS idx_sync_change_log_company_request
  ON sync_change_log (company_id, request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sync_change_log_company_origin_sequence
  ON sync_change_log (company_id, origin, change_seq);
