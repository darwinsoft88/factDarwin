const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function source(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

test("pagos mantiene separadas interfaz, rutas y persistencia", () => {
  const server = source("server.js");
  const database = source("db-postgres.js");
  const panel = source("master-panel.js");
  assert.doesNotMatch(server, /app\.(get|post|patch)\("\/api\/master\/tenants\/:companyId\/payments/);
  assert.doesNotMatch(database, /INSERT INTO saas_subscription_payments/);
  assert.doesNotMatch(panel, /function renderPayments\(/);
  assert.match(server, /registerMasterPaymentRoutes/);
  assert.match(server, /createMasterPaymentService/);
  assert.match(database, /createSubscriptionPaymentsRepository/);
  assert.match(panel, /paymentPanelMarkup/);
  assert.match(database, /009-saas-payment-license-application\.sql/);
  assert.match(database, /010-saas-payment-license-reversal\.sql/);
});

test("licencias mantiene sus rutas y aplicacion fuera del servidor principal", () => {
  const server = source("server.js");
  assert.doesNotMatch(server, /app\.(get|put)\("\/api\/master\/license/);
  assert.doesNotMatch(server, /app\.put\("\/api\/master\/tenants\/:companyId\/license/);
  assert.match(server, /createMasterLicenseService/);
  assert.match(server, /registerMasterLicenseRoutes/);
});

test("empresas, ciclo de vida y respaldos no definen rutas dentro del servidor principal", () => {
  const server = source("server.js");
  assert.doesNotMatch(server, /app\.get\("\/api\/master\/tenants"/);
  assert.doesNotMatch(server, /app\.(get|post)\("\/api\/master\/tenants\/:companyId\/(lifecycle|export|restore)/);
  assert.doesNotMatch(server, /app\.delete\("\/api\/master\/tenants\/:companyId"/);
  assert.match(server, /registerMasterTenantRoutes/);
  assert.match(server, /registerMasterTenantLifecycleRoutes/);
  assert.match(server, /registerMasterTenantBackupRoutes/);
});
