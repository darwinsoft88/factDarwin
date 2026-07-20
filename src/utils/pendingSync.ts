import { AppData, PendingSyncItem } from "../types";
import { shortText } from "./format";
import { generateId } from "./id";
import { IncrementalPatch } from "./sync";

function compactPatchForPendingQueue(patch: IncrementalPatch): unknown {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return patch;
  const compacted: Record<string, unknown> = {};
  Object.entries(patch as Record<string, unknown>).forEach(([key, value]) => {
    if (key !== "baseData") compacted[key] = value;
  });
  return compacted;
}

export function buildPendingSyncItem(patch: IncrementalPatch, title: string, errorMessage: string): PendingSyncItem {
  return {
    id: generateId(),
    createdAt: new Date().toISOString(),
    attempts: 0,
    title,
    lastError: shortText(errorMessage, 180),
    patch: compactPatchForPendingQueue(patch)
  };
}

export function appendPendingSync(localData: AppData, pending: PendingSyncItem) {
  return {
    ...localData,
    pendingSync: [pending, ...(localData.pendingSync || [])].slice(0, 100),
    autoBackupLastError: `${pending.title}: ${shortText(pending.lastError || "", 140)}`
  };
}

export function markPendingSyncAttempt(item: PendingSyncItem, errorMessage: string): PendingSyncItem {
  return {
    ...item,
    attempts: item.attempts + 1,
    lastError: shortText(errorMessage, 180)
  };
}

export function applyPendingSyncResult(snapshot: AppData, remaining: PendingSyncItem[]) {
  return {
    ...snapshot,
    pendingSync: remaining,
    autoBackupLastError: remaining.length ? `${remaining.length} cambio(s) pendiente(s) por sincronizar.` : ""
  };
}

export function clearPendingSyncItems(snapshot: AppData, ids: string[]) {
  if (ids.length === 0) return snapshot;
  const clearedIds = new Set(ids);
  const remaining = (snapshot.pendingSync || []).filter((item) => !clearedIds.has(item.id));
  return applyPendingSyncResult(snapshot, remaining);
}
