export function loginErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (!message) return "No se pudo validar el acceso. Revise sus datos e intente nuevamente.";
  if (message.includes("No hay conexion")) return message;
  if (message.includes("varias empresas")) return message;
  if (message.includes("clave") || message.includes("contrasena")) return message;
  if (message.includes("No encontramos una cuenta")) return message;
  if (message.includes("Credenciales invalidas")) return "No encontramos una cuenta activa con esos datos. Revise el correo/RUC o registre la empresa.";
  return message;
}

export function isBackendConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("No hay conexion");
}
