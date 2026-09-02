const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeLicense, requireLicenseFeatures } = require("../license");

test("una desactivacion explicita se respeta incluso durante el trial", () => {
  const license = normalizeLicense({ plan: "trial", features: { clients: false, cash: false } });
  assert.equal(license.features.clients, false);
  assert.equal(license.features.cash, false);
  assert.equal(license.features.products, true);
});

test("el backend bloquea operaciones de un modulo desactivado", async () => {
  const middleware = requireLicenseFeatures(async () => ({ data: {
    license: { status: "active", expiresAt: "2099-12-31", features: { credits: false } }
  } }), () => ["credits"]);
  const error = await new Promise((resolve) => middleware({ user: { companyId: "company-1" } }, {}, resolve));
  assert.equal(error.statusCode, 403);
  assert.equal(error.code, "MODULE_DISABLED");
  assert.equal(error.feature, "credits");
});

