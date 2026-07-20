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
import { loadSession, saveData, saveSession } from "../database";
import { AppData, PendingSyncItem, User } from "../types";
import { autoRetrySriDocuments } from "../utils/autoRetrySriDocuments";
import { autoInvoiceOfflineTickets } from "../utils/autoInvoiceTickets";
import { mergeAppDataSnapshots } from "../utils/dataMerge";
import { showMessage } from "../utils/dialogs";
import { shortText } from "../utils/format";
import { applyPendingSyncResult, clearPendingSyncItems, markPendingSyncAttempt } from "../utils/pendingSync";
import { isSessionTokenExpired } from "../utils/sessionToken";
import { sriPendingSendSummary } from "../utils/sriRetryPolicy";
import {
  canLoadRemoteSnapshot,
  hasLocalSyncWork,
  isNetworkReachableState,
  shouldAutoEnableBackup
} from "../utils/syncDecisions";
import { formatAuditDate, formatSyncStatus, SyncState } from "../utils/support";
import { sanitizeAppData } from "../validation";

type RefreshReason = "login" | "active" | "manual";
type ConnectivityReason = "network" | "active" | "pending";
type PersistOptions = {
  skipAutoBackup?: boolean;
  syncState?: SyncState;
};

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
    if (backendTokenRef.current) {
      if (!isSessionTokenExpired(backendTokenRef.current)) return backendTokenRef.current;
      backendTokenRef.current = "";
      setBackendToken("");
    }
    const storedSession = await loadSession();
    if (storedSession?.token && !isSessionTokenExpired(storedSession.token)) {
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

  const persist = useCallback(async (next: AppData, options: PersistOptions = {}) => {
    const sanitized = sanitizeAppData(next);
    setData(sanitized);
    dataRef.current = sanitized;
    setSyncState(options.syncState || (sanitized.autoBackupEnabled === false ? "synced" : "pending"));
    await saveData(sanitized);
    if (!options.skipAutoBackup) {
      scheduleAutoBackupRef.current(sanitized);
    }
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
        remaining.push(markPendingSyncAttempt(item, message));
      }
    }

    const updated = applyPendingSyncResult(snapshot, remaining);
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
      const pendingCoveredByFullBackup = (snapshot.pendingSync || []).map((item) => item.id);
      const fullBackupSnapshot = pendingCoveredByFullBackup.length
        ? clearPendingSyncItems(snapshot, pendingCoveredByFullBackup)
        : snapshot;
      let uploadSnapshot = fullBackupSnapshot;
      try {
        const remote = await restoreAppData<AppData>(fullBackupSnapshot.backendUrl, token);
        if (remote?.data) {
          uploadSnapshot = mergeAppDataSnapshots(remote.data, fullBackupSnapshot);
        }
      } catch {
        uploadSnapshot = fullBackupSnapshot;
      }
      const backupResult = await backupAppData(fullBackupSnapshot.backendUrl, uploadSnapshot, token);
      const updated = { ...fullBackupSnapshot, autoBackupLastAt: backupResult.updatedAt || new Date().toISOString(), autoBackupLastError: "" };
      setData((current) => {
        const merged = mergeAppDataSnapshots(uploadSnapshot, current);
        if (pendingCoveredByFullBackup.length) {
          const withClearedPending = clearPendingSyncItems(merged, pendingCoveredByFullBackup);
          merged.pendingSync = withClearedPending.pendingSync;
          merged.autoBackupLastError = withClearedPending.autoBackupLastError;
        }
        merged.autoBackupLastAt = updated.autoBackupLastAt;
        if (!merged.pendingSync?.length) merged.autoBackupLastError = "";
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

  const applyRemoteSnapshot = useCallback(async (snapshot: { data: AppData; updatedAt: string }, options?: { notify?: boolean }) => {
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
    if (options?.notify) {
      showMessage("Datos actualizados", `Se cargaron cambios del servidor (${formatAuditDate(snapshot.updatedAt)}).`);
    }
  }, [dataRef, setData, setSyncState]);

  const refreshFromBackend = useCallback(async (reason: RefreshReason = "manual") => {
    const current = dataRef.current;
    if (!sessionRef.current || current.autoBackupEnabled === false || !current.backendUrl) return;
    if (!canLoadRemoteSnapshot(current, Boolean(pendingAutoBackupRef.current), autoBackupRunningRef.current)) {
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

      await applyRemoteSnapshot({ data: snapshot.data, updatedAt: snapshot.updatedAt }, { notify: reason === "manual" });
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
    if (current.autoBackupEnabled !== false && current.backendUrl && hasLocalSyncWork(current, syncStateRef.current)) {
      await runAutoBackup(current);
    }
    await refreshFromBackend("manual");
  }, [dataRef, flushAutoBackup, refreshFromBackend, runAutoBackup, setAppMenuVisible, setData, syncStateRef]);

  const syncAfterConnectivityRestored = useCallback(async (reason: ConnectivityReason) => {
    const current = dataRef.current;
    if (!sessionRef.current || !current.backendUrl || current.autoBackupEnabled === false) return;
    const hasSriPendingWork = sriPendingSendSummary(current).pendingCount > 0;
    if (!hasLocalSyncWork(current, syncStateRef.current) && !pendingAutoBackupRef.current && !hasSriPendingWork) {
      if (reason === "active") await refreshFromBackend("active");
      return;
    }
    const now = Date.now();
    if (connectivitySyncRunningRef.current || now - lastConnectivitySyncRef.current < CONNECTIVITY_SYNC_THROTTLE_MS) return;

    try {
      const networkState = await Network.getNetworkStateAsync();
      if (!isNetworkReachableState(networkState)) return;
    } catch {
      return;
    }

    connectivitySyncRunningRef.current = true;
    lastConnectivitySyncRef.current = now;
    try {
      await flushAutoBackup();
      const latest = dataRef.current;
      if (latest.backendUrl && latest.autoBackupEnabled !== false && hasLocalSyncWork(latest, syncStateRef.current)) {
        await runAutoBackup(latest);
      }
      const activeUser = sessionRef.current;
      const current = dataRef.current;
      if (activeUser && current.backendUrl && current.autoBackupEnabled !== false) {
        const token = await ensureBackendToken(current.backendUrl);
        const autoInvoiceResult = await autoInvoiceOfflineTickets({ backendToken: token, data: current, user: activeUser });
        if (autoInvoiceResult.processed > 0) {
          const sanitized = sanitizeAppData(autoInvoiceResult.data);
          setData(sanitized);
          dataRef.current = sanitized;
          await saveData(sanitized);
          await runAutoBackup(sanitized);
          if (autoInvoiceResult.authorized > 0) {
            showMessage("Tickets facturados", `${autoInvoiceResult.authorized} ticket(s) offline fueron facturados automaticamente.`);
          }
        }
        const retryBaseData = dataRef.current;
        const autoRetryResult = await autoRetrySriDocuments({ backendToken: token, data: retryBaseData, user: activeUser });
        if (autoRetryResult.processed > 0 || autoRetryResult.expired > 0) {
          const sanitized = sanitizeAppData(autoRetryResult.data);
          setData(sanitized);
          dataRef.current = sanitized;
          await saveData(sanitized);
          await runAutoBackup(sanitized);
          if (autoRetryResult.expired > 0) {
            showMessage("SRI fuera de fecha", `${autoRetryResult.expired} documento(s) se marcaron como anulados por estar fuera del dia permitido.`);
          }
          if (autoRetryResult.authorized > 0) {
            showMessage("SRI actualizado", `${autoRetryResult.authorized} documento(s) fueron autorizados en reintento automatico.`);
          }
        }
      }
      if ((dataRef.current.pendingSync || []).length === 0) {
        await refreshFromBackend("active");
      }
    } finally {
      connectivitySyncRunningRef.current = false;
    }
  }, [dataRef, ensureBackendToken, flushAutoBackup, refreshFromBackend, runAutoBackup, sessionRef, setData, syncStateRef]);

  const openSyncCenter = useCallback(() => {
    setAppMenuVisible(false);
    setSyncCenterVisible(true);
  }, [setAppMenuVisible, setSyncCenterVisible]);

  const retryPendingSync = useCallback(async () => {
    setSyncActionLoading(true);
    try {
      await runManualSync();
      await syncAfterConnectivityRestored("pending");
      showMessage("Sincronizacion", formatSyncStatus(syncState, dataRef.current));
    } finally {
      setSyncActionLoading(false);
    }
  }, [dataRef, runManualSync, setSyncActionLoading, syncAfterConnectivityRestored, syncState]);

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
    if (Platform.OS !== "web" || typeof window === "undefined") return undefined;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasLocalSyncWork(dataRef.current, syncStateRef.current) && !pendingAutoBackupRef.current) return;
      event.preventDefault();
      event.returnValue = "Tiene documentos pendientes de sincronizar. Espere a que se suban antes de cerrar.";
    };

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dataRef, syncStateRef]);

  useEffect(() => {
    if (!shouldAutoEnableBackup({ data, hasSession: Boolean(session), ready })) return;
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
      if (isNetworkReachableState(networkState)) {
        void syncAfterConnectivityRestoredRef.current("network");
      }
    });

    void syncAfterConnectivityRestoredRef.current("pending");
    return () => subscription.remove();
  }, [ready, session, session?.id]);

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
