import { Platform } from "react-native";
import type { AppData, Client, PendingSyncPatch, Product } from "../types";
import { updateStoredData } from "../database/storage";
import { getIncrementalBootstrap, getIncrementalCapabilities, pullIncrementalChanges, type IncrementalChange } from "./backend";
import { getIncrementalDeviceId } from "./incrementalDeviceIdentity";
import { loadIncrementalCursor, saveIncrementalCursor, type IncrementalCursorState } from "./incrementalCursorStorage";

const CLIENT_KEYS = new Set(["id", "name", "identification", "identificationType", "email", "phone", "address", "updatedAt"]);
const PRODUCT_KEYS = new Set(["id", "itemType", "code", "barcode", "name", "price", "cost", "ivaRate", "stock", "minStock", "unitMeasure", "active", "deleted", "updatedAt"]);

export type IncrementalPilotResult = { status: "disabled" | "bootstrapped" | "applied" | "blocked" | "fallback"; applied: number; data?: AppData; reason?: string };

export function localIncrementalPilotEnabled(): boolean {
  return Platform.OS === "android" && process.env.EXPO_PUBLIC_INCREMENTAL_SYNC_PILOT === "1";
}

export async function runIncrementalCatalogPilot(options: { data: AppData; token: string; companyId: string }): Promise<IncrementalPilotResult> {
  if (!localIncrementalPilotEnabled()) return { status: "disabled", applied: 0, reason: "LOCAL_FLAG_OFF" };
  if (!options.companyId || (options.data.pendingSync || []).length) { metric("sync_incremental_outbox_blocked_pull", { companyId: options.companyId }); return { status: "blocked", applied: 0, reason: "OUTBOX_NOT_EMPTY" }; }
  metric("sync_incremental_pilot_started", { companyId: options.companyId });
  const platform = Platform.OS;
  const deviceId = await getIncrementalDeviceId();
  const capability = await getIncrementalCapabilities(options.data.backendUrl, options.token, platform, deviceId);
  if (!capability.incrementalSyncEnabled) return { status: "disabled", applied: 0, reason: capability.reason };

  const moduleSet = [capability.modules.clients ? "clients" : "", capability.modules.products ? "products" : ""].filter(Boolean).join("+");
  let state = await loadIncrementalCursor(options.companyId, capability.configVersion, moduleSet);
  let currentData = options.data;
  if (!state || state.configVersion !== capability.configVersion) {
    const bootstrap = await getIncrementalBootstrap<AppData>(options.data.backendUrl, options.token, platform, deviceId);
    const persisted = await updateStoredData((current) => ({
      ...bootstrap.snapshot.data,
      backendUrl: current.backendUrl,
      autoBackupEnabled: current.autoBackupEnabled,
      pendingSync: current.pendingSync || []
    }));
    state = {
      companyId: options.companyId, protocolVersion: 1, configVersion: capability.configVersion,
      moduleSet,
      cursor: bootstrap.cursor, snapshotRevision: bootstrap.snapshotRevision,
      versions: Object.fromEntries(bootstrap.versions.map((version) => [`${version.entityType}:${version.entityId}`, { recordVersion: Number(version.recordVersion), payloadHash: version.payloadHash, action: version.action }])),
      savedAt: new Date().toISOString()
    };
    if (!localIncrementalPilotEnabled()) return { status: "disabled", applied: 0, data: persisted, reason: "LOCAL_FLAG_OFF" };
    await saveIncrementalCursor(state);
    currentData = persisted;
  }

  let applied = 0;
  let hasMore = true;
  while (hasMore) {
    if (!localIncrementalPilotEnabled()) return { status: "disabled", applied, data: currentData, reason: "LOCAL_FLAG_OFF" };
    if ((currentData.pendingSync || []).length) return { status: "blocked", applied, data: currentData, reason: "OUTBOX_NOT_EMPTY" };
    const batchStartedAt = Date.now();
    const response = await pullIncrementalChanges(currentData.backendUrl, options.token, platform, deviceId, state.cursor);
    if (!localIncrementalPilotEnabled()) return { status: "disabled", applied, data: currentData, reason: "LOCAL_FLAG_OFF" };
    let prepared;
    try {
      prepared = await prepareIncrementalBatch(currentData, state, response.changes, response.fromCursor, state.cursor, response.protocolVersion);
    } catch (error) {
      const code = error instanceof Error ? error.message : "UNKNOWN";
      metric("sync_incremental_cursor_not_advanced", { companyId: options.companyId, code });
      metric(code.includes("HASH") ? "sync_incremental_hash_mismatch" : code.includes("VERSION_GAP") ? "sync_incremental_version_gap" : "sync_incremental_conflict", { companyId: options.companyId, code });
      metric("sync_incremental_pilot_failed", { companyId: options.companyId, code });
      throw error;
    }
    if (!localIncrementalPilotEnabled()) return { status: "disabled", applied, data: currentData, reason: "LOCAL_FLAG_OFF" };
    if (prepared.changesApplied > 0) {
      currentData = await updateStoredData(() => prepared.data);
    }
    state = { ...prepared.state, cursor: response.nextCursor, snapshotRevision: response.snapshotRevision, savedAt: new Date().toISOString() };
    await saveIncrementalCursor(state);
    metric("sync_incremental_cursor_advanced", { companyId: options.companyId, changeCount: prepared.changesApplied });
    metric("sync_incremental_changes_applied", { companyId: options.companyId, changeCount: prepared.changesApplied });
    metric("sync_incremental_clients_applied", { companyId: options.companyId, changeCount: response.changes.filter((item) => item.entityType === "client").length });
    metric("sync_incremental_products_applied", { companyId: options.companyId, changeCount: response.changes.filter((item) => item.entityType === "product").length });
    metric("sync_incremental_tombstones_applied", { companyId: options.companyId, changeCount: response.changes.filter((item) => item.action === "DELETE").length });
    metric("sync_incremental_batch_duration_ms", { companyId: options.companyId, durationMs: Date.now() - batchStartedAt });
    metric("sync_incremental_batch_bytes", { companyId: options.companyId, bytes: JSON.stringify(response).length });
    applied += prepared.changesApplied;
    hasMore = response.hasMore;
  }
  metric("sync_incremental_pilot_completed", { companyId: options.companyId, applied });
  return { status: applied ? "applied" : "bootstrapped", applied, data: currentData };
}

export async function prepareIncrementalBatch(data: AppData, state: IncrementalCursorState, changes: IncrementalChange[], fromCursor: string, expectedCursor: string, protocolVersion: number) {
  if (!state.companyId || protocolVersion !== 1 || fromCursor !== expectedCursor) throw incrementalError("SYNC_BATCH_CONTEXT_INVALID");
  const pending = pendingCatalogEntities(data);
  const next = clone(data);
  const versions = { ...state.versions };
  let previousSequence = 0;
  let changesApplied = 0;
  for (const change of changes) {
    if (!Number.isSafeInteger(change.sequence) || change.sequence <= previousSequence) throw incrementalError("SYNC_BATCH_ORDER_INVALID");
    previousSequence = change.sequence;
    if (!(["client", "product"] as string[]).includes(change.entityType)) throw incrementalError("SYNC_ENTITY_TYPE_REJECTED");
    if (pending.has(`${change.entityType}:${change.entityId}`)) throw incrementalError("SYNC_INCREMENTAL_CONFLICT");
    assertPayloadShape(change);
    const actualHash = await hashIncrementalPayload(change.payload);
    if (actualHash !== change.payloadHash) throw incrementalError("SYNC_INCREMENTAL_HASH_MISMATCH");
    const key = `${change.entityType}:${change.entityId}`;
    const current = versions[key];
    if (current && change.recordVersion < current.recordVersion) continue;
    if (current && change.recordVersion === current.recordVersion) {
      if (current.payloadHash !== change.payloadHash || current.action !== change.action) throw incrementalError("SYNC_INCREMENTAL_CONFLICT");
      continue;
    }
    const expectedVersion = current ? current.recordVersion + 1 : 1;
    if (change.recordVersion !== expectedVersion) throw incrementalError("SYNC_INCREMENTAL_VERSION_GAP");
    applyChange(next, change);
    versions[key] = { recordVersion: change.recordVersion, payloadHash: change.payloadHash, action: change.action };
    changesApplied += 1;
  }
  return { data: next, state: { ...state, versions }, changesApplied };
}

function applyChange(data: AppData, change: IncrementalChange) {
  const field = change.entityType === "client" ? "clients" : "products";
  if (change.action === "DELETE") {
    data[field] = data[field].filter((item) => item.id !== change.entityId) as Client[] & Product[];
    data.deletedIds = { ...(data.deletedIds || {}), [field]: [...new Set([...(data.deletedIds?.[field] || []), change.entityId])] };
    return;
  }
  const collection = data[field] as Array<Client | Product>;
  const index = collection.findIndex((item) => item.id === change.entityId);
  if (index >= 0) collection[index] = change.payload as Client | Product;
  else collection.push(change.payload as Client | Product);
  if (data.deletedIds?.[field]) data.deletedIds[field] = data.deletedIds[field].filter((id) => id !== change.entityId);
}

function assertPayloadShape(change: IncrementalChange) {
  if (change.action === "DELETE") { if (!change.isTombstone || change.payload !== null) throw incrementalError("SYNC_TOMBSTONE_INVALID"); return; }
  if (change.isTombstone || !change.payload || typeof change.payload !== "object" || Array.isArray(change.payload)) throw incrementalError("SYNC_PAYLOAD_INVALID");
  const payload = change.payload as Record<string, unknown>;
  if (payload.id !== change.entityId) throw incrementalError("SYNC_PAYLOAD_ID_MISMATCH");
  const allowed = change.entityType === "client" ? CLIENT_KEYS : PRODUCT_KEYS;
  if (Object.keys(payload).some((key) => !allowed.has(key))) throw incrementalError("SYNC_PAYLOAD_FIELD_REJECTED");
  if (change.entityType === "client") {
    for (const field of ["id", "name", "identification", "identificationType", "email", "phone", "address"]) {
      if (typeof payload[field] !== "string") throw incrementalError("SYNC_PAYLOAD_INVALID");
    }
  } else {
    for (const field of ["id", "code", "name"]) if (typeof payload[field] !== "string") throw incrementalError("SYNC_PAYLOAD_INVALID");
    for (const field of ["price", "ivaRate", "stock"]) if (typeof payload[field] !== "number" || !Number.isFinite(payload[field])) throw incrementalError("SYNC_PAYLOAD_INVALID");
  }
}

export async function hashIncrementalPayload(payload: unknown) {
  const canonical = stable({ payload });
  const { CryptoDigestAlgorithm, digestStringAsync } = await import("expo-crypto");
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify(canonical));
}
function stable(value: unknown): unknown { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, stable(nested)])); return value; }
function pendingCatalogEntities(data: AppData) { const result = new Set<string>(); for (const item of data.pendingSync || []) { const patch = item.patch as PendingSyncPatch & { clients?: Client[]; products?: Product[]; deletions?: { clients?: string[]; products?: string[] } }; for (const client of patch.clients || []) result.add(`client:${client.id}`); for (const product of patch.products || []) result.add(`product:${product.id}`); for (const id of patch.deletions?.clients || []) result.add(`client:${id}`); for (const id of patch.deletions?.products || []) result.add(`product:${id}`); } return result; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function incrementalError(code: string) { return Object.assign(new Error(code), { code }); }
function metric(event: string, details: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.info(JSON.stringify({ event, ...details }));
}
