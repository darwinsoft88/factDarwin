export function loginErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (!message) return "No se pudo validar el acceso. Revise sus datos e intente nuevamente.";
  const codes = errorCodes(error);
  if (codes.has("SNAPSHOT_MIGRATION_FAILED")) {
    return "El acceso fue validado, pero no se pudo migrar la información de este dispositivo. Los datos anteriores se conservaron intactos.";
  }
  if (codes.has("SNAPSHOT_FILE_WRITE_FAILED")) {
    return "El acceso fue validado, pero no se pudo guardar la información en este dispositivo. La versión anterior se conservó intacta.";
  }
  if (codes.has("SNAPSHOT_FILE_CORRUPTED") || codes.has("STORAGE_RECOVERY_REQUIRED")) {
    return "La información local está dañada o incompleta. Los archivos se conservaron para recuperación; no se creó una empresa vacía.";
  }
  const normalized = message.toLowerCase();
  const looksLikeDatabaseAuthError =
    normalized.includes("postgres") ||
    normalized.includes("database") ||
    normalized.includes("base de datos") ||
    normalized.includes("password authentication") ||
    (normalized.includes("password") && normalized.includes("fall")) ||
    (normalized.includes("autent") && normalized.includes("fall"));
  if (looksLikeDatabaseAuthError) {
    return "El servidor no pudo validar el acceso en este momento. Revise que el backend tenga configurada correctamente la base de datos e intente nuevamente.";
  }
  if (message.includes("No hay conexion")) return message;
  if (message.includes("varias empresas")) return message;
  if (message.includes("clave") || message.includes("contrasena")) return message;
  if (message.includes("No encontramos una cuenta")) return message;
  if (message.includes("Credenciales invalidas")) return "No encontramos una cuenta activa con esos datos. Revise el correo/RUC o registre la empresa.";
  return message;
}

function errorCodes(error: unknown) {
  const codes = new Set<string>();
  const visited = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const detail = current as { code?: unknown; cause?: unknown };
    if (typeof detail.code === "string") codes.add(detail.code);
    current = detail.cause;
  }
  return codes;
}

export function isBackendConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const normalized = message.toLowerCase();
  return normalized.includes("no hay conexion") ||
    normalized.includes("network request failed") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("load failed");
}
