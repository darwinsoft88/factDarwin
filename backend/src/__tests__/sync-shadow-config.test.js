const assert = require("node:assert/strict");
const test = require("node:test");
const { buildShadowConfig, evaluateShadowAccess } = require("../sync-shadow-config");

function access(env, companyId = "pilot") {
  return evaluateShadowAccess(buildShadowConfig(env), companyId);
}

test("queda apagado por defecto", () => assert.equal(access({ NODE_ENV: "production" }).enabled, false));
test("produccion exige allowlist", () => assert.equal(access({
  NODE_ENV: "production", INCREMENTAL_SYNC_MODE: "shadow", INCREMENTAL_SYNC_CONFIG_VERSION: "1", INCREMENTAL_SYNC_SHADOW_ENABLED: "true"
}).reason, "COMPANY_ALLOWLIST_REQUIRED"));
test("habilita solamente la empresa piloto", () => {
  const env = { NODE_ENV: "production", INCREMENTAL_SYNC_MODE: "shadow", INCREMENTAL_SYNC_CONFIG_VERSION: "1", INCREMENTAL_SYNC_SHADOW_ENABLED: "true", INCREMENTAL_SYNC_SHADOW_COMPANY_IDS: "pilot" };
  assert.equal(access(env, "pilot").enabled, true);
  assert.equal(access(env, "other").reason, "COMPANY_REJECTED");
});
test("rechaza version y ambiente no autorizados", () => {
  assert.equal(access({ NODE_ENV: "production", INCREMENTAL_SYNC_MODE: "shadow", INCREMENTAL_SYNC_SHADOW_ENABLED: "true", INCREMENTAL_SYNC_SHADOW_COMPANY_IDS: "pilot" }).reason, "INVALID_CONFIG_VERSION");
  assert.equal(access({ NODE_ENV: "invalid", INCREMENTAL_SYNC_MODE: "shadow", INCREMENTAL_SYNC_CONFIG_VERSION: "1", INCREMENTAL_SYNC_SHADOW_ENABLED: "true" }).reason, "ENVIRONMENT_REJECTED");
});
