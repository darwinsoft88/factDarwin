ALTER TABLE saas_subscription_payments
  ADD COLUMN IF NOT EXISTS license_applied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS license_plan TEXT,
  ADD COLUMN IF NOT EXISTS license_expires_at DATE,
  ADD COLUMN IF NOT EXISTS license_applied_by TEXT;

CREATE INDEX IF NOT EXISTS idx_saas_subscription_payments_license_applied
  ON saas_subscription_payments(company_id, license_applied_at DESC)
  WHERE license_applied_at IS NOT NULL;
