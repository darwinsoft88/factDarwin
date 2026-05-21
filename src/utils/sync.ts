import { mergeBackendData } from "../services/backend";
import { AppData, PendingSyncItem } from "../types";
import { showMessage } from "./dialogs";
import { shortText } from "./format";
import { generateId } from "./id";
import { userFriendlyActionError } from "./sriMessages";

export type IncrementalPatch = Partial<AppData> & { baseData: AppData; deletions?: Partial<Record<keyof AppData, string[]>> };

export async function syncPatchToBackend(backendUrl: string, backendToken: string, patch: IncrementalPatch, pendingTitle = "Cambio pendiente de sincronizar", localData?: AppData, persist?: (data: AppData) => Promise<void>) {
  try {
    await mergeBackendData(backendUrl, patch, backendToken);
  } catch (error) {
    const message = userFriendlyActionError(error, "sync");
    if (localData && persist) {
      await enqueuePendingSync(localData, persist, patch, pendingTitle, message);
    }
    showMessage(pendingTitle, message);
  }
}

export async function syncSalePatchToBackend(backendUrl: string, backendToken: string, patch: IncrementalPatch, localData?: AppData, persist?: (data: AppData) => Promise<void>) {
  await syncPatchToBackend(backendUrl, backendToken, patch, "Documento pendiente de sincronizar", localData, persist);
}

async function enqueuePendingSync(localData: AppData, persist: (data: AppData) => Promise<void>, patch: IncrementalPatch, title: string, errorMessage: string) {
  const pending: PendingSyncItem = {
    id: generateId(),
    createdAt: new Date().toISOString(),
    attempts: 0,
    title,
    lastError: shortText(errorMessage, 180),
    patch
  };
  await persist({
    ...localData,
    pendingSync: [pending, ...(localData.pendingSync || [])].slice(0, 100),
    autoBackupLastError: `${title}: ${shortText(errorMessage, 140)}`
  });
}
