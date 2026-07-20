import { authHeaders, backendBaseUrl, readJson } from "./http";
import { TechnicalLog } from "./types";

export async function getTechnicalLogs(backendUrl: string, token = "", limit = 80) {
  const baseUrl = backendBaseUrl(backendUrl);
  let response: Response;

  try {
    response = await fetch(`${baseUrl}/api/support/logs?limit=${encodeURIComponent(String(limit))}`, { headers: authHeaders(token) });
  } catch {
    throw new Error("No hay conexion con el servidor para consultar soporte. Revise internet e intente nuevamente.");
  }

  const result = (await readJson(response)) as { ok?: boolean; logs?: TechnicalLog[]; error?: string };

  if (!response.ok) {
    throw new Error(result.error || "No se pudieron consultar los logs tecnicos.");
  }

  return result.logs || [];
}
