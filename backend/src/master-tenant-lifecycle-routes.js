function registerMasterTenantLifecycleRoutes(app, { requireMasterKey, service }) {
  app.get("/api/master/tenants/:companyId/lifecycle", requireMasterKey, handle(async (req, res) => {
    res.json({ ok: true, ...(await service.assess(req.params.companyId)) });
  }));

  app.post("/api/master/tenants/:companyId/lifecycle", requireMasterKey, handle(async (req, res) => {
    res.json({ ok: true, ...(await service.changeStatus(req.params.companyId, req.body)) });
  }));

  app.delete("/api/master/tenants/:companyId", requireMasterKey, handle(async (req, res) => {
    res.json({ ok: true, ...(await service.permanentlyDelete(req.params.companyId, req.body)) });
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

module.exports = { registerMasterTenantLifecycleRoutes };
