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
  const requestId = syncRequestIdFromPatch(patch);
  const response = await fetchWithTimeout(`${baseUrl}/api/sync/merge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(token),
      "Idempotency-Key": requestId
    },
    body: JSON.stringify(patch)
  }, 12000, "Sin conexion con el servidor. El cambio queda pendiente y se sincronizara automaticamente.");
  const result = (await readJson(response)) as { ok?: boolean; updatedAt?: string; summary?: BackupSummary; error?: string; code?: string; requestId?: string };

  if (!response.ok) {
    if (response.status === 409 && result.code === "SYNC_OPERATION_MISMATCH") {
      throw new SyncOperationMismatchError(result.error || "El identificador de sincronizacion ya fue utilizado con otro contenido.", result.requestId || requestId);
    }
    throw new Error(result.error || "No se pudo sincronizar el cambio incremental.");
  }

  return result;
}

export class SyncOperationMismatchError extends Error {
  readonly status = 409;
  readonly code = "SYNC_OPERATION_MISMATCH" as const;
  readonly requestId: string;

  constructor(message: string, requestId: string) {
    super(message);
    this.name = "SyncOperationMismatchError";
    this.requestId = requestId;
  }
}

function syncRequestIdFromPatch(patch: unknown) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new TypeError("El patch de sincronizacion debe incluir requestId.");
  }
  const requestId = (patch as { requestId?: unknown }).requestId;
  if (typeof requestId !== "string" || !requestId.trim() || requestId !== requestId.trim() || requestId.length > 200) {
    throw new TypeError("El patch de sincronizacion debe incluir un requestId valido.");
  }
  return requestId;
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
