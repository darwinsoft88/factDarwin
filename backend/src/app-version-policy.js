const DEFAULT_STORE_URL = "https://play.google.com/store/apps/details?id=com.facturasri.mobile";

function cleanVersion(value) {
  const version = String(value || "").trim().replace(/^v/i, "");
  return /^\d+\.\d+\.\d+$/.test(version) ? version : "";
}

function buildAppVersionPolicy(env = process.env) {
  const latestVersion = cleanVersion(env.APP_UPDATE_LATEST_VERSION);
  const minimumVersion = cleanVersion(env.APP_UPDATE_MINIMUM_VERSION);
  return {
    enabled: Boolean(latestVersion) && env.APP_UPDATE_ENABLED !== "false",
    latestVersion,
    minimumVersion,
    message: String(env.APP_UPDATE_MESSAGE || "").trim().slice(0, 300),
    storeUrl: DEFAULT_STORE_URL
  };
}

module.exports = { buildAppVersionPolicy, cleanVersion, DEFAULT_STORE_URL };
