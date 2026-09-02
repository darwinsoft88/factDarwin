ALTER TABLE saas_subscription_payments
  ADD COLUMN IF NOT EXISTS license_previous JSONB,
  ADD COLUMN IF NOT EXISTS license_reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS license_reversed_by TEXT,
  ADD COLUMN IF NOT EXISTS license_reversal_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_saas_subscription_payments_license_reversed
  ON saas_subscription_payments(company_id, license_reversed_at DESC)
  WHERE license_reversed_at IS NOT NULL;
