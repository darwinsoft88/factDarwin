function registerMasterPaymentRoutes(app, { requireMasterKey, service }) {

  app.get("/api/master/tenants/:companyId/payments", requireMasterKey, async (req, res, next) => {
    try {
      const payments = await service.list(req.params.companyId, { limit: req.query.limit });
      res.json({ ok: true, companyId: req.params.companyId, payments });
    } catch (error) { next(error); }
  });

  app.post("/api/master/tenants/:companyId/payments", requireMasterKey, async (req, res, next) => {
    try {
      const payment = await service.create(req.params.companyId, req.body);
      res.status(201).json({ ok: true, payment });
    } catch (error) { next(error); }
  });

  app.patch("/api/master/tenants/:companyId/payments/:paymentId", requireMasterKey, async (req, res, next) => {
    try {
      const payment = await service.changeStatus(req.params.companyId, req.params.paymentId, req.body);
      res.json({ ok: true, payment });
    } catch (error) { next(error); }
  });

  app.post("/api/master/tenants/:companyId/payments/:paymentId/apply-renewal", requireMasterKey, async (req, res, next) => {
    try {
      const userId = req.user?.sub || req.user?.id || null;
      const result = await service.applyRenewal(req.params.companyId, req.params.paymentId, req.body, { userId });
      res.json({ ok: true, ...result });
    } catch (error) { next(error); }
  });

  app.post("/api/master/tenants/:companyId/payments/:paymentId/reverse-renewal", requireMasterKey, async (req, res, next) => {
    try {
      const userId = req.user?.sub || req.user?.id || null;
      const result = await service.reverseRenewal(req.params.companyId, req.params.paymentId, req.body, { userId });
      res.json({ ok: true, ...result });
    } catch (error) { next(error); }
  });
}

module.exports = { registerMasterPaymentRoutes };
