import { AppData } from "../types";
import { SyncState } from "./support";

type NetworkReachability = {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
};

export function hasLocalSyncWork(data: AppData, syncState: SyncState) {
  return (data.pendingSync || []).length > 0 || syncState !== "synced" || Boolean(data.autoBackupLastError);
}

export function canLoadRemoteSnapshot(data: AppData, hasPendingAutoBackup: boolean, autoBackupRunning: boolean) {
  return data.autoBackupEnabled !== false
    && Boolean(data.backendUrl)
    && (data.pendingSync || []).length === 0
    && !hasPendingAutoBackup
    && !autoBackupRunning;
}

export function shouldAutoEnableBackup({
  data,
  hasSession,
  ready
}: {
  data: AppData;
  hasSession: boolean;
  ready: boolean;
}) {
  return ready && hasSession && data.autoBackupEnabled === false && Boolean(data.backendUrl);
}

export function isNetworkReachableState(networkState: NetworkReachability) {
  return networkState.isInternetReachable === true
    || (networkState.isInternetReachable !== false && networkState.isConnected === true);
}
