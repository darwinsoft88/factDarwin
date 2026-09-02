const crypto = require("node:crypto");
const {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} = require("@simplewebauthn/server");

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const defaultWebauthn = {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
};

function passkeyError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function assertEnabled(config) {
  if (!config.enabled) throw passkeyError("El acceso con Passkey no esta habilitado.", 404);
  if (!config.rpId || !config.origins.length) throw passkeyError("Passkeys no estan configuradas correctamente.", 503);
}

async function registrationOptions({ config, db, user, webauthn = defaultWebauthn }) {
  assertEnabled(config);
  const existing = await db.listUserPasskeys(user.companyId, user.id);
  const options = await webauthn.generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpId,
    userID: Buffer.from(`${user.companyId}:${user.id}`, "utf8"),
    userName: user.email,
    userDisplayName: user.name || user.email,
    attestationType: "none",
    excludeCredentials: existing.map((item) => ({ id: item.id, transports: item.transports })),
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      residentKey: "required",
      userVerification: "required"
    }
  });
  const challengeId = crypto.randomUUID();
  await db.createWebauthnChallenge({
    id: challengeId,
    purpose: "registration",
    companyId: user.companyId,
    userId: user.id,
    challenge: options.challenge,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS)
  });
  return { challengeId, options };
}

async function verifyRegistration({ config, db, user, challengeId, response, webauthn = defaultWebauthn }) {
  assertEnabled(config);
  const stored = await db.consumeWebauthnChallenge(challengeId, "registration");
  if (!stored || stored.companyId !== user.companyId || stored.userId !== user.id) {
    throw passkeyError("El registro biometrico vencio. Intente nuevamente.", 409);
  }
  const verification = await webauthn.verifyRegistrationResponse({
    response,
    expectedChallenge: stored.challenge,
    expectedOrigin: config.origins,
    expectedRPID: config.rpId,
    requireUserVerification: true
  });
  if (!verification.verified || !verification.registrationInfo) {
    throw passkeyError("No se pudo verificar Face ID.", 401);
  }
  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  await db.saveUserPasskey({
    id: credential.id,
    companyId: user.companyId,
    userId: user.id,
    publicKey: credential.publicKey,
    counter: credential.counter,
    transports: credential.transports || response.response?.transports || [],
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp
  });
  return { id: credential.id };
}

async function authenticationOptions({ config, db, webauthn = defaultWebauthn }) {
  assertEnabled(config);
  const options = await webauthn.generateAuthenticationOptions({
    rpID: config.rpId,
    userVerification: "required",
    allowCredentials: []
  });
  const challengeId = crypto.randomUUID();
  await db.createWebauthnChallenge({
    id: challengeId,
    purpose: "authentication",
    challenge: options.challenge,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS)
  });
  return { challengeId, options };
}

async function verifyAuthentication({ config, db, challengeId, response, webauthn = defaultWebauthn }) {
  assertEnabled(config);
  const passkey = await db.findUserPasskey(String(response?.id || ""));
  if (!passkey) throw passkeyError("Esta Passkey no esta registrada o fue revocada.", 401);
  const stored = await db.consumeWebauthnChallenge(challengeId, "authentication");
  if (!stored) throw passkeyError("La solicitud de Face ID vencio. Intente nuevamente.", 409);
  const verification = await webauthn.verifyAuthenticationResponse({
    response,
    expectedChallenge: stored.challenge,
    expectedOrigin: config.origins,
    expectedRPID: config.rpId,
    credential: {
      id: passkey.id,
      publicKey: new Uint8Array(passkey.publicKey),
      counter: passkey.counter,
      transports: passkey.transports
    },
    requireUserVerification: true
  });
  if (!verification.verified) throw passkeyError("No se pudo confirmar Face ID.", 401);
  await db.updateUserPasskeyCounter(passkey.id, verification.authenticationInfo.newCounter);
  return {
    id: passkey.userId,
    companyId: passkey.companyId,
    name: passkey.name,
    email: passkey.email,
    role: passkey.role || "vendedor",
    mustChangePassword: Boolean(passkey.mustChangePassword)
  };
}

module.exports = {
  authenticationOptions,
  registrationOptions,
  verifyAuthentication,
  verifyRegistration
};
