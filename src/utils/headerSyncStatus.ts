import { SyncState } from "./support";

export type HeaderSyncStatus =
  | "synced"
  | "syncing"
  | "offline"
  | "error"
  | "pending";

export function resolveHeaderSyncStatus({
  hasSyncError,
  networkReachable,
  pendingCount,
  sriPendingCount,
  syncState
}: {
  hasSyncError: boolean;
  networkReachable: boolean | null;
  pendingCount: number;
  sriPendingCount: number;
  syncState: SyncState;
}): HeaderSyncStatus {
  if (networkReachable === false) return "offline";

  if (hasSyncError || syncState === "error") return "error";

  if (syncState === "syncing") return "syncing";

  if (
    pendingCount > 0 ||
    sriPendingCount > 0 ||
    syncState === "pending"
  ) {
    return "pending";
  }

  return "synced";
}