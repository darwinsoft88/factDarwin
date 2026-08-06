const crypto = require("node:crypto");
const { compareVersions } = require("./sync-pilot-config");
const { ALLOWED_ENVIRONMENTS } = require("./sync-shadow-config");

const HISTORY_PROTOCOL_VERSION = 1;

function buildDocumentHistoryConfig(env = process.env, jwtSecret = "") {
  return Object.freeze({
    enabled: env.HISTORICAL_DOCUMENT_PAGINATION_ENABLED === "true",
    mode: String(env.HISTORICAL_DOCUMENT_PAGINATION_MODE || "off").trim().toLowerCase(),
    configVersion: String(env.HISTORICAL_DOCUMENT_PAGINATION_CONFIG_VERSION || "").trim(),
    environment: String(env.HISTORICAL_DOCUMENT_PAGINATION_ENVIRONMENT || env.NODE_ENV || "development").trim().toLowerCase(),
    companyIds: values(env.HISTORICAL_DOCUMENT_PAGINATION_COMPANY_IDS),
    platforms: values(env.HISTORICAL_DOCUMENT_PAGINATION_PLATFORMS || "android"),
    pilotUserIds: values(env.HISTORICAL_DOCUMENT_PAGINATION_PILOT_USER_IDS),
    pilotDeviceIds: values(env.HISTORICAL_DOCUMENT_PAGINATION_PILOT_DEVICE_IDS),
    minimumAppVersion: String(env.HISTORICAL_DOCUMENT_PAGINATION_MIN_APP_VERSION || "1.0.11").trim(),
    defaultLimit: bounded(env.HISTORICAL_DOCUMENT_PAGINATION_DEFAULT_LIMIT, 50, 1, 100),
    maxLimit: bounded(env.HISTORICAL_DOCUMENT_PAGINATION_MAX_LIMIT, 100, 1, 100),
    maxResponseBytes: bounded(env.HISTORICAL_DOCUMENT_PAGINATION_MAX_RESPONSE_BYTES, 2 * 1024 * 1024, 1024, 8 * 1024 * 1024),
    maxCursorLength: 4096,
    cursorTtlMs: 24 * 60 * 60 * 1000,
    queryTimeoutMs: 10_000,
    rateLimitPerMinute: 30,
    cursorSecret: String(env.HISTORICAL_DOCUMENT_PAGINATION_CURSOR_SECRET || "") || crypto.createHmac("sha256", jwtSecret).update("factudarwin:historical-documents:v1").digest("hex")
  });
}

function evaluateDocumentHistoryAccess(config, context) {
  if (!config.enabled) return result(false, "GLOBAL_DISABLED", config);
  if (config.mode !== "pilot") return result(false, "INVALID_MODE", config);
  if (config.configVersion !== "1") return result(false, "INVALID_CONFIG_VERSION", config);
  if (!ALLOWED_ENVIRONMENTS.has(config.environment)) return result(false, "ENVIRONMENT_REJECTED", config);
  if (!config.companyIds.has(context.companyId)) return result(false, "COMPANY_REJECTED", config);
  if (!config.platforms.has(context.platform)) return result(false, "PLATFORM_REJECTED", config);
  if (Number(context.protocolVersion) !== HISTORY_PROTOCOL_VERSION) return result(false, "PROTOCOL_REJECTED", config);
  if (compareVersions(context.appVersion, config.minimumAppVersion) < 0) return result(false, "APP_VERSION_REJECTED", config);
  if (!context.deviceTrusted) return result(false, "DEVICE_UNTRUSTED", config);
  if (config.pilotUserIds.size && !config.pilotUserIds.has(context.userId)) return result(false, "USER_REJECTED", config);
  if (config.pilotDeviceIds.size && !config.pilotDeviceIds.has(context.deviceId)) return result(false, "DEVICE_REJECTED", config);
  return result(true, "PILOT_ENABLED", config);
}

function result(enabled, reason, config) {
  return {
    enabled,
    reason,
    protocolVersion: HISTORY_PROTOCOL_VERSION,
    configVersion: config.configVersion,
    mode: enabled ? "historical-read-only" : "off"
  };
}

function values(value) {
  return new Set(String(value || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
}

function bounded(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

module.exports = { HISTORY_PROTOCOL_VERSION, buildDocumentHistoryConfig, evaluateDocumentHistoryAccess };
