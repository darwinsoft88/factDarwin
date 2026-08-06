import { backendBaseUrl, postJson, readJson } from "./http";
import { BackendCompanyOption, BackendLoginResponse, BackendRegisterPayload, BackendRegisterResponse } from "./types";

export async function loginBackend(
  backendUrl: string,
  identifier: string,
  password: string,
  username = "",
  companyId = "",
  device?: { deviceId: string; deviceLabel: string; platform: string }
) {
  const baseUrl = backendBaseUrl(backendUrl);

  const response = await postJson(
    `${baseUrl}/api/auth/login`,
    {
      email: identifier,
      identifier,
      username: username.trim(),
      password,
      companyId,
      device
    },
    "No hay conexion con el servidor para validar la sesion. Puede seguir usando la app con los datos guardados en este dispositivo."
  );
  const result = (await readJson(response)) as BackendLoginResponse;
  if (result.companyOptions?.length) {
    const error = new Error(result.error || "Elija la empresa con la que desea trabajar.") as Error & { companyOptions?: BackendCompanyOption[] };
    error.companyOptions = result.companyOptions;
    throw error;
  }
  if (!response.ok || !result.token) {
    if (response.status === 401) {
      throw new Error(result.error || "No encontramos una cuenta activa con ese correo o RUC.");
    }
    throw new Error(result.error || "No se pudo iniciar sesion en el backend.");
  }
  return result;
}

export async function registerBackend<T>(backendUrl: string, payload: BackendRegisterPayload) {
  const baseUrl = backendBaseUrl(backendUrl);
  const response = await postJson(`${baseUrl}/api/auth/register`, payload, "No hay conexion con el servidor para crear la cuenta. Revise internet e intente nuevamente.");
  const result = (await readJson(response)) as BackendRegisterResponse<T>;
  if (!response.ok || !result.token || !result.snapshot?.data) {
    throw new Error(result.error || "No se pudo crear la cuenta.");
  }
  return result;
}

export async function requestPasswordReset(backendUrl: string, identifier: string) {
  const baseUrl = backendBaseUrl(backendUrl);
  const response = await postJson(`${baseUrl}/api/auth/password-reset`, { identifier }, "No hay conexion con el servidor para recuperar la contrasena.");
  const result = (await readJson(response)) as { ok?: boolean; message?: string; email?: string; error?: string };
  if (!response.ok || !result.ok) {
    throw new Error(result.error || "No se pudo recuperar la contrasena.");
  }
  return result;
}

export async function changeBackendPassword(backendUrl: string, password: string, token = "") {
  const baseUrl = backendBaseUrl(backendUrl);
  const response = await postJson(`${baseUrl}/api/auth/change-password`, { password }, "No hay conexion con el servidor para cambiar la contrasena.", token);
  const result = (await readJson(response)) as BackendLoginResponse;
  if (!response.ok || !result.ok || !result.token || !result.user) {
    throw new Error(result.error || "No se pudo cambiar la contrasena.");
  }
  return result;
}
