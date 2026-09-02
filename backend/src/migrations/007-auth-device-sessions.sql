CREATE UNIQUE INDEX IF NOT EXISTS idx_saas_users_company_id_id
  ON saas_users (company_id, id);

CREATE TABLE IF NOT EXISTS auth_device_sessions (
  id UUID PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES saas_companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES saas_users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  token_family_id UUID NOT NULL,
  credential_version INTEGER NOT NULL DEFAULT 2 CHECK (credential_version >= 2),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  device_label TEXT,
  platform TEXT,
  app_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_device_sessions_company_user_fk'
  ) THEN
    ALTER TABLE auth_device_sessions
      ADD CONSTRAINT auth_device_sessions_company_user_fk
      FOREIGN KEY (company_id, user_id)
      REFERENCES saas_users (company_id, id)
      ON DELETE CASCADE;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_device_sessions_active_device
  ON auth_device_sessions (company_id, user_id, device_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_auth_device_sessions_user_status
  ON auth_device_sessions (company_id, user_id, status, last_used_at DESC);

CREATE TABLE IF NOT EXISTS auth_device_refresh_tokens (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES auth_device_sessions(id) ON DELETE CASCADE,
  generation BIGINT NOT NULL CHECK (generation > 0),
  token_hash TEXT NOT NULL CHECK (length(token_hash) = 64),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ,
  request_id UUID,
  replaced_by UUID REFERENCES auth_device_refresh_tokens(id),
  replay_detected_at TIMESTAMPTZ,
  UNIQUE (session_id, generation),
  UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_auth_device_refresh_tokens_session_generation
  ON auth_device_refresh_tokens (session_id, generation DESC);

CREATE INDEX IF NOT EXISTS idx_auth_device_refresh_tokens_unconsumed
  ON auth_device_refresh_tokens (session_id, issued_at DESC)
  WHERE consumed_at IS NULL;
