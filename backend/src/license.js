const DEFAULT_FEATURES = {
  sales: true,
  documents: true,
  clients: true,
  products: true,
  sri: true,
  inventory: true,
  cash: true,
  credits: true,
  guides: true,
  users: true,
  reports: true,
  multiDevice: true,
  multiEmissionPoint: false
};

function defaultLicense() {
  const now = new Date();
  const expires = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  return {
    status: "trial",
    plan: "trial",
    startsAt: now.toISOString().slice(0, 10),
    expiresAt: expires.toISOString().slice(0, 10),
    maxUsers: 3,
    maxDevices: 3,
    maxEmissionPoints: 3,
    features: { ...DEFAULT_FEATURES, multiEmissionPoint: true },
    notes: "Prueba gratuita tipo Pro por 3 meses"
  };
}

function normalizeLicense(license) {
  const fallback = defaultLicense();
  const normalized = {
    ...fallback,
    ...(license && typeof license === "object" ? license : {}),
    features: {
      ...DEFAULT_FEATURES,
      ...(license?.features && typeof license.features === "object" ? license.features : {})
    }
  };

  normalized.status = ["trial", "active", "expired", "suspended"].includes(normalized.status) ? normalized.status : "trial";
  normalized.plan = normalizePlan(normalized.plan);
  normalized.maxUsers = safePositiveInteger(normalized.maxUsers, fallback.maxUsers);
  normalized.maxDevices = safePositiveInteger(normalized.maxDevices, fallback.maxDevices);
  const openAllModules = normalized.plan === "trial";
  const proPlan = isProPlan(normalized.plan);
  const premiumPlan = isPremiumPlan(normalized.plan);
  for (const feature of ["sales", "documents", "clients", "products", "sri", "inventory", "cash", "credits", "guides", "users", "reports", "multiDevice"]) {
    normalized.features[feature] = normalized.features[feature] !== false;
  }
  normalized.features.multiEmissionPoint = openAllModules || proPlan || premiumPlan;
  normalized.maxEmissionPoints = normalized.features.multiEmissionPoint
    ? safePositiveInteger(normalized.maxEmissionPoints, openAllModules ? 3 : 999)
    : 1;
  normalized.startsAt = normalizeDate(normalized.startsAt) || fallback.startsAt;
  normalized.expiresAt = normalizeDate(normalized.expiresAt) || fallback.expiresAt;
  normalized.notes = String(normalized.notes || "");
  return normalized;
}

function normalizePlan(value) {
  if (value === "mensual") return "basico_mensual";
  if (value === "anual") return "basico_anual";
  if (value === "pro") return "pro_anual";
  return ["trial", "basico_mensual", "basico_anual", "pro_mensual", "pro_anual", "premium_mensual", "premium_anual"].includes(value) ? value : "trial";
}

function isProPlan(plan) {
  return String(plan || "").startsWith("pro_");
}

function isPremiumPlan(plan) {
  return String(plan || "").startsWith("premium_");
}

function licenseStatus(data) {
  const license = normalizeLicense(data?.license);
  const today = startOfDay(new Date());
  const expiresAt = startOfDay(parseDate(license.expiresAt));
  const expiredByDate = expiresAt && expiresAt.getTime() < today.getTime();
  const active = (license.status === "active" || license.status === "trial") && !expiredByDate;
  const effectiveStatus = license.status === "suspended" ? "suspended" : expiredByDate ? "expired" : license.status;
  const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - today.getTime()) / 86400000) : 0;

  return {
    ...license,
    effectiveStatus,
    active,
    daysLeft
  };
}

function requireActiveLicense(getSnapshot, feature = "sales") {
  return async (req, res, next) => {
    try {
      const snapshot = await getSnapshot(req.user?.companyId);
      const status = licenseStatus(snapshot?.data || {});
      if (!status.active) {
        const error = new Error(status.effectiveStatus === "suspended"
          ? "Licencia suspendida. Contacte soporte para reactivar la cuenta."
          : "Licencia vencida. Renueve el plan para continuar facturando.");
        error.statusCode = 402;
        error.license = status;
        throw error;
      }
      if (feature && status.features?.[feature] === false) {
        const error = new Error("El plan actual no incluye este modulo.");
        error.statusCode = 403;
        error.license = status;
        throw error;
      }
      req.license = status;
      next();
    } catch (error) {
      next(error);
    }
  };
}

function requireLicenseFeatures(getSnapshot, resolveFeatures) {
  return async (req, res, next) => {
    try {
      const snapshot = await getSnapshot(req.user?.companyId);
      const status = licenseStatus(snapshot?.data || {});
      if (!status.active) {
        const error = new Error(status.effectiveStatus === "suspended"
          ? "Licencia suspendida. Contacte soporte para reactivar la cuenta."
          : "Licencia vencida. Renueve el plan para continuar.");
        error.statusCode = 402;
        error.license = status;
        throw error;
      }
      const required = Array.from(new Set(resolveFeatures(req) || []));
      const blocked = required.find((feature) => status.features?.[feature] === false);
      if (blocked) {
        const error = new Error("El modulo solicitado esta desactivado para esta empresa.");
        error.statusCode = 403;
        error.code = "MODULE_DISABLED";
        error.feature = blocked;
        error.license = status;
        throw error;
      }
      req.license = status;
      next();
    } catch (error) {
      next(error);
    }
  };
}

function safePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeDate(value) {
  const parsed = parseDate(value);
  return parsed ? parsed.toISOString().slice(0, 10) : "";
}

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

module.exports = {
  defaultLicense,
  licenseStatus,
  normalizeLicense,
  requireActiveLicense,
  requireLicenseFeatures
};
