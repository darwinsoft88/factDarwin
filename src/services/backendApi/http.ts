import { resolveStoredBackendUrl } from "../../database";

export function backendBaseUrl(backendUrl: string) {
  return resolveStoredBackendUrl(backendUrl).replace(/\/$/, "");
}

export function authHeaders(token: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const DEFAULT_POST_TIMEOUT_MS = 12000;
const DEFAULT_GET_TIMEOUT_MS = 30000;

export async function postJson(url: string, payload: unknown, connectionMessage: string, token = "") {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), DEFAULT_POST_TIMEOUT_MS) : null;
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(token)
      },
      signal: controller?.signal,
      body: JSON.stringify(payload)
    });
  } catch (error) {
    const detail = error instanceof Error && error.name === "AbortError"
      ? `tiempo de espera agotado (${DEFAULT_POST_TIMEOUT_MS / 1000}s)`
      : error instanceof Error ? error.message : String(error) || connectionMessage;
    throw new Error(
      "Error real de conexion hacia " +
        url +
        ": " +
        detail
    );
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = DEFAULT_GET_TIMEOUT_MS, connectionMessage = "No hay conexion con el servidor.") {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    return await fetch(url, {
      ...options,
      signal: controller?.signal
    });
  } catch (error) {
    const detail = error instanceof Error && error.name === "AbortError"
      ? `tiempo de espera agotado (${timeoutMs / 1000}s)`
      : error instanceof Error ? error.message : String(error) || connectionMessage;
    throw new Error(`${connectionMessage} Detalle: ${detail}`);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return { error: "El backend respondio con un formato invalido." };
  }
}
