CREATE TABLE IF NOT EXISTS document_history_index (
  history_seq BIGSERIAL PRIMARY KEY,
  company_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  document_id TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT '',
  establishment TEXT NOT NULL,
  emission_point TEXT NOT NULL,
  document_scope TEXT NOT NULL,
  sequence TEXT NOT NULL,
  sequence_number BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  client_id TEXT NOT NULL DEFAULT '',
  client_name TEXT NOT NULL DEFAULT '',
  client_identification TEXT NOT NULL DEFAULT '',
  total_micros BIGINT NOT NULL DEFAULT 0,
  payment_condition TEXT,
  credit_balance_micros BIGINT,
  status TEXT NOT NULL,
  sri_status TEXT NOT NULL,
  authorization_number TEXT NOT NULL DEFAULT '',
  access_key TEXT NOT NULL DEFAULT '',
  inventory_status TEXT NOT NULL DEFAULT '',
  email_status TEXT NOT NULL DEFAULT 'none',
  has_authorized_xml BOOLEAN NOT NULL DEFAULT FALSE,
  has_ride_data BOOLEAN NOT NULL DEFAULT FALSE,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  summary_updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (company_id, document_type, document_id)
);

CREATE INDEX IF NOT EXISTS idx_document_history_page
  ON document_history_index (
    company_id,
    document_type,
    status,
    document_scope,
    created_at DESC,
    sequence_number DESC,
    document_id DESC
  )
  WHERE is_visible = TRUE;

CREATE INDEX IF NOT EXISTS idx_document_history_company_watermark
  ON document_history_index (company_id, history_seq);

CREATE INDEX IF NOT EXISTS idx_document_history_exact_access_key
  ON document_history_index (company_id, access_key)
  WHERE is_visible = TRUE AND access_key <> '';

CREATE INDEX IF NOT EXISTS idx_document_history_exact_sequence
  ON document_history_index (company_id, sequence)
  WHERE is_visible = TRUE AND sequence <> '';

CREATE INDEX IF NOT EXISTS idx_document_history_exact_client_identification
  ON document_history_index (company_id, client_identification)
  WHERE is_visible = TRUE AND client_identification <> '';

INSERT INTO document_history_index (
  company_id, document_type, document_id, environment, establishment,
  emission_point, document_scope, sequence, sequence_number, created_at,
  client_id, client_name, client_identification, total_micros,
  payment_condition, credit_balance_micros, status, sri_status,
  authorization_number, access_key, inventory_status, email_status,
  has_authorized_xml, has_ride_data, is_visible, summary_updated_at
)
SELECT
  sale.company_id,
  'factura',
  COALESCE(NULLIF(sale.payload->>'id', ''), sale.id),
  sale.environment,
  sale.establishment,
  sale.emission_point,
  sale.establishment || '-' || sale.emission_point,
  sale.sequence,
  CASE WHEN sale.sequence ~ '^[0-9]+$' THEN sale.sequence::bigint ELSE 0 END,
  sale.created_at,
  COALESCE(sale.client_id, ''),
  COALESCE(client.name, ''),
  COALESCE(client.identification, ''),
  round(sale.total * 1000000)::bigint,
  NULLIF(sale.payload->>'paymentCondition', ''),
  CASE
    WHEN sale.payload ? 'creditBalance'
      THEN round(COALESCE((sale.payload->>'creditBalance')::numeric, 0) * 1000000)::bigint
    ELSE NULL
  END,
  sale.status,
  sale.status,
  COALESCE(sale.authorization_number, ''),
  COALESCE(sale.access_key, ''),
  COALESCE(sale.payload->>'inventoryState', ''),
  CASE
    WHEN jsonb_typeof(sale.payload->'emailHistory') = 'array'
     AND jsonb_array_length(sale.payload->'emailHistory') > 0
      THEN COALESCE(sale.payload->'emailHistory'->-1->>'status', 'none')
    ELSE 'none'
  END,
  COALESCE(sale.payload->>'authorizedXml', '') <> '',
  COALESCE(sale.payload->>'authorizedXml', '') <> '',
  TRUE,
  sale.updated_at
FROM sales sale
LEFT JOIN clients client
  ON client.company_id = sale.company_id
 AND client.id IN (sale.client_id, sale.company_id || ':' || sale.client_id)
WHERE sale.company_id <> ''
  AND sale.document_type = 'factura'
  AND sale.status = 'AUTORIZADA'
  AND COALESCE(sale.payload->>'inventoryState', '') <> 'RECONCILIATION_PENDING'
ORDER BY sale.company_id, sale.created_at, sale.id
ON CONFLICT (company_id, document_type, document_id) DO UPDATE SET
  environment = EXCLUDED.environment,
  establishment = EXCLUDED.establishment,
  emission_point = EXCLUDED.emission_point,
  document_scope = EXCLUDED.document_scope,
  sequence = EXCLUDED.sequence,
  sequence_number = EXCLUDED.sequence_number,
  created_at = EXCLUDED.created_at,
  client_id = EXCLUDED.client_id,
  client_name = EXCLUDED.client_name,
  client_identification = EXCLUDED.client_identification,
  total_micros = EXCLUDED.total_micros,
  payment_condition = EXCLUDED.payment_condition,
  credit_balance_micros = EXCLUDED.credit_balance_micros,
  status = EXCLUDED.status,
  sri_status = EXCLUDED.sri_status,
  authorization_number = EXCLUDED.authorization_number,
  access_key = EXCLUDED.access_key,
  inventory_status = EXCLUDED.inventory_status,
  email_status = EXCLUDED.email_status,
  has_authorized_xml = EXCLUDED.has_authorized_xml,
  has_ride_data = EXCLUDED.has_ride_data,
  is_visible = TRUE,
  summary_updated_at = EXCLUDED.summary_updated_at;
