function safeOrigin(value) {
  try {
    return value ? new URL(value).origin : "";
  } catch {
    return "";
  }
}

function isAllowedPagesPreview(origin) {
  try {
    const { hostname, protocol } = new URL(origin);
    return protocol === "https:" && hostname.endsWith(".factudarwin-app.pages.dev");
  } catch {
    return false;
  }
}

function requestOrigin(req) {
  const forwardedProto = String(req.headers?.["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || req.protocol || "http";
  const host = String(req.headers?.host || "").trim();
  return host ? safeOrigin(`${protocol}://${host}`) : "";
}

function isLoopbackOrigin(origin) {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

function isCorsOriginAllowed(origin, req, options = {}) {
  if (!origin) return true;

  const normalizedOrigin = safeOrigin(origin);
  if (!normalizedOrigin) return false;

  const allowedOrigins = Array.isArray(options.allowedOrigins)
    ? options.allowedOrigins.map(safeOrigin).filter(Boolean)
    : [];
  const publicOrigin = safeOrigin(options.publicUrl);
  const sameOrigin = requestOrigin(req);
  const isLocalDevelopmentRequest = isLoopbackOrigin(normalizedOrigin) && isLoopbackOrigin(sameOrigin);

  if (
    allowedOrigins.includes(normalizedOrigin) ||
    (publicOrigin && normalizedOrigin === publicOrigin) ||
    (sameOrigin && normalizedOrigin === sameOrigin) ||
    isLocalDevelopmentRequest ||
    isAllowedPagesPreview(normalizedOrigin)
  ) {
    return true;
  }

  return !options.isProduction && allowedOrigins.length === 0;
}

function createCorsOptions(req, options = {}) {
  return {
    credentials: true,
    origin(origin, callback) {
      if (isCorsOriginAllowed(origin, req, options)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origen no permitido por CORS."));
    }
  };
}

module.exports = {
  createCorsOptions,
  isCorsOriginAllowed,
  isLoopbackOrigin,
  requestOrigin,
  safeOrigin
};
