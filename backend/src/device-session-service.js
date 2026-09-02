const crypto = require("node:crypto");

const CREDENTIAL_VERSION = 2;

function createDeviceSessionService({ repository, signToken, pepper }) {
  if (!repository || typeof signToken !== "function" || !pepper) {
    throw new Error("Configuracion incompleta para sesiones de dispositivo.");
  }

  const tokenHash = (secret) => crypto.createHmac("sha256", pepper).update(secret).digest("hex");
  const deterministicSecret = ({ sessionId, tokenId, generation, requestId }) => crypto
    .createHmac("sha256", pepper)
    .update(`refresh:v2:${sessionId}:${tokenId}:${generation}:${requestId}`)
    .digest("base64url");
  const encodeToken = (sessionId, tokenId, secret) => `${sessionId}.${tokenId}.${secret}`;

  async function register({ user, device }) {
    assertUserAndDevice(user, device);
    const sessionId = crypto.randomUUID();
    const tokenId = crypto.randomUUID();
    const secret = crypto.randomBytes(48).toString("base64url");
    await repository.register({
      sessionId,
      tokenId,
      tokenFamilyId: crypto.randomUUID(),
      companyId: user.companyId,
      userId: user.id,
      deviceId: device.deviceId,
      deviceLabel: device.deviceLabel || "",
      platform: device.platform || "",
      appVersion: device.appVersion || "",
      credentialVersion: CREDENTIAL_VERSION,
      tokenHash: tokenHash(secret)
    });
    return {
      credentialVersion: CREDENTIAL_VERSION,
      sessionId,
      refreshToken: encodeToken(sessionId, tokenId, secret)
    };
  }

  async function refresh({ refreshToken, requestId, deviceId }) {
    const parsed = parseToken(refreshToken);
    if (!isUuid(requestId) || !deviceId) throw authError("DEVICE_SESSION_REQUEST_INVALID", 400);
    const outcome = await repository.rotate({
      sessionId: parsed.sessionId,
      tokenId: parsed.tokenId,
      presentedTokenHash: tokenHash(parsed.secret),
      requestId,
      deviceId,
      deriveReplacement({ tokenId, generation }) {
        const secret = deterministicSecret({ sessionId: parsed.sessionId, tokenId, generation, requestId });
        return { tokenHash: tokenHash(secret), secret };
      }
    });
    if (!outcome?.user || !outcome.replacementSecret || !outcome.replacementTokenId) {
      throw authError("DEVICE_SESSION_REFRESH_FAILED", 401);
    }
    return {
      token: signToken(outcome.user),
      user: outcome.user,
      credentialVersion: CREDENTIAL_VERSION,
      sessionId: parsed.sessionId,
      refreshToken: encodeToken(parsed.sessionId, outcome.replacementTokenId, outcome.replacementSecret),
      idempotentReplay: Boolean(outcome.idempotentReplay)
    };
  }

  async function revoke({ sessionId, companyId, userId, reason = "user_revoked" }) {
    if (!sessionId || !companyId || !userId) throw authError("DEVICE_SESSION_REQUEST_INVALID", 400);
    const revoked = await repository.revoke({ sessionId, companyId, userId, reason });
    if (!revoked) throw authError("DEVICE_SESSION_NOT_FOUND", 404);
    return { ok: true };
  }

  return { register, refresh, revoke };
}

function parseToken(value) {
  const [sessionId, tokenId, secret, ...extra] = String(value || "").split(".");
  if (extra.length || !isUuid(sessionId) || !isUuid(tokenId) || !/^[A-Za-z0-9_-]{43,}$/.test(secret || "")) {
    throw authError("DEVICE_SESSION_CREDENTIAL_INVALID", 401);
  }
  return { sessionId, tokenId, secret };
}

function assertUserAndDevice(user, device) {
  if (!user?.id || !user.companyId || !device?.deviceId) throw authError("DEVICE_SESSION_REQUEST_INVALID", 400);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function authError(code, statusCode) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

module.exports = { CREDENTIAL_VERSION, createDeviceSessionService };
