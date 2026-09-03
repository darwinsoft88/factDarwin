const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAppVersionPolicy } = require("../app-version-policy");

test("la política queda desactivada si no se configuró una versión", () => {
  const policy = buildAppVersionPolicy({});
  assert.equal(policy.enabled, false);
  assert.equal(policy.minimumVersion, "");
});

test("publica versiones válidas y limita el mensaje", () => {
  const policy = buildAppVersionPolicy({
    APP_UPDATE_ENABLED: "true",
    APP_UPDATE_LATEST_VERSION: "v1.0.18",
    APP_UPDATE_MINIMUM_VERSION: "1.0.16",
    APP_UPDATE_MESSAGE: "Correcciones importantes"
  });
  assert.equal(policy.enabled, true);
  assert.equal(policy.latestVersion, "1.0.18");
  assert.equal(policy.minimumVersion, "1.0.16");
  assert.equal(policy.message, "Correcciones importantes");
  assert.match(policy.storeUrl, /^https:\/\/play\.google\.com\//);
});

test("rechaza versiones con formato inválido", () => {
  const policy = buildAppVersionPolicy({ APP_UPDATE_LATEST_VERSION: "1.0" });
  assert.equal(policy.enabled, false);
});
