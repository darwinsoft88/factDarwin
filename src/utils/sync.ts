import { mergeBackendData, SyncOperationMismatchError } from "../services/backend";
import { updateStoredData } from "../database/storage";
import type { AppDataMutation } from "../database/storage";
import { AppData } from "../types";
import { showMessage } from "./dialogs";
import { appendPendingSync, buildPendingSyncItem, clearPendingSyncRequest, findPendingSyncRequest, identifyIncrementalPatch, IdentifiedIncrementalPatch } from "./pendingSync";
import { userFriendlyActionError } from "./sriMessages";

export type IncrementalPatch = Partial<AppData> & { baseData: AppData; requestId?: string; deletions?: Partial<Record<keyof AppData, string[]>> };

export type SyncMutationWriter = (mutation: AppDataMutation) => Promise<AppData>;

export type SyncMutationOptions = {
  persistMutation: SyncMutationWriter;
};

async function syncPatchToBackendInternal(backendUrl: string, backendToken: string, patch: IncrementalPatch, pendingTitle: string, localData?: AppData, persist?: (data: AppData) => Promise<void>, mutationOptions?: SyncMutationOptions) {
  void localData;
  void persist;
  const identifiedPatch = identifyIncrementalPatch(patch);
  const writer = mutationOptions?.persistMutation || updateStoredData;
  const pendingItem = buildPendingSyncItem(identifiedPatch, pendingTitle, "Pendiente de envio.");
  const persisted = await writer((current) => appendPendingSync(current, pendingItem));
  const durablePending = findPendingSyncRequest(persisted, identifiedPatch.requestId);
  if (!durablePending) throw new Error("No se pudo confirmar la persistencia durable del pendiente de sincronizacion.");
  try {
    await mergeBackendData(backendUrl, durablePending.patch as IdentifiedIncrementalPatch, backendToken);
    await writer((current) => clearPendingSyncRequest(current, identifiedPatch.requestId));
    return true;
  } catch (error) {
    const message = userFriendlyActionError(error, "sync");
    await writer((current) => markPendingRequestError(current, identifiedPatch.requestId, message));
    if (error instanceof SyncOperationMismatchError) throw error;
    showMessage(pendingTitle, message);
    return false;
  }
}

export function syncSalePatchToBackend(backendUrl: string, backendToken: string, patch: IncrementalPatch, options: SyncMutationOptions): Promise<boolean>;
export function syncSalePatchToBackend(backendUrl: string, backendToken: string, patch: IncrementalPatch, localData?: AppData, persist?: (data: AppData) => Promise<void>): Promise<boolean>;
export async function syncSalePatchToBackend(backendUrl: string, backendToken: string, patch: IncrementalPatch, localDataOrOptions?: AppData | SyncMutationOptions, persist?: (data: AppData) => Promise<void>) {
  if (localDataOrOptions && "persistMutation" in localDataOrOptions) {
    return syncPatchToBackendInternal(backendUrl, backendToken, patch, "Documento pendiente de sincronizar", undefined, undefined, localDataOrOptions);
  }
  return syncPatchToBackendInternal(backendUrl, backendToken, patch, "Documento pendiente de sincronizar", localDataOrOptions, persist);
}

export async function syncPatchToBackendStrict(backendUrl: string, backendToken: string, patch: IncrementalPatch) {
  const identifiedPatch = identifyIncrementalPatch(patch);
  const pendingItem = buildPendingSyncItem(identifiedPatch, "Cambio pendiente de sincronizar", "Pendiente de envio.");
  const persisted = await updateStoredData((current) => appendPendingSync(current, pendingItem));
  const durablePending = findPendingSyncRequest(persisted, identifiedPatch.requestId);
  if (!durablePending) throw new Error("No se pudo confirmar la persistencia durable del pendiente de sincronizacion.");
  await mergeBackendData(backendUrl, durablePending.patch as IdentifiedIncrementalPatch, backendToken);
  await updateStoredData((current) => clearPendingSyncRequest(current, identifiedPatch.requestId));
}

function markPendingRequestError(current: AppData, requestId: string, errorMessage: string) {
  return {
    ...current,
    pendingSync: (current.pendingSync || []).map((item) => {
      const itemPatch = item.patch as { requestId?: unknown } | null;
      return itemPatch?.requestId === requestId ? { ...item, lastError: errorMessage } : item;
    })
  };
}

export function syncPatchToBackend(backendUrl: string, backendToken: string, patch: IncrementalPatch, options: SyncMutationOptions): Promise<boolean>;
export function syncPatchToBackend(backendUrl: string, backendToken: string, patch: IncrementalPatch, pendingTitle: string, options: SyncMutationOptions): Promise<boolean>;
export function syncPatchToBackend(backendUrl: string, backendToken: string, patch: IncrementalPatch, pendingTitle?: string, localData?: AppData, persist?: (data: AppData) => Promise<void>): Promise<boolean>;
export async function syncPatchToBackend(backendUrl: string, backendToken: string, patch: IncrementalPatch, pendingTitleOrOptions: string | SyncMutationOptions = "Cambio pendiente de sincronizar", localDataOrOptions?: AppData | SyncMutationOptions, persist?: (data: AppData) => Promise<void>) {
  if (typeof pendingTitleOrOptions !== "string") {
    return syncPatchToBackendInternal(backendUrl, backendToken, patch, "Cambio pendiente de sincronizar", undefined, undefined, pendingTitleOrOptions);
  }
  if (localDataOrOptions && "persistMutation" in localDataOrOptions) {
    return syncPatchToBackendInternal(backendUrl, backendToken, patch, pendingTitleOrOptions, undefined, undefined, localDataOrOptions);
  }
  return syncPatchToBackendInternal(backendUrl, backendToken, patch, pendingTitleOrOptions, localDataOrOptions, persist);
}
