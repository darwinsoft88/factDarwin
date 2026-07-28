import type { AppData, PendingSyncItem } from "../types";
import { shortText } from "./format";
import { generateId } from "./id";
import type { IncrementalPatch } from "./sync";

export const MAX_PENDING_ITEMS = 100;
export const MAX_SYNC_REQUEST_ID_LENGTH = 200;

export type IdentifiedIncrementalPatch = IncrementalPatch & { requestId: string };

export class LocalSyncRequestIdConflictError extends Error {
  readonly code = "LOCAL_SYNC_REQUEST_ID_CONFLICT" as const;
  readonly requestId: string;

  constructor(requestId: string) {
    super("El identificador de sincronizacion local ya existe con un contenido diferente.");
    this.name = "LocalSyncRequestIdConflictError";
    this.requestId = requestId;
  }
}

export class InvalidSyncRequestIdError extends Error {
  readonly code = "INVALID_SYNC_REQUEST_ID" as const;
  readonly receivedType: string;

  constructor(value: unknown) {
    super("El requestId de sincronizacion esta presente pero no es valido.");
    this.name = "InvalidSyncRequestIdError";
    this.receivedType = value === null ? "null" : typeof value;
  }
}

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
  const requestId = pendingRequestId(pending);
  const existingRequest = requestId ? current.find((item) => pendingRequestId(item) === requestId) : undefined;
  if (existingRequest) {
    if (!samePendingPayload(existingRequest.patch, pending.patch)) throw new LocalSyncRequestIdConflictError(requestId as string);
    return localData;
  }
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

export function clearPendingSyncRequest(snapshot: AppData, requestId: string) {
  const remaining = (snapshot.pendingSync || []).filter((item) => pendingRequestId(item) !== requestId);
  return applyPendingSyncResult(snapshot, remaining);
}

export function findPendingSyncRequest(snapshot: AppData, requestId: string) {
  return (snapshot.pendingSync || []).find((item) => pendingRequestId(item) === requestId);
}

export function normalizeSyncRequestId(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized === value && normalized.length <= MAX_SYNC_REQUEST_ID_LENGTH ? normalized : null;
}

export function identifyIncrementalPatch(patch: IncrementalPatch): IdentifiedIncrementalPatch {
  const hasRequestId = Object.prototype.hasOwnProperty.call(patch, "requestId");
  if (!hasRequestId) return { ...patch, requestId: generateSyncRequestId() };
  const existing = normalizeSyncRequestId(patch.requestId);
  if (!existing) throw new InvalidSyncRequestIdError(patch.requestId);
  return { ...patch, requestId: existing };
}

function generateSyncRequestId() {
  const cryptoApi = globalThis.crypto;
  const uuid = typeof cryptoApi?.randomUUID === "function"
    ? cryptoApi.randomUUID()
    : typeof cryptoApi?.getRandomValues === "function"
      ? bytesToUuid(randomBytes(cryptoApi))
      : nativeRandomUuid();
  return `sync_${uuid}`;
}

function nativeRandomUuid() {
  try {
    // Metro incluye este require estático y Expo Crypto usa la fuente nativa segura
    // de Android/iOS cuando Hermes no expone globalThis.crypto.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const expoCrypto = require("expo-crypto") as typeof import("expo-crypto");
    return expoCrypto.randomUUID();
  } catch (cause) {
    const error = new Error("No existe una fuente criptografica disponible para identificar la sincronizacion.");
    Object.defineProperty(error, "cause", { value: cause, enumerable: false });
    throw error;
  }
}

function randomBytes(cryptoApi: Crypto) {
  if (typeof cryptoApi.getRandomValues !== "function") {
    throw new Error("No existe una fuente criptografica disponible para identificar la sincronizacion.");
  }
  return cryptoApi.getRandomValues(new Uint8Array(16));
}

function bytesToUuid(source: Uint8Array) {
  const bytes = Uint8Array.from(source);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function pendingRequestId(item: PendingSyncItem) {
  const patch = item.patch as { requestId?: unknown } | null;
  return normalizeSyncRequestId(patch?.requestId);
}

function canonicalPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalPayload);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((result, key) => {
    result[key] = canonicalPayload((value as Record<string, unknown>)[key]);
    return result;
  }, {});
}

function samePendingPayload(left: unknown, right: unknown) {
  return JSON.stringify(canonicalPayload(left)) === JSON.stringify(canonicalPayload(right));
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
