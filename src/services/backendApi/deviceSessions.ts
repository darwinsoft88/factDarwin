import { backendBaseUrl, postJson, readJson } from "./http";
import type { BackendLoginResponse } from "./types";

export type DeviceSessionCredentialResponse = BackendLoginResponse & {
  ok?: boolean;
  credentialVersion?: number;
  sessionId?: string;
  refreshToken?: string;
  idempotentReplay?: boolean;
  code?: string;
};

export async function registerDeviceSession(
  backendUrl: string,
  token: string,
  device: { deviceId: string; deviceLabel: string; platform: string; appVersion?: string }
) {
  const response = await postJson(
    `${backendBaseUrl(backendUrl)}/api/auth/device-sessions/register`,
    device,
    "No hay conexion para registrar este dispositivo.",
    token
  );
  const result = await readJson(response) as DeviceSessionCredentialResponse;
  if (!response.ok || !result.refreshToken || !result.sessionId) {
    throw deviceSessionApiError(result, "No se pudo registrar el dispositivo seguro.");
  }
  return result;
}

export async function refreshDeviceSession(
  backendUrl: string,
  payload: { refreshToken: string; requestId: string; deviceId: string }
) {
  const response = await postJson(
    `${backendBaseUrl(backendUrl)}/api/auth/device-sessions/refresh`,
    payload,
    "No hay conexion para renovar la sesion segura.",
    "",
    20_000
  );
  const result = await readJson(response) as DeviceSessionCredentialResponse;
  if (!response.ok || !result.refreshToken || !result.token || !result.user) {
    throw deviceSessionApiError(result, "No se pudo renovar la sesion segura.");
  }
  return result;
}

export async function revokeDeviceSession(backendUrl: string, token: string, sessionId: string) {
  const response = await postJson(
    `${backendBaseUrl(backendUrl)}/api/auth/device-sessions/${encodeURIComponent(sessionId)}/revoke`,
    {},
    "No hay conexion para eliminar este dispositivo.",
    token
  );
  const result = await readJson(response) as { ok?: boolean; error?: string; code?: string };
  if (!response.ok || !result.ok) throw deviceSessionApiError(result, "No se pudo eliminar el dispositivo.");
}

function deviceSessionApiError(result: { error?: string; code?: string }, fallback: string) {
  const error = new Error(result.error || fallback) as Error & { code?: string };
  error.code = result.code;
  return error;
}
