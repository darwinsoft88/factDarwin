import { authHeaders, backendBaseUrl, fetchWithTimeout, postJson, readJson } from "./http";
import { BackupSummary } from "./types";

export async function backupAppData<T>(backendUrl: string, data: T, token = "") {
  const baseUrl = backendBaseUrl(backendUrl);
  const response = await postJson(`${baseUrl}/api/data`, { data }, "Sin conexion con el servidor. Los datos quedan guardados en este dispositivo y se intentaran subir despues.", token);
  const result = (await readJson(response)) as { ok?: boolean; updatedAt?: string; summary?: BackupSummary; error?: string };

  if (!response.ok) {
    throw new Error(result.error || "No se pudo respaldar la base de datos.");
  }

  return result;
}

export async function mergeBackendData(backendUrl: string, patch: unknown, token = "") {
  const baseUrl = backendBaseUrl(backendUrl);
  const response = await postJson(`${baseUrl}/api/sync/merge`, patch, "Sin conexion con el servidor. El cambio queda pendiente y se sincronizara automaticamente.", token);
  const result = (await readJson(response)) as { ok?: boolean; updatedAt?: string; summary?: BackupSummary; error?: string };

  if (!response.ok) {
    throw new Error(result.error || "No se pudo sincronizar el cambio incremental.");
  }

  return result;
}

export async function restoreAppData<T>(backendUrl: string, token = "") {
  const baseUrl = backendBaseUrl(backendUrl);
  let response: Response;

  try {
    response = await fetchWithTimeout(
      `${baseUrl}/api/data`,
      { headers: authHeaders(token), cache: "no-store" },
      45000,
      "No hay conexion con el servidor para cargar la copia. Revise internet e intente nuevamente."
    );
  } catch (error) {
    throw error instanceof Error ? error : new Error("No hay conexion con el servidor para cargar la copia. Revise internet e intente nuevamente.");
  }

  const result = (await readJson(response)) as { ok?: boolean; snapshot?: { data: T; updatedAt: string; summary?: BackupSummary } | null; error?: string };

  if (!response.ok) {
    throw new Error(result.error || "No se pudo restaurar la base de datos.");
  }

  return result.snapshot;
}
