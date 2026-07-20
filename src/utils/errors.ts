export function loginErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (!message) return "No se pudo validar el acceso. Revise sus datos e intente nuevamente.";
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

export function isBackendConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const normalized = message.toLowerCase();
  return normalized.includes("no hay conexion") ||
    normalized.includes("network request failed") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("load failed");
}
