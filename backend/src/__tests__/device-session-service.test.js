const test = require("node:test");
const assert = require("node:assert/strict");
const { createDeviceSessionService } = require("../device-session-service");

const pepper = "test-device-session-pepper-with-at-least-32-characters";
const user = { id: "user-1", companyId: "company-1", name: "Darwin", email: "d@example.com", role: "admin" };
const device = { deviceId: "android-1", deviceLabel: "Samsung", platform: "android" };

test("registra una credencial aleatoria y persiste solamente su hash", async () => {
  let stored;
  const service = createDeviceSessionService({
    repository: { register: async (input) => { stored = input; } },
    signToken: () => "access",
    pepper
  });
  const result = await service.register({ user, device });
  assert.equal(result.credentialVersion, 2);
  assert.match(result.refreshToken, /^[^.]+\.[^.]+\.[A-Za-z0-9_-]+$/);
  assert.equal(stored.companyId, user.companyId);
  assert.equal(stored.deviceId, device.deviceId);
  assert.match(stored.tokenHash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(stored).includes(result.refreshToken), false);
});

test("renueva mediante requestId y nunca entrega el refresh token al repositorio", async () => {
  let registered;
  const repository = {
    register: async (input) => { registered = input; },
    rotate: async (input) => {
      assert.match(input.presentedTokenHash, /^[a-f0-9]{64}$/);
      assert.equal(Object.prototype.hasOwnProperty.call(input, "refreshToken"), false);
      const replacement = input.deriveReplacement({
        tokenId: "22222222-2222-4222-8222-222222222222",
        generation: 2
      });
      return {
        user,
        replacementTokenId: "22222222-2222-4222-8222-222222222222",
        replacementSecret: replacement.secret,
        idempotentReplay: false
      };
    }
  };
  const service = createDeviceSessionService({ repository, signToken: () => "new-access", pepper });
  const initial = await service.register({ user, device });
  assert.ok(registered.tokenHash);
  const result = await service.refresh({
    refreshToken: initial.refreshToken,
    requestId: "33333333-3333-4333-8333-333333333333",
    deviceId: device.deviceId
  });
  assert.equal(result.token, "new-access");
  assert.notEqual(result.refreshToken, initial.refreshToken);
  assert.equal(result.user.companyId, user.companyId);
});

test("rechaza tokens y requestId con formato inseguro antes de consultar PostgreSQL", async () => {
  let called = false;
  const service = createDeviceSessionService({
    repository: { rotate: async () => { called = true; } },
    signToken: () => "access",
    pepper
  });
  await assert.rejects(
    service.refresh({ refreshToken: "invalid", requestId: "invalid", deviceId: "android-1" }),
    (error) => error.code === "DEVICE_SESSION_CREDENTIAL_INVALID"
  );
  assert.equal(called, false);
});
