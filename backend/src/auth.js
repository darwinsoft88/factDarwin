const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const config = require("./config");

function hashPassword(password) {
  return bcrypt.hashSync(String(password || ""), 12);
}

function legacyHashPassword(password) {
  return crypto.createHash("sha256").update(`factura-sri:${password}`).digest("hex");
}

function verifyPassword(password, storedHash) {
  const value = String(password || "");
  const hash = String(storedHash || "");

  if (!hash) {
    return false;
  }

  if (hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$")) {
    return bcrypt.compareSync(value, hash);
  }

  return timingSafeEqual(hash, legacyHashPassword(value));
}

function signToken(user) {
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    sub: user.id,
    companyId: user.companyId || "",
    name: user.name,
    email: user.email,
    role: user.role || "vendedor",
    supportAccess: Boolean(user.supportAccess),
    iat: now,
    exp: now + Math.max(1, config.jwtExpiresInHours) * 60 * 60
  };

  return `${base64UrlJson({ alg: "HS256", typ: "JWT" })}.${base64UrlJson(payload)}.${signature(payload)}`;
}

function verifyToken(token) {
  const parts = String(token || "").split(".");

  if (parts.length !== 3) {
    throwUnauthorized("Token invalido.");
  }

  const [headerPart, payloadPart, signaturePart] = parts;

  const expected = hmac(`${headerPart}.${payloadPart}`);

  if (!timingSafeEqual(signaturePart, expected)) {
    throwUnauthorized("Firma JWT invalida.");
  }

  const payload = JSON.parse(
    Buffer.from(payloadPart, "base64url").toString("utf8")
  );

  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throwUnauthorized("Sesion expirada.");
  }

  return payload;
}

function requireAuth(roles = []) {
  return (req, res, next) => {
    if (!config.authRequired) {
      req.user = {
        id: "dev",
        role: "admin",
        name: "Desarrollo"
      };

      next();
      return;
    }

    try {
      const authHeader = req.headers.authorization || "";

      const match = /^Bearer\s+(.+)$/i.exec(authHeader);

      if (!match) {
        throwUnauthorized("Falta token Bearer.");
      }

      const user = verifyToken(match[1]);

      if (roles.length && !roles.includes(user.role)) {
        const error = new Error("No tiene permiso para esta accion.");
        error.statusCode = 403;
        throw error;
      }

      req.user = user;

      next();
    } catch (error) {
      next(error);
    }
  };
}

function authenticateUser(snapshot, email, password) {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  const users = snapshot?.data?.users || [];

  if (
    !users.length &&
    normalizedEmail === "admin@empresa.com" &&
    String(password || "") === "123456"
  ) {
    return {
      id: "u-admin",
      name: "Administrador",
      email: "admin@empresa.com",
      role: "admin"
    };
  }

  const user = users.find(
    (item) =>
      String(item.email || "")
        .trim()
        .toLowerCase() === normalizedEmail
  );

  if (!user) {
    return null;
  }

  if (
    verifyPassword(password, user.passwordHash) ||
    user.password === password
  ) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role || "vendedor"
    };
  }

  return null;
}

function signature(payload) {
  const headerPart = base64UrlJson({
    alg: "HS256",
    typ: "JWT"
  });

  const payloadPart = base64UrlJson(payload);

  return hmac(`${headerPart}.${payloadPart}`);
}

function hmac(value) {
  return crypto
    .createHmac("sha256", config.jwtSecret)
    .update(value)
    .digest("base64url");
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value))
    .toString("base64url");
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function throwUnauthorized(message) {
  const error = new Error(message);
  error.statusCode = 401;
  throw error;
}

module.exports = {
  authenticateUser,
  hashPassword,
  legacyHashPassword,
  requireAuth,
  signToken,
  verifyPassword
};
