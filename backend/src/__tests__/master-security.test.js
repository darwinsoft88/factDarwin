const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function source(file) {
  return fs.readFileSync(path.join(__dirname, "..", file), "utf8");
}

test("el panel conserva la clave maestra solo durante la sesion del navegador", () => {
  const panel = source("master-panel.js");
  assert.match(panel, /sessionStorage\.getItem\(keyName\)/);
  assert.match(panel, /sessionStorage\.setItem\(keyName, value\)/);
  assert.doesNotMatch(panel, /localStorage\.(getItem|setItem)\(keyName/);
});

test("la clave maestra se compara en tiempo constante y se valida en produccion", () => {
  const server = source("server.js");
  const auth = source("master-auth.js");
  const config = source("config.js");
  assert.match(server, /createMasterKeyMiddleware/);
  assert.match(auth, /crypto\.timingSafeEqual/);
  assert.match(auth, /maxFailures = 5/);
  assert.match(auth, /res\.status\(429\)/);
  assert.match(server, /frame-ancestors 'none'/);
  assert.match(server, /"X-Frame-Options": "DENY"/);
  assert.match(config, /MASTER_ADMIN_KEY debe ser un secreto real de al menos 32 caracteres/);
});
