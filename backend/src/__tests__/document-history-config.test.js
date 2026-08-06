const assert = require("node:assert/strict");
const test = require("node:test");
const { buildDocumentHistoryConfig, evaluateDocumentHistoryAccess } = require("../document-history-config");

function enabledConfig(overrides = {}) {
  return buildDocumentHistoryConfig({
    NODE_ENV: "test",
    HISTORICAL_DOCUMENT_PAGINATION_ENABLED: "true",
    HISTORICAL_DOCUMENT_PAGINATION_MODE: "pilot",
    HISTORICAL_DOCUMENT_PAGINATION_CONFIG_VERSION: "1",
    HISTORICAL_DOCUMENT_PAGINATION_COMPANY_IDS: "company",
    HISTORICAL_DOCUMENT_PAGINATION_PLATFORMS: "android",
    HISTORICAL_DOCUMENT_PAGINATION_MIN_APP_VERSION: "1.0.11",
    HISTORICAL_DOCUMENT_PAGINATION_CURSOR_SECRET: "x".repeat(32),
    ...overrides
  }, "jwt-secret");
}

function context(overrides = {}) {
  return {
    companyId: "company",
    userId: "user",
    deviceId: "device",
    platform: "android",
    appVersion: "1.0.11",
    protocolVersion: 1,
    deviceTrusted: true,
    ...overrides
  };
}

test("paginacion historica queda apagada por defecto", () => {
  const config = buildDocumentHistoryConfig({}, "jwt-secret");
  assert.equal(config.enabled, false);
  assert.equal(config.mode, "off");
});

test("habilita solamente empresa, plataforma, version y dispositivo piloto compatibles", () => {
  const config = enabledConfig();
  assert.equal(evaluateDocumentHistoryAccess(config, context()).enabled, true);
  assert.equal(evaluateDocumentHistoryAccess(config, context({ companyId: "other" })).reason, "COMPANY_REJECTED");
  assert.equal(evaluateDocumentHistoryAccess(config, context({ platform: "web" })).reason, "PLATFORM_REJECTED");
  assert.equal(evaluateDocumentHistoryAccess(config, context({ appVersion: "1.0.10" })).reason, "APP_VERSION_REJECTED");
  assert.equal(evaluateDocumentHistoryAccess(config, context({ deviceTrusted: false })).reason, "DEVICE_UNTRUSTED");
});

test("una allowlist secundaria no puede sobrepasar el flag global", () => {
  const config = buildDocumentHistoryConfig({
    HISTORICAL_DOCUMENT_PAGINATION_COMPANY_IDS: "company",
    HISTORICAL_DOCUMENT_PAGINATION_PLATFORMS: "android"
  }, "jwt-secret");
  assert.equal(evaluateDocumentHistoryAccess(config, context()).reason, "GLOBAL_DISABLED");
});

test("el limite del protocolo nunca puede superar 100", () => {
  const config = enabledConfig({ HISTORICAL_DOCUMENT_PAGINATION_MAX_LIMIT: "200" });
  assert.equal(config.maxLimit, 100);
});
