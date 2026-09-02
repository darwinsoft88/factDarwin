function createMasterTenantBackupService({ exportTenantSnapshot, restoreTenantSnapshot, runPostgresBackup, logTechnical }) {
  return {
    async exportTenant(companyId) {
      if (!exportTenantSnapshot) throw httpError(501, "Exportacion por empresa solo disponible en PostgreSQL.");
      const backup = await exportTenantSnapshot(companyId);
      logTechnical("info", "tenant_exported", { companyId, summary: backup.snapshot?.summary || null });
      return { backup, filename: tenantBackupFilename(backup) };
    },

    async restoreTenant(companyId, payload, userId = null) {
      if (!restoreTenantSnapshot) throw httpError(501, "Restauracion por empresa solo disponible en PostgreSQL.");
      const backup = payload?.backup;
      const confirmRuc = String(payload?.confirmRuc || "").trim();
      if (!backup || typeof backup !== "object") throw httpError(400, "Debe enviar el backup JSON de la empresa.");
      if (!confirmRuc) throw httpError(400, "Debe confirmar el RUC antes de restaurar.");

      const preBackup = await runPostgresBackup("pre-tenant-restore");
      const restore = await restoreTenantSnapshot(companyId, backup, { expectedRuc: confirmRuc, userId });
      logTechnical("warn", "tenant_restored", { companyId, summary: restore.summary, preBackup });
      return { restore, preBackup };
    }
  };
}

function tenantBackupFilename(backup = {}) {
  const ruc = String(backup.company?.ruc || backup.company?.id || "empresa").replace(/[^a-zA-Z0-9_-]/g, "");
  const date = new Date().toISOString().slice(0, 10);
  return `factudarwin-${ruc || "empresa"}-${date}.json`;
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = { createMasterTenantBackupService, tenantBackupFilename };
