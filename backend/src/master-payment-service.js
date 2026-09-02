function createMasterPaymentService({
  listPayments,
  createPayment,
  updatePaymentStatus,
  getPayment,
  markLicenseApplied,
  markLicenseReversed,
  licenseService,
  normalizePaymentRenewal,
  normalizePaymentRenewalReversal,
  logTechnical
}) {
  return {
    async list(companyId, options = {}) {
      ensureAvailable(listPayments);
      return listPayments(companyId, { limit: options.limit });
    },

    async create(companyId, payload) {
      ensureAvailable(createPayment);
      const payment = await createPayment(companyId, payload || {});
      logTechnical("info", "tenant_subscription_payment_created", {
        companyId,
        paymentId: payment.id,
        amount: payment.amount,
        status: payment.status
      });
      return payment;
    },

    async changeStatus(companyId, paymentId, payload) {
      ensureAvailable(updatePaymentStatus);
      const payment = await updatePaymentStatus(companyId, paymentId, payload || {});
      logTechnical("info", "tenant_subscription_payment_status_changed", {
        companyId,
        paymentId: payment.id,
        status: payment.status
      });
      return payment;
    },

    async applyRenewal(companyId, paymentId, payload, actor = {}) {
      ensureAvailable(getPayment);
      ensureAvailable(markLicenseApplied);
      if (!licenseService || typeof licenseService.getTenantLicense !== "function" || typeof licenseService.updateTenantLicense !== "function") {
        throw httpError(501, "La administracion de licencias no esta disponible.");
      }
      const payment = await getPayment(companyId, paymentId);
      const renewal = normalizePaymentRenewal(payment, payload || {});
      const current = await licenseService.getTenantLicense(companyId);
      const previousLicense = persistedLicense(current.license);
      const license = await licenseService.updateTenantLicense(companyId, {
        ...previousLicense,
        status: "active",
        plan: renewal.plan,
        startsAt: renewal.startsAt,
        expiresAt: renewal.expiresAt
      }, actor);
      const appliedPayment = await markLicenseApplied(companyId, paymentId, {
        ...renewal,
        userId: actor.userId || null,
        previousLicense
      });
      logTechnical("warn", "tenant_subscription_payment_license_applied", {
        companyId,
        paymentId,
        plan: renewal.plan,
        expiresAt: renewal.expiresAt,
        userId: actor.userId || null
      });
      return { payment: appliedPayment, license: license.license };
    },

    async reverseRenewal(companyId, paymentId, payload, actor = {}) {
      ensureAvailable(getPayment);
      ensureAvailable(markLicenseReversed);
      const payment = await getPayment(companyId, paymentId);
      const reversal = normalizePaymentRenewalReversal(payment, payload || {});
      const current = await licenseService.getTenantLicense(companyId);
      if (current.license.plan !== payment.licensePlan || current.license.expiresAt !== payment.licenseExpiresAt) {
        throw httpError(409, "No puede revertirse porque la licencia ya fue modificada o renovada por una operacion posterior.");
      }
      const license = await licenseService.updateTenantLicense(companyId, payment.licensePrevious, actor);
      const reversedPayment = await markLicenseReversed(companyId, paymentId, {
        reason: reversal.reason,
        userId: actor.userId || null
      });
      logTechnical("warn", "tenant_subscription_payment_license_reversed", {
        companyId, paymentId, reason: reversal.reason, userId: actor.userId || null
      });
      return { payment: reversedPayment, license: license.license };
    }
  };
}

function persistedLicense(license = {}) {
  const { effectiveStatus: _effectiveStatus, active: _active, daysLeft: _daysLeft, ...stored } = license;
  return stored;
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function ensureAvailable(operation) {
  if (typeof operation !== "function") {
    const error = new Error("El historial de pagos requiere PostgreSQL.");
    error.statusCode = 501;
    throw error;
  }
}

module.exports = { createMasterPaymentService };
