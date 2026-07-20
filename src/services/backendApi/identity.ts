import { authHeaders, backendBaseUrl, readJson } from "./http";
import { IdentityLookupResponse } from "./types";

export async function lookupIdentityData(backendUrl: string, identifier: string, token = "") {
  const baseUrl = backendBaseUrl(backendUrl);
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    response = await fetch(`${baseUrl}/api/datos/identificacion/${encodeURIComponent(identifier)}`, {
      headers: authHeaders(token),
      signal: controller.signal
    });
  } catch (error) {
    throw new Error(error instanceof Error && error.name === "AbortError"
      ? "La consulta tardo demasiado. Intente nuevamente."
      : "No hay conexion para consultar datos personales.");
  } finally {
    clearTimeout(timeout);
  }

  const result = (await readJson(response)) as IdentityLookupResponse;
  if (!response.ok || !result.ok) {
    throw new Error(result.error || "No se pudo consultar la identificacion.");
  }
  return result;
}
