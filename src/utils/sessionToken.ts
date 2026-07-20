const TOKEN_EXPIRY_SKEW_MS = 30_000;

export function getJwtExpirationMs(token: string) {
  const payload = decodeJwtPayload(token);
  const exp = payload && typeof payload.exp === "number" ? payload.exp : 0;
  return exp > 0 ? exp * 1000 : null;
}

export function isSessionTokenExpired(token: string, nowMs = Date.now(), skewMs = TOKEN_EXPIRY_SKEW_MS) {
  if (!token) return false;
  const expiresAt = getJwtExpirationMs(token);
  if (!expiresAt) return false;
  return expiresAt <= nowMs + skewMs;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || !parts[1]) return null;

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
    return JSON.parse(base64Decode(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function base64Decode(value: string) {
  if (typeof globalThis.atob === "function") {
    return globalThis.atob(value);
  }
  return "";
}
