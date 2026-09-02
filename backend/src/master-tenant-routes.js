function registerMasterTenantRoutes(app, { requireMasterKey, service }) {
  app.get("/api/master/tenants", requireMasterKey, handle(async (_req, res) => {
    const result = await service.list({
      query: _req.query.q,
      status: _req.query.status,
      page: _req.query.page,
      pageSize: _req.query.pageSize
    });
    res.json({ ok: true, tenants: result.items, pagination: { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages }, stats: result.stats || null });
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

module.exports = { registerMasterTenantRoutes };
