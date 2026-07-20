import { backendBaseUrl, readJson } from "./http";
import { BackendHealthResponse } from "./types";

export async function checkBackendHealth(backendUrl: string): Promise<BackendHealthResponse> {
  const baseUrl = backendBaseUrl(backendUrl);
  let response: Response;

  try {
    response = await fetch(`${baseUrl}/health`);
  } catch {
    throw new Error("No hay conexion con el servidor. Revise internet e intente nuevamente.");
  }

  const result = (await readJson(response)) as BackendHealthResponse;

  if (!response.ok) {
    throw new Error(result.error || "El backend respondio con error al probar la conexion.");
  }

  return result;
}
