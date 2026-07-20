import { mergeBackendData } from "../services/backend";
import { AppData } from "../types";
import { showMessage } from "./dialogs";
import { appendPendingSync, buildPendingSyncItem } from "./pendingSync";
import { userFriendlyActionError } from "./sriMessages";

export type IncrementalPatch = Partial<AppData> & { baseData: AppData; deletions?: Partial<Record<keyof AppData, string[]>> };

export async function syncPatchToBackend(backendUrl: string, backendToken: string, patch: IncrementalPatch, pendingTitle = "Cambio pendiente de sincronizar", localData?: AppData, persist?: (data: AppData) => Promise<void>) {
  try {
    await mergeBackendData(backendUrl, patch, backendToken);
    return true;
  } catch (error) {
    const message = userFriendlyActionError(error, "sync");
    if (localData && persist) {
      await enqueuePendingSync(localData, persist, patch, pendingTitle, message);
    }
    showMessage(pendingTitle, message);
    return false;
  }
}

export async function syncSalePatchToBackend(backendUrl: string, backendToken: string, patch: IncrementalPatch, localData?: AppData, persist?: (data: AppData) => Promise<void>) {
  return syncPatchToBackend(backendUrl, backendToken, patch, "Documento pendiente de sincronizar", localData, persist);
}

export async function syncPatchToBackendStrict(backendUrl: string, backendToken: string, patch: IncrementalPatch) {
  await mergeBackendData(backendUrl, patch, backendToken);
}

async function enqueuePendingSync(localData: AppData, persist: (data: AppData) => Promise<void>, patch: IncrementalPatch, title: string, errorMessage: string) {
  await persist(appendPendingSync(localData, buildPendingSyncItem(patch, title, errorMessage)));
}
