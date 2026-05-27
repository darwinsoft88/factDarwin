import * as Network from "expo-network";
import React, { useCallback, useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import {
  AUTO_BACKUP_DEBOUNCE_MS,
  CONNECTIVITY_SYNC_THROTTLE_MS,
  REMOTE_REFRESH_THROTTLE_MS,
  WEB_REMOTE_REFRESH_INTERVAL_MS
} from "../constants/app";
import { backupAppData, checkBackendHealth, loginBackend, mergeBackendData, restoreAppData } from "../services/backend";
import { hashPassword } from "../services/security";
import { loadSession, saveData, saveSession } from "../storage";
import { AppData, PendingSyncItem, User } from "../types";
import { mergeAppDataSnapshots } from "../utils/dataMerge";
import { showMessage } from "../utils/dialogs";
import { shortText } from "../utils/format";
import { formatAuditDate, formatSyncStatus, SyncState } from "../utils/support";
import { sanitizeAppData } from "../validation";

type RefreshReason = "login" | "active" | "manual";
type ConnectivityReason = "network" | "active" | "pending";

type UseSyncAndBackupParams = {
  backendTokenRef: React.MutableRefObject<string>;
  data: AppData;
  dataRef: React.MutableRefObject<AppData>;
  email: string;
  password: string;
  ready: boolean;
  session: User | null;
  sessionRef: React.MutableRefObject<User | null>;
  setAppMenuVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setBackendToken: React.Dispatch<React.SetStateAction<string>>;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  setSyncActionLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setSyncCenterVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setSyncState: React.Dispatch<React.SetStateAction<SyncState>>;
  syncState: SyncState;
  syncStateRef: React.MutableRefObject<SyncState>;
};

export function useSyncAndBackup({
  backendTokenRef,
  data,
  dataRef,
  email,
  password,
  ready,
  session,
  sessionRef,
  setAppMenuVisible,
  setBackendToken,
  setData,
  setSyncActionLoading,
  setSyncCenterVisible,
  setSyncState,
  syncState,
  syncStateRef
}: UseSyncAndBackupParams) {
  const autoBackupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoBackupRunningRef = useRef(false);
  const pendingAutoBackupRef = useRef<AppData | null>(null);
  const remoteRefreshRunningRef = useRef(false);
  const lastRemoteRefreshRef = useRef(0);
  const connectivitySyncRunningRef = useRef(false);
  const lastConnectivitySyncRef = useRef(0);
  const scheduleAutoBackupRef = useRef<(snapshot: AppData) => void>(() => undefined);
  const flushAutoBackupRef = useRef<() => Promise<void>>(async () => undefined);
  const refreshFromBackendRef = useRef<(reason?: RefreshReason) => Promise<void>>(async () => undefined);
  const syncAfterConnectivityRestoredRef = useRef<(reason: ConnectivityReason) => Promise<void>>(async () => undefined);

  const ensureBackendToken = useCallback(async (backendUrl: string) => {
    if (backendTokenRef.current) return backendTokenRef.current;
    const storedSession = await loadSession();
    if (storedSession?.token) {
      backendTokenRef.current = storedSession.token;
      setBackendToken(storedSession.token);
      return storedSession.token;
    }
    if (!password) {
      throw new Error("Para sincronizar debe iniciar sesion una vez con internet. Luego la app seguira trabajando offline con el token guardado.");
    }
    const result = await loginBackend(backendUrl, email, password, sessionRef.current?.companyId || "");
    const token = result.token || "";
    backendTokenRef.current = token;
    setBackendToken(token);
    if (sessionRef.current) {
      const passwordHash = await hashPassword(password);
      await saveSession(sessionRef.current, token, passwordHash, dataRef.current.issuer.ruc);
    }
    return token;
  }, [backendTokenRef, dataRef, email, password, sessionRef, setBackendToken]);

  const scheduleAutoBackup = useCallback((snapshot: AppData) => {
    if (!ready || snapshot.autoBackupEnabled === false || !snapshot.backendUrl) return;
    pendingAutoBackupRef.current = snapshot;
    if (autoBackupTimerRef.current) clearTimeout(autoBackupTimerRef.current);

    autoBackupTimerRef.current = setTimeout(() => {
      void flushAutoBackupRef.current();
    }, AUTO_BACKUP_DEBOUNCE_MS);
  }, [ready]);

  const persist = useCallback(async (next: AppData) => {
    const sanitized = sanitizeAppData(next);
    setData(sanitized);
    dataRef.current = sanitized;
    setSyncState(sanitized.autoBackupEnabled === false ? "synced" : "pending");
    await saveData(sanitized);
    scheduleAutoBackupRef.current(sanitized);
  }, [dataRef, setData, setSyncState]);

  const flushPendingSyncQueue = useCallback(async (backendUrl: string, token: string, snapshot: AppData) => {
    const pending = snapshot.pendingSync || [];
    if (pending.length === 0) return snapshot;

    const remaining: PendingSyncItem[] = [];
    for (const item of pending) {
      try {
        await mergeBackendData(backendUrl, item.patch, token);
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo enviar pendiente.";
        remaining.push({
          ...item,
          attempts: item.attempts + 1,
          lastError: shortText(message, 180)
        });
      }
    }

    const updated = {
      ...snapshot,
      pendingSync: remaining,
      autoBackupLastError: remaining.length ? `${remaining.length} cambio(s) pendiente(s) por sincronizar.` : ""
    };
    setData((current) => {
      const merged = { ...current, pendingSync: remaining, autoBackupLastError: updated.autoBackupLastError };
      dataRef.current = merged;
      void saveData(merged);
      return merged;
    });
    return updated;
  }, [dataRef, setData]);

  const runAutoBackupRef = useRef<(snapshot: AppData) => Promise<void>>(async () => undefined);

  const runAutoBackup = useCallback(async (snapshot: AppData) => {
    if (snapshot.autoBackupEnabled === false) return;
    if (autoBackupRunningRef.current) {
      pendingAutoBackupRef.current = snapshot;
      return;
    }
    autoBackupRunningRef.current = true;
    setSyncState("syncing");

    try {
      const token = await ensureBackendToken(snapshot.backendUrl);
      const flushed = await flushPendingSyncQueue(snapshot.backendUrl, token, snapshot);
      snapshot = flushed;
      let uploadSnapshot = snapshot;
      try {
        const remote = await restoreAppData<AppData>(snapshot.backendUrl, token);
        if (remote?.data) {
          uploadSnapshot = mergeAppDataSnapshots(remote.data, snapshot);
        }
      } catch {
        uploadSnapshot = snapshot;
      }
      const backupResult = await backupAppData(snapshot.backendUrl, uploadSnapshot, token);
      const updated = { ...snapshot, autoBackupLastAt: backupResult.updatedAt || new Date().toISOString(), autoBackupLastError: "" };
      setData((current) => {
        const merged = mergeAppDataSnapshots(uploadSnapshot, current);
        merged.autoBackupLastAt = updated.autoBackupLastAt;
        merged.autoBackupLastError = "";
        dataRef.current = merged;
        void saveData(merged);
        return merged;
      });
      setSyncState("synced");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo ejecutar el respaldo automatico.";
      const updated = { ...snapshot, autoBackupLastError: shortText(message, 180) };
      setData((current) => {
        const merged = { ...current, autoBackupLastError: updated.autoBackupLastError };
        void saveData(merged);
        return merged;
      });
      setSyncState("error");
    } finally {
      autoBackupRunningRef.current = false;
      const pending = pendingAutoBackupRef.current;
      if (pending) {
        pendingAutoBackupRef.current = null;
        void runAutoBackupRef.current(pending);
      }
    }
  }, [dataRef, ensureBackendToken, flushPendingSyncQueue, setData, setSyncState]);

  useEffect(() => {
    runAutoBackupRef.current = runAutoBackup;
  }, [runAutoBackup]);

  const flushAutoBackup = useCallback(async () => {
    if (autoBackupTimerRef.current) {
      clearTimeout(autoBackupTimerRef.current);
      autoBackupTimerRef.current = null;
    }

    const snapshot = pendingAutoBackupRef.current;
    if (!snapshot) return;
    pendingAutoBackupRef.current = null;
    await runAutoBackup(snapshot);
  }, [runAutoBackup]);

  const applyRemoteSnapshot = useCallback(async (snapshot: { data: AppData; updatedAt: string }, reason: string) => {
    const current = dataRef.current;
    const mergedSnapshot = mergeAppDataSnapshots(snapshot.data, current);
    const restored = sanitizeAppData({
      ...mergedSnapshot,
      backendUrl: current.backendUrl,
      autoBackupEnabled: current.autoBackupEnabled,
      autoBackupLastAt: snapshot.updatedAt,
      autoBackupLastError: ""
    });
    setData(restored);
    dataRef.current = restored;
    setSyncState("synced");
    await saveData(restored);
    if (reason !== "login") {
      showMessage("Datos actualizados", `Se cargaron cambios del servidor (${formatAuditDate(snapshot.updatedAt)}).`);
    }
  }, [dataRef, setData, setSyncState]);

  const refreshFromBackend = useCallback(async (reason: RefreshReason = "manual") => {
    const current = dataRef.current;
    if (!sessionRef.current || current.autoBackupEnabled === false || !current.backendUrl) return;
    if ((current.pendingSync || []).length > 0 || pendingAutoBackupRef.current || autoBackupRunningRef.current) {
      if (reason === "manual") showMessage("Sincronizacion pendiente", "Primero se debe terminar de subir el cambio local antes de cargar datos del servidor.");
      return;
    }
    if (remoteRefreshRunningRef.current) return;

    const now = Date.now();
    if (reason !== "manual" && now - lastRemoteRefreshRef.current < REMOTE_REFRESH_THROTTLE_MS) return;
    remoteRefreshRunningRef.current = true;
    lastRemoteRefreshRef.current = now;

    try {
      const token = await ensureBackendToken(current.backendUrl);
      const snapshot = await restoreAppData<AppData>(current.backendUrl, token);
      if (!snapshot?.data) return;

      const remoteUpdatedAt = new Date(snapshot.updatedAt).getTime();
      const localSyncedAt = current.autoBackupLastAt ? new Date(current.autoBackupLastAt).getTime() : 0;
      if (!Number.isFinite(remoteUpdatedAt) || remoteUpdatedAt <= localSyncedAt + 1000) {
        if (reason === "manual") showMessage("Datos al dia", "Este dispositivo ya tiene la ultima copia del servidor.");
        return;
      }

      await applyRemoteSnapshot({ data: snapshot.data, updatedAt: snapshot.updatedAt }, reason);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo actualizar desde el servidor.";
      setData((latest) => {
        const merged = { ...latest, autoBackupLastError: shortText(`Actualizacion servidor: ${message}`, 180) };
        dataRef.current = merged;
        void saveData(merged);
        return merged;
      });
      setSyncState("error");
    } finally {
      remoteRefreshRunningRef.current = false;
    }
  }, [applyRemoteSnapshot, dataRef, ensureBackendToken, sessionRef, setData, setSyncState]);

  const runManualSync = useCallback(async () => {
    setAppMenuVisible(false);
    if (dataRef.current.autoBackupEnabled === false || !dataRef.current.backendUrl) {
      const enabled = sanitizeAppData({ ...dataRef.current, autoBackupEnabled: true, autoBackupLastError: "" });
      setData(enabled);
      dataRef.current = enabled;
      await saveData(enabled);
    }
    await flushAutoBackup();
    const current = dataRef.current;
    if (current.autoBackupEnabled !== false && current.backendUrl && ((current.pendingSync || []).length > 0 || syncStateRef.current !== "synced" || Boolean(current.autoBackupLastError))) {
      await runAutoBackup(current);
    }
    await refreshFromBackend("manual");
  }, [dataRef, flushAutoBackup, refreshFromBackend, runAutoBackup, setAppMenuVisible, setData, syncStateRef]);

  const hasReachableInternet = useCallback((networkState: Network.NetworkState) =>
    networkState.isInternetReachable === true || (networkState.isInternetReachable !== false && networkState.isConnected === true), []);

  const syncAfterConnectivityRestored = useCallback(async (reason: ConnectivityReason) => {
    const current = dataRef.current;
    if (!sessionRef.current || !current.backendUrl || current.autoBackupEnabled === false) return;
    if ((current.pendingSync || []).length === 0 && !pendingAutoBackupRef.current && syncStateRef.current === "synced" && !current.autoBackupLastError) {
      if (reason === "active") await refreshFromBackend("active");
      return;
    }
    const now = Date.now();
    if (connectivitySyncRunningRef.current || now - lastConnectivitySyncRef.current < CONNECTIVITY_SYNC_THROTTLE_MS) return;

    try {
      const networkState = await Network.getNetworkStateAsync();
      if (!hasReachableInternet(networkState)) return;
    } catch {
      return;
    }

    connectivitySyncRunningRef.current = true;
    lastConnectivitySyncRef.current = now;
    try {
      await flushAutoBackup();
      const latest = dataRef.current;
      if (latest.backendUrl && latest.autoBackupEnabled !== false && ((latest.pendingSync || []).length > 0 || syncStateRef.current !== "synced" || Boolean(latest.autoBackupLastError))) {
        await runAutoBackup(latest);
      }
      if ((dataRef.current.pendingSync || []).length === 0) {
        await refreshFromBackend("active");
      }
    } finally {
      connectivitySyncRunningRef.current = false;
    }
  }, [dataRef, flushAutoBackup, hasReachableInternet, refreshFromBackend, runAutoBackup, sessionRef, syncStateRef]);

  const openSyncCenter = useCallback(() => {
    setAppMenuVisible(false);
    setSyncCenterVisible(true);
  }, [setAppMenuVisible, setSyncCenterVisible]);

  const retryPendingSync = useCallback(async () => {
    setSyncActionLoading(true);
    try {
      await runManualSync();
      showMessage("Sincronizacion", formatSyncStatus(syncState, dataRef.current));
    } finally {
      setSyncActionLoading(false);
    }
  }, [dataRef, runManualSync, setSyncActionLoading, syncState]);

  const testSyncServer = useCallback(async () => {
    setSyncActionLoading(true);
    try {
      const health = await checkBackendHealth(dataRef.current.backendUrl);
      showMessage("Servidor OK", `Backend responde: ${health.ok ? "SI" : "NO"}\nServicio: ${health.service || "FactuDarwin"}\nBase: ${health.database?.engine || "desconocida"}`);
    } catch (error) {
      showMessage("Servidor no disponible", error instanceof Error ? error.message : "No se pudo probar el servidor.");
    } finally {
      setSyncActionLoading(false);
    }
  }, [dataRef, setSyncActionLoading]);

  useEffect(() => {
    scheduleAutoBackupRef.current = scheduleAutoBackup;
  }, [scheduleAutoBackup]);

  useEffect(() => {
    flushAutoBackupRef.current = flushAutoBackup;
  }, [flushAutoBackup]);

  useEffect(() => {
    refreshFromBackendRef.current = refreshFromBackend;
  }, [refreshFromBackend]);

  useEffect(() => {
    syncAfterConnectivityRestoredRef.current = syncAfterConnectivityRestored;
  }, [syncAfterConnectivityRestored]);

  useEffect(() => {
    return () => {
      if (autoBackupTimerRef.current) clearTimeout(autoBackupTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return undefined;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void syncAfterConnectivityRestoredRef.current("active");
      } else {
        void flushAutoBackupRef.current();
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || typeof document === "undefined") return undefined;

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void refreshFromBackendRef.current("active");
    };
    const timer = window.setInterval(refreshIfVisible, WEB_REMOTE_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refreshIfVisible);
    window.addEventListener("online", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshIfVisible);
      window.removeEventListener("online", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, []);

  useEffect(() => {
    if (!ready || !session || data.autoBackupEnabled !== false || !data.backendUrl) return;
    const enabled = sanitizeAppData({ ...data, autoBackupEnabled: true, autoBackupLastError: "" });
    setData(enabled);
    dataRef.current = enabled;
    setSyncState("pending");
    void saveData(enabled);
    scheduleAutoBackupRef.current(enabled);
  }, [data, dataRef, ready, session, setData, setSyncState]);

  useEffect(() => {
    if (!ready || !session) return undefined;
    const subscription = Network.addNetworkStateListener((networkState) => {
      if (hasReachableInternet(networkState)) {
        void syncAfterConnectivityRestoredRef.current("network");
      }
    });

    void syncAfterConnectivityRestoredRef.current("pending");
    return () => subscription.remove();
  }, [hasReachableInternet, ready, session, session?.id]);

  return {
    ensureBackendToken,
    openSyncCenter,
    persist,
    refreshFromBackend,
    retryPendingSync,
    runManualSync,
    testSyncServer
  };
}
