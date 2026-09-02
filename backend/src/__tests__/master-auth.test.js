const test = require("node:test");
const assert = require("node:assert/strict");
const { createMasterKeyMiddleware } = require("../master-auth");

function response() {
  return {
    statusCode: 200, headers: {}, payload: null,
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

test("bloquea temporalmente despues de cinco claves maestras incorrectas", () => {
  let currentTime = 1000;
  const middleware = createMasterKeyMiddleware({ getKey: () => "clave-correcta", now: () => currentTime, blockMs: 60000 });
  const request = { ip: "127.0.0.1", headers: { "x-master-key": "incorrecta" }, socket: {} };
  for (let index = 0; index < 5; index += 1) middleware(request, response(), () => assert.fail("no debe autorizar"));
  const blocked = response();
  middleware(request, blocked, () => assert.fail("no debe autorizar"));
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.headers["Retry-After"], "60");
  currentTime += 60001;
  const valid = response();
  middleware({ ...request, headers: { "x-master-key": "clave-correcta" } }, valid, () => { valid.authorized = true; });
  assert.equal(valid.authorized, true);
});
