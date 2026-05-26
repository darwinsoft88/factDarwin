import { loginBackend, registerBackend, requestPasswordReset, restoreAppData, changeBackendPassword } from "./backend";
import type { BackendRegisterPayload, BackendRegisterResponse } from "./backend";

export async function attemptLogin(backendUrl: string, identifier: string, password: string, companyId = "") {
  return await loginBackend(backendUrl, identifier, password, companyId);
}

export async function fetchSnapshot<T>(backendUrl: string, token = "") {
  return await restoreAppData<T>(backendUrl, token);
}

export async function registerTenantBackend<T>(backendUrl: string, payload: BackendRegisterPayload) {
  return await registerBackend<T>(backendUrl, payload);
}

export async function requestPasswordResetBackend(backendUrl: string, identifier: string) {
  return await requestPasswordReset(backendUrl, identifier);
}

export async function changePasswordBackend(backendUrl: string, password: string, token = "") {
  return await changeBackendPassword(backendUrl, password, token);
}

export type { BackendRegisterPayload, BackendRegisterResponse };
