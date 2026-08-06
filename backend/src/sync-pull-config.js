const crypto = require("node:crypto");
const { ALLOWED_ENVIRONMENTS } = require("./sync-shadow-config");

const PROTOCOL_VERSION = 1;

function buildPullDiagnosticConfig(env = process.env, jwtSecret = "") {
  const environment = String(env.INCREMENTAL_SYNC_PULL_ENVIRONMENT || env.NODE_ENV || "development").trim().toLowerCase();
  const companyIds = new Set(String(env.INCREMENTAL_SYNC_PULL_COMPANY_IDS || "").split(",").map((v) => v.trim()).filter(Boolean));
  const explicitSecret = String(env.INCREMENTAL_SYNC_PULL_CURSOR_SECRET || "");
  return Object.freeze({
    enabled: env.INCREMENTAL_SYNC_PULL_DIAGNOSTIC_ENABLED === "true",
    mode: String(env.INCREMENTAL_SYNC_PULL_MODE || "off").trim().toLowerCase(),
    configVersion: String(env.INCREMENTAL_SYNC_PULL_CONFIG_VERSION || "").trim(),
    environment,
    companyIds,
    defaultLimit: bounded(env.INCREMENTAL_SYNC_PULL_DEFAULT_LIMIT, 100, 1, 500),
    maxLimit: bounded(env.INCREMENTAL_SYNC_PULL_MAX_LIMIT, 500, 1, 500),
    maxResponseBytes: bounded(env.INCREMENTAL_SYNC_PULL_MAX_RESPONSE_BYTES, 2 * 1024 * 1024, 1024, 8 * 1024 * 1024),
    maxCursorLength: bounded(env.INCREMENTAL_SYNC_PULL_MAX_CURSOR_LENGTH, 2048, 128, 8192),
    rateLimitPerMinute: bounded(env.INCREMENTAL_SYNC_PULL_RATE_LIMIT_PER_MINUTE, 30, 1, 300),
    queryTimeoutMs: bounded(env.INCREMENTAL_SYNC_PULL_TIMEOUT_MS, 5000, 500, 30000),
    minimumAvailableSequence: bounded(env.INCREMENTAL_SYNC_PULL_MIN_AVAILABLE_SEQUENCE, 0, 0, Number.MAX_SAFE_INTEGER),
    cursorSecret: explicitSecret || crypto.createHmac("sha256", jwtSecret).update("factudarwin:diagnostic-pull:v1").digest("hex")
  });
}

function evaluatePullDiagnosticAccess(config, companyId) {
  const company = String(companyId || "");
  if (!config.enabled) return decision(false, "GLOBAL_DISABLED", config);
  if (config.mode !== "diagnostic") return decision(false, "INVALID_MODE", config);
  if (config.configVersion !== "1") return decision(false, "INVALID_CONFIG_VERSION", config);
  if (!ALLOWED_ENVIRONMENTS.has(config.environment)) return decision(false, "ENVIRONMENT_REJECTED", config);
  if (!company) return decision(false, "COMPANY_REQUIRED", config);
  if ((config.environment === "staging" || config.environment === "production") && config.companyIds.size === 0) {
    return decision(false, "COMPANY_ALLOWLIST_REQUIRED", config);
  }
  if (!config.companyIds.has(company)) return decision(false, "COMPANY_REJECTED", config);
  return decision(true, "DIAGNOSTIC_ENABLED", config);
}

function decision(enabled, reason, config) {
  return { enabled, reason, environment: config.environment, mode: config.mode, protocolVersion: PROTOCOL_VERSION };
}

function bounded(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

module.exports = { PROTOCOL_VERSION, buildPullDiagnosticConfig, evaluatePullDiagnosticAccess };
