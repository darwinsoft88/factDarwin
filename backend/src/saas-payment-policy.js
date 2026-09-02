const PAYMENT_METHODS = new Set(["transfer", "cash", "card", "deposit", "other"]);
const PAYMENT_STATUSES = new Set(["pending", "confirmed", "void", "refunded"]);
const PAID_LICENSE_PLANS = new Set(["basico_mensual", "basico_anual", "pro_mensual", "pro_anual", "premium_mensual", "premium_anual"]);

function normalizeSubscriptionPayment(payload = {}) {
  const amount = Number(payload.amount);
  const paidAt = dateOnly(payload.paidAt);
  const periodStart = dateOnly(payload.periodStart, true);
  const periodEnd = dateOnly(payload.periodEnd, true);
  const paymentMethod = String(payload.paymentMethod || "").trim().toLowerCase();
  const status = String(payload.status || "confirmed").trim().toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) fail("Ingrese un valor de pago valido.");
  if (!paidAt) fail("Ingrese una fecha de pago valida.");
  if (periodStart && periodEnd && periodEnd < periodStart) fail("El fin del periodo no puede ser anterior al inicio.");
  if (!PAYMENT_METHODS.has(paymentMethod)) fail("Seleccione un metodo de pago valido.");
  if (!PAYMENT_STATUSES.has(status)) fail("Seleccione un estado de pago valido.");
  return {
    amount: Math.round(amount * 100) / 100,
    currency: "USD",
    paidAt,
    periodStart,
    periodEnd,
    paymentMethod,
    reference: text(payload.reference, 120),
    status,
    notes: text(payload.notes, 500)
  };
}

function normalizePaymentStatus(payload = {}) {
  const status = String(payload.status || "").trim().toLowerCase();
  if (!PAYMENT_STATUSES.has(status)) fail("Seleccione un estado de pago valido.");
  const notes = text(payload.notes, 500);
  if (["void", "refunded"].includes(status) && notes.length < 3) fail("Ingrese el motivo de anulacion o reembolso.");
  return { status, notes };
}

function normalizePaymentRenewal(payment = {}, payload = {}) {
  if (payment.status !== "confirmed") fail("Solo un pago confirmado puede renovar la licencia.");
  if (payment.licenseAppliedAt) fail("Este pago ya fue aplicado a una licencia.", 409);
  if (!payment.periodStart || !payment.periodEnd) fail("El pago debe tener inicio y fin de periodo para renovar la licencia.");
  const plan = String(payload.plan || "").trim().toLowerCase();
  if (!PAID_LICENSE_PLANS.has(plan)) fail("Seleccione un plan de licencia valido.");
  return { plan, startsAt: payment.periodStart, expiresAt: payment.periodEnd };
}

function normalizePaymentRenewalReversal(payment = {}, payload = {}) {
  if (!payment.licenseAppliedAt) fail("Este pago no ha sido aplicado a una licencia.", 409);
  if (payment.licenseReversedAt) fail("La renovacion de este pago ya fue revertida.", 409);
  if (!payment.licensePrevious || typeof payment.licensePrevious !== "object") {
    fail("Este pago no contiene una licencia anterior recuperable.", 409);
  }
  const reason = text(payload.reason, 500);
  if (reason.length < 5) fail("Ingrese un motivo de reversion de al menos 5 caracteres.");
  return { reason };
}

function dateOnly(value, optional = false) {
  const textValue = String(value || "").slice(0, 10);
  if (!textValue && optional) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(textValue)) return null;
  const parsed = new Date(`${textValue}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === textValue ? textValue : null;
}

function text(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function fail(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

module.exports = { normalizePaymentRenewal, normalizePaymentRenewalReversal, normalizePaymentStatus, normalizeSubscriptionPayment };
