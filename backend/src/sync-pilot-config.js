const crypto = require("node:crypto");
const { ALLOWED_ENVIRONMENTS } = require("./sync-shadow-config");

function buildIncrementalPilotConfig(env = process.env, jwtSecret = "") {
  const batchLimit = bounded(env.INCREMENTAL_SYNC_BATCH_LIMIT, 100, 1, 500);
  return Object.freeze({
    enabled: env.INCREMENTAL_SYNC_ENABLED === "true",
    mode: String(env.INCREMENTAL_SYNC_MODE || "off").trim().toLowerCase(),
    configVersion: String(env.INCREMENTAL_SYNC_CONFIG_VERSION || "").trim(),
    environment: String(env.INCREMENTAL_SYNC_ENVIRONMENT || env.NODE_ENV || "development").trim().toLowerCase(),
    companyIds: values(env.INCREMENTAL_SYNC_COMPANY_IDS),
    platforms: values(env.INCREMENTAL_SYNC_PLATFORMS || "android"),
    pilotUserIds: values(env.INCREMENTAL_SYNC_PILOT_USER_IDS),
    pilotDeviceIds: values(env.INCREMENTAL_SYNC_PILOT_DEVICE_IDS),
    clientsEnabled: env.INCREMENTAL_SYNC_CLIENTS_ENABLED === "true",
    productsEnabled: env.INCREMENTAL_SYNC_PRODUCTS_ENABLED === "true",
    batchLimit,
    defaultLimit: batchLimit,
    maxLimit: batchLimit,
    maxResponseBytes: bounded(env.INCREMENTAL_SYNC_MAX_RESPONSE_BYTES, 2 * 1024 * 1024, 1024, 8 * 1024 * 1024),
    minimumAppVersion: String(env.INCREMENTAL_SYNC_MIN_APP_VERSION || "1.0.11").trim(),
    maxCursorLength: 2048,
    minimumAvailableSequence: 0,
    queryTimeoutMs: 5000,
    rateLimitPerMinute: 30,
    cursorSecret: String(env.INCREMENTAL_SYNC_CURSOR_SECRET || "") || crypto.createHmac("sha256", jwtSecret).update("factudarwin:pilot-pull:v1").digest("hex")
  });
}

function evaluateIncrementalPilotAccess(config, context) {
  if (!config.enabled) return result(false, "GLOBAL_DISABLED", config);
  if (config.mode !== "pilot") return result(false, "INVALID_MODE", config);
  if (config.configVersion !== "1") return result(false, "INVALID_CONFIG_VERSION", config);
  if (!ALLOWED_ENVIRONMENTS.has(config.environment)) return result(false, "ENVIRONMENT_REJECTED", config);
  if (!config.companyIds.has(context.companyId)) return result(false, "COMPANY_REJECTED", config);
  if (!config.platforms.has(context.platform)) return result(false, "PLATFORM_REJECTED", config);
  const protocolVersion = [1, 2].includes(Number(context.protocolVersion)) ? Number(context.protocolVersion) : 1;
  if (compareVersions(context.appVersion, config.minimumAppVersion) < 0) return result(false, "APP_VERSION_REJECTED", config);
  if (!context.deviceTrusted) return result(false, "DEVICE_UNTRUSTED", config);
  if (config.pilotUserIds.size && !config.pilotUserIds.has(context.userId)) return result(false, "USER_REJECTED", config);
  if (config.pilotDeviceIds.size && !config.pilotDeviceIds.has(context.deviceId)) return result(false, "DEVICE_REJECTED", config);
  if (!config.clientsEnabled && !config.productsEnabled) return result(false, "MODULES_DISABLED", config);
  return result(true, "PILOT_ENABLED", config, protocolVersion);
}

function result(enabled, reason, config, protocolVersion = 1) {
  return { enabled, reason, protocolVersion, configVersion: config.configVersion, modules: { clients: enabled && config.clientsEnabled, products: enabled && config.productsEnabled, guides: enabled && protocolVersion === 2 }, snapshotFallbackAvailable: true };
}
function values(value) { return new Set(String(value || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean)); }
function bounded(value, fallback, min, max) { const parsed = Number(value); return Number.isSafeInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback; }
function compareVersions(left, right) { const a = String(left || "0").split(".").map(Number); const b = String(right || "0").split(".").map(Number); for (let i = 0; i < Math.max(a.length, b.length); i += 1) { const difference = (a[i] || 0) - (b[i] || 0); if (difference) return difference; } return 0; }

module.exports = { buildIncrementalPilotConfig, compareVersions, evaluateIncrementalPilotAccess };
