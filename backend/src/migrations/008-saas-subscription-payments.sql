CREATE TABLE IF NOT EXISTS saas_subscription_payments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES saas_companies(id) ON DELETE CASCADE,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  paid_at DATE NOT NULL,
  period_start DATE,
  period_end DATE,
  payment_method TEXT NOT NULL,
  reference TEXT,
  status TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_saas_subscription_payments_company_paid_at
  ON saas_subscription_payments(company_id, paid_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_saas_subscription_payments_company_status
  ON saas_subscription_payments(company_id, status, paid_at DESC);

