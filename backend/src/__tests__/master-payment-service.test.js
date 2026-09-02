const test = require("node:test");
const assert = require("node:assert/strict");
const { createMasterPaymentService } = require("../master-payment-service");

function fixture(overrides = {}) {
  const calls = [];
  const logs = [];
  const service = createMasterPaymentService({
    listPayments: async (...args) => { calls.push(["list", ...args]); return [{ id: "p1" }]; },
    createPayment: async (...args) => { calls.push(["create", ...args]); return { id: "p2", amount: 20, status: "confirmed" }; },
    updatePaymentStatus: async (...args) => { calls.push(["status", ...args]); return { id: "p2", status: "void" }; },
    getPayment: async () => ({ id: "p2", status: "confirmed", periodStart: "2026-09-01", periodEnd: "2026-09-30" }),
    markLicenseApplied: async (...args) => { calls.push(["applied", ...args]); return { id: "p2", licenseAppliedAt: "2026-08-30T12:00:00.000Z" }; },
    markLicenseReversed: async (...args) => { calls.push(["reversed", ...args]); return { id: "p2", licenseReversedAt: "2026-08-30T13:00:00.000Z" }; },
    licenseService: {
      getTenantLicense: async () => ({ license: { status: "trial", features: { sales: true } } }),
      updateTenantLicense: async (...args) => { calls.push(["license", ...args]); return { license: args[1] }; }
    },
    normalizePaymentRenewal: () => ({ plan: "pro_mensual", startsAt: "2026-09-01", expiresAt: "2026-09-30" }),
    normalizePaymentRenewalReversal: () => ({ reason: "Pago equivocado" }),
    logTechnical: (...args) => logs.push(args),
    ...overrides
  });
  return { calls, logs, service };
}

test("el servicio de pagos coordina listado, registro y auditoria tecnica", async () => {
  const { calls, logs, service } = fixture();
  assert.deepEqual(await service.list("c1", { limit: 25 }), [{ id: "p1" }]);
  assert.equal((await service.create("c1", { amount: 20 })).id, "p2");
  assert.equal((await service.changeStatus("c1", "p2", { status: "void" })).status, "void");
  assert.deepEqual(calls[0], ["list", "c1", { limit: 25 }]);
  assert.equal(logs[0][1], "tenant_subscription_payment_created");
  assert.equal(logs[1][1], "tenant_subscription_payment_status_changed");
});

test("aplica una renovacion explicita conservando configuracion y vinculando el pago", async () => {
  const { calls, service } = fixture();
  const result = await service.applyRenewal("c1", "p2", { plan: "pro_mensual" }, { userId: "master" });
  const licenseCall = calls.find((call) => call[0] === "license");
  const appliedCall = calls.find((call) => call[0] === "applied");
  assert.equal(licenseCall[2].status, "active");
  assert.equal(licenseCall[2].features.sales, true);
  assert.equal(licenseCall[2].expiresAt, "2026-09-30");
  assert.equal(appliedCall[3].userId, "master");
  assert.equal(appliedCall[3].previousLicense.status, "trial");
  assert.equal(result.payment.id, "p2");
});

test("revierte solo la licencia que todavia corresponde al pago aplicado", async () => {
  const { calls, service } = fixture({
    getPayment: async () => ({
      id: "p2", licenseAppliedAt: "2026-08-30T12:00:00.000Z", licensePlan: "pro_mensual",
      licenseExpiresAt: "2026-09-30", licensePrevious: { status: "trial", plan: "trial", expiresAt: "2026-08-29" }
    }),
    licenseService: {
      getTenantLicense: async () => ({ license: { status: "active", plan: "pro_mensual", expiresAt: "2026-09-30" } }),
      updateTenantLicense: async (...args) => { calls.push(["license", ...args]); return { license: args[1] }; }
    }
  });
  const result = await service.reverseRenewal("c1", "p2", { reason: "Pago equivocado" }, { userId: "master" });
  assert.equal(calls.find((call) => call[0] === "license")[2].status, "trial");
  assert.equal(calls.find((call) => call[0] === "reversed")[3].reason, "Pago equivocado");
  assert.equal(result.payment.id, "p2");
});

test("no revierte un pago antiguo cuando existe una licencia posterior", async () => {
  const { service } = fixture({
    getPayment: async () => ({ licenseAppliedAt: "x", licensePlan: "pro_mensual", licenseExpiresAt: "2026-09-30", licensePrevious: {} }),
    licenseService: {
      getTenantLicense: async () => ({ license: { plan: "pro_anual", expiresAt: "2027-09-30" } }),
      updateTenantLicense: async () => { throw new Error("no debe guardar"); }
    }
  });
  await assert.rejects(() => service.reverseRenewal("c1", "p2", { reason: "Pago equivocado" }), (error) => error.statusCode === 409);
});

test("informa de forma uniforme cuando PostgreSQL no ofrece el historial", async () => {
  const { service } = fixture({ listPayments: null });
  await assert.rejects(() => service.list("c1"), (error) => error.statusCode === 501);
});
