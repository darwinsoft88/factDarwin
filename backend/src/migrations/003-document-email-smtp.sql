ALTER TABLE document_email_operations
  DROP CONSTRAINT IF EXISTS document_email_operations_status_check;

ALTER TABLE document_email_operations
  ADD CONSTRAINT document_email_operations_status_check
  CHECK (status IN ('pending', 'processing', 'accepted', 'failed', 'uncertain'));

ALTER TABLE document_email_operations
  ADD COLUMN IF NOT EXISTS smtp_accepted_recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS smtp_rejected_recipients JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS smtp_envelope JSONB,
  ADD COLUMN IF NOT EXISTS sent_worker_id TEXT,
  ADD COLUMN IF NOT EXISTS send_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS send_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS smtp_elapsed_ms INTEGER;

UPDATE document_email_operations
SET smtp_accepted_recipients = accepted_recipients,
    smtp_rejected_recipients = rejected_recipients
WHERE smtp_accepted_recipients = '[]'::jsonb
  AND smtp_rejected_recipients = '[]'::jsonb
  AND (accepted_recipients <> '[]'::jsonb OR rejected_recipients <> '[]'::jsonb);

CREATE UNIQUE INDEX IF NOT EXISTS uq_document_email_smtp_message_id
ON document_email_operations (smtp_message_id)
WHERE smtp_message_id IS NOT NULL;

ALTER TABLE document_email_operations
  DROP CONSTRAINT IF EXISTS document_email_accepted_state_check;

ALTER TABLE document_email_operations
  ADD CONSTRAINT document_email_accepted_state_check
  CHECK (
    (status = 'accepted' AND accepted_at IS NOT NULL)
    OR (status <> 'accepted' AND accepted_at IS NULL)
  );
