function registerMasterLicenseRoutes(app, { requireMasterKey, service }) {
  app.get("/api/master/license", requireMasterKey, handle(async (_req, res) => {
    res.json({ ok: true, ...(await service.getLegacyLicense()) });
  }));

  app.put("/api/master/license", requireMasterKey, handle(async (req, res) => {
    res.json(await service.updateLegacyLicense(req.body?.license));
  }));

  app.get("/api/master/tenants/:companyId", requireMasterKey, handle(async (req, res) => {
    res.json(await service.getTenantLicense(req.params.companyId));
  }));

  app.put("/api/master/tenants/:companyId/license", requireMasterKey, handle(async (req, res) => {
    res.json(await service.updateTenantLicense(req.params.companyId, req.body?.license, {
      userId: req.user?.sub || req.user?.id || null
    }));
  }));
}

function handle(action) {
  return async (req, res, next) => {
    try { await action(req, res); } catch (error) { next(error); }
  };
}

module.exports = { registerMasterLicenseRoutes };

