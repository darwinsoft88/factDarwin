ALTER TABLE document_email_operations
  ADD COLUMN IF NOT EXISTS simulated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS simulation_result JSONB,
  ADD COLUMN IF NOT EXISTS simulation_worker_id TEXT;

CREATE INDEX IF NOT EXISTS idx_document_email_simulation_queue
ON document_email_operations (next_attempt_at, created_at)
WHERE simulated_at IS NULL
  AND retryable = TRUE
  AND status IN ('pending', 'failed');
