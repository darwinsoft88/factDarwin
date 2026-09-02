import { backendBaseUrl, fetchWithTimeout, readJson } from "./http";
import { BackendHealthResponse } from "./types";

export async function checkBackendHealth(backendUrl: string): Promise<BackendHealthResponse> {
  const baseUrl = backendBaseUrl(backendUrl);
  const response = await fetchWithTimeout(
    `${baseUrl}/health`,
    { cache: "no-store" },
    12000,
    "No hay conexion con el servidor. Revise internet e intente nuevamente."
  );

  const result = (await readJson(response)) as BackendHealthResponse;

  if (!response.ok) {
    throw new Error(result.error || "El backend respondio con error al probar la conexion.");
  }

  return result;
}
