const test = require("node:test");
const assert = require("node:assert/strict");
const { authenticationOptions, verifyAuthentication } = require("../webauthn-service");

const config = {
  enabled: true,
  rpId: "app.factudarwin.com",
  rpName: "FactuDarwin",
  origins: ["https://app.factudarwin.com"]
};

test("crea un challenge durable para autenticacion sin identificar una cuenta", async () => {
  let stored;
  const db = { createWebauthnChallenge: async (value) => { stored = value; } };
  const result = await authenticationOptions({
    config,
    db,
    webauthn: { generateAuthenticationOptions: async () => ({ challenge: "challenge-1", allowCredentials: [] }) }
  });
  assert.equal(result.options.challenge, "challenge-1");
  assert.equal(stored.purpose, "authentication");
  assert.equal(stored.companyId, undefined);
  assert(stored.expiresAt > new Date());
});

test("consume el challenge una sola vez y actualiza el contador despues de verificar", async () => {
  let consumed = false;
  let counter = null;
  const db = {
    findUserPasskey: async () => ({
      id: "credential-1", companyId: "company-1", userId: "user-1", name: "Darwin",
      email: "darwin@example.com", role: "admin", publicKey: Buffer.from([1, 2]), counter: 4, transports: ["internal"]
    }),
    consumeWebauthnChallenge: async () => {
      if (consumed) return null;
      consumed = true;
      return { challenge: "challenge-1" };
    },
    updateUserPasskeyCounter: async (_id, value) => { counter = value; }
  };
  const webauthn = {
    verifyAuthenticationResponse: async (input) => {
      assert.equal(input.expectedChallenge, "challenge-1");
      assert.equal(input.requireUserVerification, true);
      return { verified: true, authenticationInfo: { newCounter: 5 } };
    }
  };
  const first = await verifyAuthentication({ config, db, challengeId: "request-1", response: { id: "credential-1" }, webauthn });
  assert.equal(first.companyId, "company-1");
  assert.equal(counter, 5);
  await assert.rejects(
    verifyAuthentication({ config, db, challengeId: "request-1", response: { id: "credential-1" }, webauthn }),
    /vencio/
  );
});

test("no permite autenticacion cuando el feature flag esta apagado", async () => {
  await assert.rejects(
    authenticationOptions({ config: { ...config, enabled: false }, db: {} }),
    /no esta habilitado/
  );
});
