function createMasterTenantLifecycleService({
  listTenantAccounts,
  setTenantLifecycleStatus,
  permanentlyDeleteEmptyTenant,
  getTenantAssetStatus,
  removeTenantAssets,
  tenantDeletionAssessment,
  runPostgresBackup,
  logTechnical
}) {
  async function findTenant(companyId) {
    const tenants = listTenantAccounts ? await listTenantAccounts() : [];
    const tenant = tenants.find((item) => item.id === companyId);
    if (!tenant) throw httpError(404, "Empresa no encontrada.");
    return tenant;
  }

  function confirmTenantRuc(tenant, confirmRuc) {
    if (String(confirmRuc || "").trim() !== tenant.ruc) throw httpError(400, "El RUC de confirmacion no coincide.");
  }

  return {
    async assess(companyId) {
      const tenant = await findTenant(companyId);
      const assets = getTenantAssetStatus(companyId);
      return { tenant, assets, assessment: tenantDeletionAssessment(tenant.summary || {}, assets) };
    },

    async changeStatus(companyId, payload) {
      if (!setTenantLifecycleStatus) throw httpError(501, "Administracion de empresas no disponible en este motor.");
      const action = String(payload?.action || "");
      const status = { deactivate: "inactive", archive: "archived", reactivate: "active" }[action];
      if (!status) throw httpError(400, "Accion de empresa invalida.");
      const tenant = await findTenant(companyId);
      confirmTenantRuc(tenant, payload?.confirmRuc);
      const company = await setTenantLifecycleStatus(tenant.id, status);
      logTechnical("warn", "tenant_lifecycle_changed", { companyId: tenant.id, ruc: tenant.ruc, action, status });
      return { action, company };
    },

    async permanentlyDelete(companyId, payload) {
      if (!permanentlyDeleteEmptyTenant) throw httpError(501, "Eliminacion segura no disponible en este motor.");
      const tenant = await findTenant(companyId);
      confirmTenantRuc(tenant, payload?.confirmRuc);
      const assets = getTenantAssetStatus(tenant.id);
      const assessment = tenantDeletionAssessment(tenant.summary || {}, assets);
      if (!assessment.canDeletePermanently) {
        const error = httpError(409, assessment.reasons.join(" "));
        error.assessment = assessment;
        throw error;
      }
      const preBackup = await runPostgresBackup("pre-tenant-delete");
      const result = await permanentlyDeleteEmptyTenant(tenant.id);
      const removedAssets = removeTenantAssets(tenant.id);
      logTechnical("warn", "tenant_permanently_deleted", { companyId: tenant.id, ruc: tenant.ruc, preBackup, removedAssets });
      return { result, preBackup, removedAssets };
    }
  };
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = { createMasterTenantLifecycleService };
