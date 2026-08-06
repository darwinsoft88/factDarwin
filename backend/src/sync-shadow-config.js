const ALLOWED_MODES = new Set(["off", "shadow"]);
const ALLOWED_ENVIRONMENTS = new Set([
  "test",
  "development",
  "integration",
  "staging",
  "production"
]);
const REQUIRED_CONFIG_VERSION = "1";

function buildShadowConfig(env = process.env) {
  const mode = String(env.INCREMENTAL_SYNC_SHADOW_MODE || env.INCREMENTAL_SYNC_MODE || "off").trim().toLowerCase();
  const environment = String(
    env.INCREMENTAL_SYNC_ENVIRONMENT || env.NODE_ENV || "development"
  ).trim().toLowerCase();
  const configVersion = String(env.INCREMENTAL_SYNC_CONFIG_VERSION || "").trim();
  const globallyEnabled = env.INCREMENTAL_SYNC_SHADOW_ENABLED === "true";
  const companyIds = new Set(
    String(env.INCREMENTAL_SYNC_SHADOW_COMPANY_IDS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  return Object.freeze({
    mode,
    environment,
    configVersion,
    globallyEnabled,
    companyIds
  });
}

function evaluateShadowAccess(config, companyId) {
  const normalizedCompanyId = String(companyId || "").trim();
  if (!config.globallyEnabled) return decision(false, "GLOBAL_DISABLED", config);
  if (!ALLOWED_MODES.has(config.mode)) return decision(false, "INVALID_MODE", config);
  if (config.mode !== "shadow") return decision(false, "MODE_OFF", config);
  if (config.configVersion !== REQUIRED_CONFIG_VERSION) {
    return decision(false, "INVALID_CONFIG_VERSION", config);
  }
  if (!ALLOWED_ENVIRONMENTS.has(config.environment)) {
    return decision(false, "ENVIRONMENT_REJECTED", config);
  }
  if (!normalizedCompanyId) return decision(false, "COMPANY_REQUIRED", config);

  const allowlistRequired = config.environment === "staging"
    || config.environment === "production";
  if (allowlistRequired && config.companyIds.size === 0) {
    return decision(false, "COMPANY_ALLOWLIST_REQUIRED", config);
  }
  if (config.companyIds.size > 0 && !config.companyIds.has(normalizedCompanyId)) {
    return decision(false, "COMPANY_REJECTED", config);
  }
  return decision(true, "SHADOW_ENABLED", config);
}

function decision(enabled, reason, config) {
  return {
    enabled,
    reason,
    mode: config.mode,
    environment: config.environment,
    configVersion: config.configVersion || null
  };
}

module.exports = {
  ALLOWED_ENVIRONMENTS,
  ALLOWED_MODES,
  REQUIRED_CONFIG_VERSION,
  buildShadowConfig,
  evaluateShadowAccess
};
