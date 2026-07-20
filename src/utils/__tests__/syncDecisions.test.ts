import {
  canLoadRemoteSnapshot,
  hasLocalSyncWork,
  isNetworkReachableState,
  shouldAutoEnableBackup
} from "../syncDecisions";
import { AppData } from "../../types";

const baseData = {
  autoBackupEnabled: true,
  autoBackupLastError: "",
  backendUrl: "https://api.factudarwin.com",
  pendingSync: []
} as unknown as AppData;

describe("syncDecisions", () => {
  it("detecta trabajo local pendiente por cola, estado o error", () => {
    expect(hasLocalSyncWork(baseData, "synced")).toBe(false);
    expect(hasLocalSyncWork({ ...baseData, pendingSync: [{ id: "1" }] } as unknown as AppData, "synced")).toBe(true);
    expect(hasLocalSyncWork(baseData, "pending")).toBe(true);
    expect(hasLocalSyncWork({ ...baseData, autoBackupLastError: "fallo" }, "synced")).toBe(true);
  });

  it("solo permite cargar snapshot remoto cuando no hay cambios locales en camino", () => {
    expect(canLoadRemoteSnapshot(baseData, false, false)).toBe(true);
    expect(canLoadRemoteSnapshot({ ...baseData, autoBackupEnabled: false }, false, false)).toBe(false);
    expect(canLoadRemoteSnapshot({ ...baseData, backendUrl: "" }, false, false)).toBe(false);
    expect(canLoadRemoteSnapshot({ ...baseData, pendingSync: [{ id: "1" }] } as unknown as AppData, false, false)).toBe(false);
    expect(canLoadRemoteSnapshot(baseData, true, false)).toBe(false);
    expect(canLoadRemoteSnapshot(baseData, false, true)).toBe(false);
  });

  it("activa respaldo automatico solo cuando hay sesion y backend configurado", () => {
    expect(shouldAutoEnableBackup({ data: { ...baseData, autoBackupEnabled: false }, hasSession: true, ready: true })).toBe(true);
    expect(shouldAutoEnableBackup({ data: { ...baseData, autoBackupEnabled: false }, hasSession: false, ready: true })).toBe(false);
    expect(shouldAutoEnableBackup({ data: { ...baseData, autoBackupEnabled: false }, hasSession: true, ready: false })).toBe(false);
    expect(shouldAutoEnableBackup({ data: { ...baseData, autoBackupEnabled: true }, hasSession: true, ready: true })).toBe(false);
  });

  it("interpreta conectividad real sin bloquear estados indeterminados", () => {
    expect(isNetworkReachableState({ isInternetReachable: true, isConnected: false })).toBe(true);
    expect(isNetworkReachableState({ isInternetReachable: null, isConnected: true })).toBe(true);
    expect(isNetworkReachableState({ isInternetReachable: false, isConnected: true })).toBe(false);
    expect(isNetworkReachableState({ isInternetReachable: null, isConnected: false })).toBe(false);
  });
});
