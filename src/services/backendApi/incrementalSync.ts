import { APP_VERSION } from "../../constants/branding";
import { authHeaders, backendBaseUrl, fetchWithTimeout, readJson } from "./http";

export type IncrementalModules = { clients: boolean; products: boolean };
export type IncrementalChange = { sequence: number; module: string; entityType: "client" | "product"; entityId: string; action: "UPSERT" | "DELETE"; recordVersion: number; payloadHash: string; payload: unknown | null; isTombstone: boolean; origin: string; occurredAt: string };
export type IncrementalPullResponse = { ok: boolean; protocolVersion: 1; mode: "pilot"; fromCursor: string; nextCursor: string; hasMore: boolean; changeCount: number; snapshotRevision: number; changes: IncrementalChange[]; modules: IncrementalModules; requiresFullSnapshot?: boolean; error?: { code?: string } };

function headers(token: string, platform: string, deviceId: string) { return { ...authHeaders(token), "X-Sync-Protocol-Version": "1", "X-App-Version": APP_VERSION, "X-Platform": platform, "X-Device-Id": deviceId }; }
async function getJson<T>(url: string, token: string, platform: string, deviceId: string): Promise<T> {
  const response = await fetchWithTimeout(url, { headers: headers(token, platform, deviceId), cache: "no-store" }, 15000, "No se pudo ejecutar la sincronizacion incremental.");
  const result = await readJson(response) as T & { error?: { code?: string } };
  if (!response.ok) { const error = new Error(result.error?.code || "SYNC_INCREMENTAL_FAILED") as Error & { code?: string; requiresFullSnapshot?: boolean }; error.code = result.error?.code; error.requiresFullSnapshot = response.status === 410 || response.status === 409; throw error; }
  return result;
}
export function getIncrementalCapabilities(backendUrl: string, token: string, platform: string, deviceId: string) { return getJson<{ ok: boolean; incrementalSyncEnabled: boolean; syncProtocolVersion: 1; modules: IncrementalModules; configVersion: string; snapshotFallbackAvailable: boolean; reason: string }>(`${backendBaseUrl(backendUrl)}/api/sync/capabilities`, token, platform, deviceId); }
export function getIncrementalBootstrap<T>(backendUrl: string, token: string, platform: string, deviceId: string) { return getJson<{ ok: boolean; protocolVersion: 1; snapshot: { data: T; updatedAt: string }; snapshotRevision: number; cursor: string; versions: Array<{ entityType: "client" | "product"; entityId: string; recordVersion: number; payloadHash: string; action: "UPSERT" | "DELETE" }>; modules: IncrementalModules }>(`${backendBaseUrl(backendUrl)}/api/sync/bootstrap`, token, platform, deviceId); }
export function pullIncrementalChanges(backendUrl: string, token: string, platform: string, deviceId: string, cursor: string, limit = 100) { return getJson<IncrementalPullResponse>(`${backendBaseUrl(backendUrl)}/api/sync/pull?cursor=${encodeURIComponent(cursor)}&limit=${limit}`, token, platform, deviceId); }
