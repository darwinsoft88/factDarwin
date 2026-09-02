function registerMasterTenantBackupRoutes(app, { requireMasterKey, service }) {
  app.get("/api/master/tenants/:companyId/export", requireMasterKey, handle(async (req, res) => {
    const result = await service.exportTenant(req.params.companyId);
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.json({ ok: true, backup: result.backup });
  }));

  app.post("/api/master/tenants/:companyId/restore", requireMasterKey, handle(async (req, res) => {
    const userId = req.user?.sub || req.user?.id || null;
    res.json({ ok: true, ...(await service.restoreTenant(req.params.companyId, req.body, userId)) });
  }));
}

function handle(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { registerMasterTenantBackupRoutes };
