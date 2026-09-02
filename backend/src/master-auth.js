const crypto = require("node:crypto");

function createMasterKeyMiddleware({ getKey, maxFailures = 5, blockMs = 15 * 60 * 1000, now = () => Date.now() }) {
  const failuresByClient = new Map();
  return function requireMasterKey(req, res, next) {
    const key = String(getKey() || "");
    if (!key) return res.status(503).json({ error: "Panel maestro inactivo. Configure MASTER_ADMIN_KEY en backend/.env." });
    const clientKey = String(req.ip || req.socket?.remoteAddress || "unknown");
    const currentTime = now();
    const attempt = failuresByClient.get(clientKey);
    if (attempt?.blockedUntil > currentTime) {
      res.set("Retry-After", String(Math.ceil((attempt.blockedUntil - currentTime) / 1000)));
      return res.status(429).json({ error: "Demasiados intentos fallidos. Espere antes de volver a ingresar." });
    }
    if (!constantTimeEqual(req.headers["x-master-key"], key)) {
      const failures = attempt?.blockedUntil ? 1 : (attempt?.failures || 0) + 1;
      failuresByClient.set(clientKey, { failures, blockedUntil: failures >= maxFailures ? currentTime + blockMs : 0 });
      return res.status(401).json({ error: "Clave maestra invalida." });
    }
    failuresByClient.delete(clientKey);
    next();
  };
}

function constantTimeEqual(candidate, expected) {
  const candidateBuffer = Buffer.from(String(candidate || ""), "utf8");
  const expectedBuffer = Buffer.from(String(expected || ""), "utf8");
  return candidateBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(candidateBuffer, expectedBuffer);
}

module.exports = { constantTimeEqual, createMasterKeyMiddleware };
