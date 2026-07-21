import type { AppData, PendingSyncItem } from "../types";
import { shortText } from "./format";
import { generateId } from "./id";
import type { IncrementalPatch } from "./sync";

export const MAX_PENDING_ITEMS = 100;

export class PendingSyncCapacityError extends Error {
  readonly code = "PENDING_SYNC_CAPACITY_REACHED" as const;
  readonly limit: number;
  readonly currentSize: number;

  constructor(currentSize: number, limit = MAX_PENDING_ITEMS) {
    super(`La cola de sincronizacion alcanzo su limite de ${limit} operaciones. Sincronice los pendientes antes de continuar.`);
    this.name = "PendingSyncCapacityError";
    this.limit = limit;
    this.currentSize = currentSize;
  }
}

export function sortPendingSyncFifo(items: PendingSyncItem[]) {
  return items
    .map((item, index) => ({ item, index, timestamp: pendingTimestamp(item.createdAt) }))
    .sort((left, right) => {
      if (left.timestamp !== null && right.timestamp !== null && left.timestamp !== right.timestamp) {
        return left.timestamp - right.timestamp;
      }
      const positionDifference = left.index - right.index;
      if (positionDifference !== 0) return positionDifference;
      return String(left.item.id || "").localeCompare(String(right.item.id || ""));
    })
    .map(({ item }) => item);
}

function pendingTimestamp(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

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
  const current = localData.pendingSync || [];
  const existingIndex = current.findIndex((item) => item.id === pending.id);
  if (existingIndex < 0 && current.length >= MAX_PENDING_ITEMS) {
    throw new PendingSyncCapacityError(current.length);
  }
  const nextPending = existingIndex >= 0
    ? current.map((item, index) => index === existingIndex ? pending : item)
    : [...current, pending];
  return {
    ...localData,
    pendingSync: sortPendingSyncFifo(nextPending),
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
