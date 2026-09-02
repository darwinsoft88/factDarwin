const test = require("node:test");
const assert = require("node:assert/strict");
const { createMasterLicenseService } = require("../master-license-service");

function fixture(overrides = {}) {
  const saved = [];
  const logs = [];
  const snapshot = { data: { license: { status: "trial", features: { cash: true } }, clients: [] }, summary: { clients: 0 }, updatedAt: "old" };
  const service = createMasterLicenseService({
    getSnapshot: async (companyId) => companyId === "missing" ? null : snapshot,
    saveSnapshot: async (data, companyId, context) => { saved.push({ data, companyId, context }); return { updatedAt: "new", summary: { clients: 0 } }; },
    normalizeLicense: (license) => ({ ...license, normalized: true }),
    licenseStatus: ({ license } = {}) => ({ ...(license || snapshot.data.license), active: true }),
    logTechnical: (...args) => logs.push(args),
    ...overrides
  });
  return { logs, saved, service };
}

test("actualiza la licencia de empresa mediante una sola operacion administrativa", async () => {
  const { service, saved, logs } = fixture();
  const result = await service.updateTenantLicense("company-1", { status: "active" }, { userId: "master-user" });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].companyId, "company-1");
  assert.equal(saved[0].data.license.normalized, true);
  assert.deepEqual(saved[0].context, { origin: "admin_operation", userId: "master-user" });
  assert.equal(result.license.active, true);
  assert.equal(logs[0][1], "tenant_license_updated");
});

test("rechaza una empresa inexistente antes de intentar guardar", async () => {
  const { service, saved } = fixture();
  await assert.rejects(() => service.updateTenantLicense("missing", { status: "active" }), (error) => error.statusCode === 404);
  assert.equal(saved.length, 0);
});

