const test = require("node:test");
const assert = require("node:assert/strict");
const { preserveAuthoritativeLicense, removeClientLicensePatch } = require("../license-authority");

test("un snapshot del cliente no puede reemplazar la licencia maestra", () => {
  const current = { license: { features: { cash: false } }, clients: [] };
  const incoming = { license: { features: { cash: true } }, clients: [{ id: "client-1" }] };
  const result = preserveAuthoritativeLicense(incoming, current);
  assert.equal(result.license.features.cash, false);
  assert.equal(result.clients.length, 1);
});

test("la sincronizacion elimina silenciosamente cambios de licencia del cliente", () => {
  const result = removeClientLicensePatch({ license: { status: "active" }, products: [{ id: "p-1" }] });
  assert.equal(result.attempted, true);
  assert.equal(Object.prototype.hasOwnProperty.call(result.patch, "license"), false);
  assert.equal(result.patch.products.length, 1);
});

