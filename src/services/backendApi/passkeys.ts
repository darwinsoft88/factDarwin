import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { backendBaseUrl, fetchWithTimeout, postJson, readJson } from "./http";
import type { BackendLoginResponse } from "./types";

type PasskeyOptionsResponse = { ok?: boolean; challengeId?: string; options?: Parameters<typeof startAuthentication>[0]["optionsJSON"]; error?: string };

export async function getPasskeyCapabilities(backendUrl: string) {
  const response = await fetchWithTimeout(`${backendBaseUrl(backendUrl)}/api/auth/passkeys/capabilities`, {}, 8000);
  const result = await readJson(response) as { ok?: boolean; enabled?: boolean; rpId?: string; error?: string };
  return { enabled: response.ok && result.enabled === true, rpId: result.rpId || "" };
}

export async function getPasskeyStatus(backendUrl: string, token: string) {
  const response = await fetchWithTimeout(`${backendBaseUrl(backendUrl)}/api/auth/passkeys/status`, {
    headers: { Authorization: `Bearer ${token}` }
  }, 8000);
  const result = await readJson(response) as { ok?: boolean; enabled?: boolean; count?: number; error?: string };
  if (!response.ok) throw new Error(result.error || "No se pudo consultar Face ID para PWA.");
  return result;
}

export async function registerPasskey(backendUrl: string, token: string) {
  const base = backendBaseUrl(backendUrl);
  const optionsResponse = await postJson(`${base}/api/auth/passkeys/registration/options`, {}, "No se pudo iniciar el registro de Face ID.", token);
  const options = await readJson(optionsResponse) as PasskeyOptionsResponse;
  if (!optionsResponse.ok || !options.challengeId || !options.options) throw new Error(options.error || "No se pudo iniciar el registro de Face ID.");
  const credential = await startRegistration({ optionsJSON: options.options as Parameters<typeof startRegistration>[0]["optionsJSON"] });
  const verifyResponse = await postJson(`${base}/api/auth/passkeys/registration/verify`, {
    challengeId: options.challengeId,
    response: credential
  }, "No se pudo verificar Face ID.", token);
  const verified = await readJson(verifyResponse) as { ok?: boolean; error?: string };
  if (!verifyResponse.ok || !verified.ok) throw new Error(verified.error || "No se pudo verificar Face ID.");
}

export async function authenticateWithPasskey(backendUrl: string): Promise<BackendLoginResponse> {
  const base = backendBaseUrl(backendUrl);
  const optionsResponse = await postJson(`${base}/api/auth/passkeys/authentication/options`, {}, "No se pudo iniciar Face ID.");
  const options = await readJson(optionsResponse) as PasskeyOptionsResponse;
  if (!optionsResponse.ok || !options.challengeId || !options.options) throw new Error(options.error || "No se pudo iniciar Face ID.");
  const credential = await startAuthentication({ optionsJSON: options.options });
  const verifyResponse = await postJson(`${base}/api/auth/passkeys/authentication/verify`, {
    challengeId: options.challengeId,
    response: credential
  }, "No se pudo confirmar Face ID.");
  const result = await readJson(verifyResponse) as BackendLoginResponse;
  if (!verifyResponse.ok || !result.ok || !result.token || !result.user) throw new Error(result.error || "No se pudo iniciar sesion con Face ID.");
  return result;
}

export async function revokePasskeys(backendUrl: string, token: string) {
  const response = await fetchWithTimeout(`${backendBaseUrl(backendUrl)}/api/auth/passkeys`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  }, 8000);
  const result = await readJson(response) as { ok?: boolean; error?: string };
  if (!response.ok || !result.ok) throw new Error(result.error || "No se pudo desactivar Face ID para PWA.");
}
