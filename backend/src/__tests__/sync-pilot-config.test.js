const assert = require("node:assert/strict");
const test = require("node:test");
const { buildIncrementalPilotConfig, evaluateIncrementalPilotAccess } = require("../sync-pilot-config");

function enabled() { return buildIncrementalPilotConfig({ NODE_ENV: "test", INCREMENTAL_SYNC_ENABLED: "true", INCREMENTAL_SYNC_MODE: "pilot", INCREMENTAL_SYNC_CONFIG_VERSION: "1", INCREMENTAL_SYNC_COMPANY_IDS: "company", INCREMENTAL_SYNC_PLATFORMS: "android", INCREMENTAL_SYNC_CLIENTS_ENABLED: "true", INCREMENTAL_SYNC_PRODUCTS_ENABLED: "true", INCREMENTAL_SYNC_MIN_APP_VERSION: "1.0.11" }, "secret"); }
function context(overrides = {}) { return { companyId: "company", userId: "user", deviceId: "device", platform: "android", appVersion: "1.0.11", protocolVersion: 1, deviceTrusted: true, ...overrides }; }

test("piloto queda totalmente apagado por defecto", () => assert.equal(buildIncrementalPilotConfig({}, "secret").enabled, false));
test("habilita exclusivamente contexto compatible", () => assert.equal(evaluateIncrementalPilotAccess(enabled(), context()).enabled, true));
test("rechaza empresa, plataforma, protocolo, version y dispositivo", () => {
  assert.equal(evaluateIncrementalPilotAccess(enabled(), context({ companyId: "other" })).reason, "COMPANY_REJECTED");
  assert.equal(evaluateIncrementalPilotAccess(enabled(), context({ platform: "web" })).reason, "PLATFORM_REJECTED");
  assert.equal(evaluateIncrementalPilotAccess(enabled(), context({ protocolVersion: 2 })).reason, "PROTOCOL_REJECTED");
  assert.equal(evaluateIncrementalPilotAccess(enabled(), context({ appVersion: "1.0.10" })).reason, "APP_VERSION_REJECTED");
  assert.equal(evaluateIncrementalPilotAccess(enabled(), context({ deviceTrusted: false })).reason, "DEVICE_UNTRUSTED");
});
test("una capa global apagada no puede ser habilitada por modulos", () => {
  const config = buildIncrementalPilotConfig({ INCREMENTAL_SYNC_CLIENTS_ENABLED: "true", INCREMENTAL_SYNC_PRODUCTS_ENABLED: "true" }, "secret");
  assert.equal(evaluateIncrementalPilotAccess(config, context()).reason, "GLOBAL_DISABLED");
});
