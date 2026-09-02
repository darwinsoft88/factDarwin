const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizePaymentRenewal, normalizePaymentRenewalReversal, normalizePaymentStatus, normalizeSubscriptionPayment } = require("../saas-payment-policy");

test("normaliza un pago SaaS valido sin asociarlo automaticamente a la licencia", () => {
  const payment = normalizeSubscriptionPayment({
    amount: "29.999", paidAt: "2026-08-21", periodStart: "2026-08-21", periodEnd: "2026-09-20",
    paymentMethod: "TRANSFER", status: "confirmed", reference: "TRX-1"
  });
  assert.equal(payment.amount, 30);
  assert.equal(payment.currency, "USD");
  assert.equal(payment.paymentMethod, "transfer");
  assert.equal(payment.periodEnd, "2026-09-20");
});

test("rechaza valores, fechas y periodos invalidos", () => {
  assert.throws(() => normalizeSubscriptionPayment({ amount: 0, paidAt: "2026-08-21", paymentMethod: "cash" }), /valor/);
  assert.throws(() => normalizeSubscriptionPayment({ amount: 10, paidAt: "2026-02-30", paymentMethod: "cash" }), /fecha/);
  assert.throws(() => normalizeSubscriptionPayment({ amount: 10, paidAt: "2026-08-21", periodStart: "2026-09-01", periodEnd: "2026-08-01", paymentMethod: "cash" }), /periodo/);
});

test("anular o reembolsar exige un motivo", () => {
  assert.throws(() => normalizePaymentStatus({ status: "void", notes: "" }), /motivo/);
  assert.deepEqual(normalizePaymentStatus({ status: "refunded", notes: "Pago duplicado" }), { status: "refunded", notes: "Pago duplicado" });
});

test("renovacion exige pago confirmado, periodo completo y plan pagado", () => {
  const payment = { status: "confirmed", periodStart: "2026-09-01", periodEnd: "2026-09-30", licenseAppliedAt: "" };
  assert.deepEqual(normalizePaymentRenewal(payment, { plan: "pro_mensual" }), {
    plan: "pro_mensual", startsAt: "2026-09-01", expiresAt: "2026-09-30"
  });
  assert.throws(() => normalizePaymentRenewal({ ...payment, status: "pending" }, { plan: "pro_mensual" }), /confirmado/);
  assert.throws(() => normalizePaymentRenewal({ ...payment, licenseAppliedAt: "2026-08-30T00:00:00.000Z" }, { plan: "pro_mensual" }), /ya fue aplicado/);
  assert.throws(() => normalizePaymentRenewal(payment, { plan: "trial" }), /plan/);
});

test("reversion exige una renovacion recuperable y motivo suficiente", () => {
  const payment = { licenseAppliedAt: "2026-08-30T12:00:00.000Z", licenseReversedAt: "", licensePrevious: { status: "trial" } };
  assert.deepEqual(normalizePaymentRenewalReversal(payment, { reason: "Pago equivocado" }), { reason: "Pago equivocado" });
  assert.throws(() => normalizePaymentRenewalReversal({ ...payment, licensePrevious: null }, { reason: "Pago equivocado" }), /recuperable/);
  assert.throws(() => normalizePaymentRenewalReversal(payment, { reason: "mal" }), /5 caracteres/);
});
