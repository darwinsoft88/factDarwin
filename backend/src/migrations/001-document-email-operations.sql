CREATE TABLE IF NOT EXISTS company_feature_flags (
  company_id TEXT NOT NULL,
  feature TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'off',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT,
  PRIMARY KEY (company_id, feature),
  CHECK (mode IN ('off', 'simulate', 'send'))
);

CREATE TABLE IF NOT EXISTS document_email_operations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT '',
  document_type TEXT NOT NULL,
  document_id TEXT NOT NULL,
  client_id TEXT,
  origin TEXT NOT NULL,
  status TEXT NOT NULL,
  recipient_email TEXT,
  document_number TEXT,
  authorization_number TEXT,
  authorization_date TIMESTAMPTZ,
  access_key TEXT,
  payload_json JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  accepted_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  smtp_message_id TEXT,
  smtp_response TEXT,
  accepted_recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  rejected_recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_error_code TEXT,
  last_error_message TEXT,
  retryable BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (document_type IN ('factura', 'nota_credito')),
  CHECK (origin IN ('automatic_authorization', 'manual_resend')),
  CHECK (status IN ('pending', 'processing', 'accepted', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_document_email_automatic
ON document_email_operations (
  company_id,
  document_type,
  document_id,
  origin
)
WHERE origin = 'automatic_authorization';

CREATE INDEX IF NOT EXISTS idx_document_email_queue
ON document_email_operations (status, retryable, next_attempt_at, created_at);

CREATE INDEX IF NOT EXISTS idx_document_email_company_status
ON document_email_operations (company_id, status, created_at DESC);
