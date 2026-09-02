const test = require("node:test");
const assert = require("node:assert/strict");
const { createMasterTenantService } = require("../master-tenant-service");
const { createMasterTenantBackupService } = require("../master-tenant-backup-service");
const { createMasterTenantLifecycleService } = require("../master-tenant-lifecycle-service");

test("lista empresas enriquecidas con el estado efectivo de licencia", async () => {
  const service = createMasterTenantService({
    listTenantAccounts: async () => [{ id: "c1", license: { status: "trial" } }],
    licenseStatus: ({ license }) => ({ ...license, active: true })
  });
  assert.deepEqual(await service.list(), {
    items: [{ id: "c1", license: { status: "trial", active: true } }],
    page: 1, pageSize: 1, total: 1, totalPages: 1
  });
});

test("delega busqueda y paginacion al repositorio sin cargar toda la cartera", async () => {
  let received;
  const service = createMasterTenantService({
    listTenantAccountsPage: async (options) => {
      received = options;
      return { items: [{ id: "c2", license: { status: "active" } }], page: 2, pageSize: 20, total: 45, totalPages: 3, stats: { total: 100 } };
    },
    licenseStatus: ({ license }) => ({ ...license, active: true })
  });
  const result = await service.list({ query: "Darwin", status: "active", page: 2, pageSize: 20 });
  assert.deepEqual(received, { query: "Darwin", status: "active", page: 2, pageSize: 20 });
  assert.equal(result.items[0].license.active, true);
  assert.equal(result.totalPages, 3);
  assert.equal(result.stats.total, 100);
});

test("restaurar exige backup y RUC antes de generar el respaldo preventivo", async () => {
  let backupRuns = 0;
  const service = createMasterTenantBackupService({
    restoreTenantSnapshot: async () => ({}),
    runPostgresBackup: async () => { backupRuns += 1; },
    logTechnical: () => {}
  });
  await assert.rejects(() => service.restoreTenant("c1", {}), (error) => error.statusCode === 400);
  await assert.rejects(() => service.restoreTenant("c1", { backup: {} }), (error) => error.statusCode === 400);
  assert.equal(backupRuns, 0);
});

function lifecycleFixture(overrides = {}) {
  const calls = [];
  const tenant = { id: "c1", ruc: "1790012345001", summary: { users: 1 } };
  const service = createMasterTenantLifecycleService({
    listTenantAccounts: async () => [tenant],
    setTenantLifecycleStatus: async (...args) => { calls.push(args); return { id: "c1", status: args[1] }; },
    permanentlyDeleteEmptyTenant: async () => ({ deleted: true }),
    getTenantAssetStatus: () => ({ certificate: false, logo: false }),
    removeTenantAssets: () => ({ removed: true }),
    tenantDeletionAssessment: () => ({ canDeletePermanently: true, reasons: [] }),
    runPostgresBackup: async () => ({ file: "backup.dump" }),
    logTechnical: () => {},
    ...overrides
  });
  return { calls, service };
}

test("ciclo de vida valida el RUC antes de cambiar el estado", async () => {
  const { calls, service } = lifecycleFixture();
  await assert.rejects(
    () => service.changeStatus("c1", { action: "deactivate", confirmRuc: "incorrecto" }),
    (error) => error.statusCode === 400
  );
  assert.equal(calls.length, 0);
  const result = await service.changeStatus("c1", { action: "archive", confirmRuc: "1790012345001" });
  assert.equal(result.company.status, "archived");
});

test("eliminacion definitiva conserva el diagnostico cuando la empresa no esta vacia", async () => {
  const assessment = { canDeletePermanently: false, reasons: ["Tiene usuarios."] };
  const { service } = lifecycleFixture({ tenantDeletionAssessment: () => assessment });
  await assert.rejects(
    () => service.permanentlyDelete("c1", { confirmRuc: "1790012345001" }),
    (error) => error.statusCode === 409 && error.assessment === assessment
  );
});
