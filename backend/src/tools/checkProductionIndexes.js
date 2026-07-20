const fs = require("node:fs");
const path = require("node:path");

const sourcePath = path.join(__dirname, "..", "db-postgres.js");
const source = fs.readFileSync(sourcePath, "utf8");

const requiredIndexes = [
  "idx_users_company_email_unique",
  "idx_clients_company_identification_unique",
  "idx_clients_company_name",
  "idx_products_company_code_unique",
  "idx_products_company_name",
  "idx_products_company_updated_at",
  "idx_sale_items_company_sale",
  "idx_sale_items_company_product",
  "idx_inventory_company_created_at",
  "idx_inventory_company_product_created_at",
  "idx_app_audit_logs_company_created_at",
  "idx_document_sequences_company",
  "idx_sales_company_document_sequence_unique",
  "idx_sales_company_access_key_unique",
  "idx_sales_company_created_at",
  "idx_sales_company_client_created_at",
  "idx_sales_company_status_created_at",
  "idx_sales_company_document_status_created_at",
  "idx_guides_company_sequence_unique",
  "idx_guides_company_access_key_unique",
  "idx_guides_company_created_at",
  "idx_guides_company_status_created_at",
  "idx_guides_company_client_created_at",
  "idx_cash_closings_company_date",
  "idx_saas_users_company_email_unique",
  "idx_saas_devices_company_last_seen",
  "idx_saas_devices_user_last_seen",
  "idx_saas_snapshot_history_company_created_at"
];

const missing = requiredIndexes.filter((indexName) => !new RegExp(`CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+IF\\s+NOT\\s+EXISTS\\s+${indexName}\\b`, "i").test(source));

if (missing.length) {
  console.error("Indices PostgreSQL de produccion incompletos:");
  missing.forEach((indexName) => console.error(`- Falta ${indexName}`));
  process.exit(1);
}

console.log(`Production indexes OK: ${requiredIndexes.length} indice(s) criticos definidos.`);
