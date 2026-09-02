import * as Network from "expo-network";
import React, { useCallback, useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import {
  AUTO_BACKUP_DEBOUNCE_MS,
  CONNECTIVITY_SYNC_THROTTLE_MS,
  REMOTE_REFRESH_THROTTLE_MS,
  WEB_REMOTE_REFRESH_INTERVAL_MS,
  WEB_SRI_AUTHORIZATION_QUERY_THROTTLE_MS
} from "../constants/app";
import {
  backupAppData,
  checkBackendHealth,
  getRemoteSnapshotMetadata,
  loginBackend,
  mergeBackendData,
  restoreAppData
} from "../services/backend";

import { hashPassword } from "../services/security";
import { loadSession, saveData, saveSession } from "../database";
import { migrateStoredPendingSyncRequestIds, updateStoredData } from "../database/storage";
import type { AppDataMutation } from "../database/storage";
import { AppData, PendingSyncItem, PendingSyncPatch, User } from "../types";
import { autoRetrySriDocuments } from "../utils/autoRetrySriDocuments";
import { autoInvoiceOfflineTickets } from "../utils/autoInvoiceTickets";
import { mergeAppDataSnapshots } from "../utils/dataMerge";
import { showInfo, showSuccess, showError, showWarning } from "../utils/dialogs";
import { shortText } from "../utils/format";
import { applyPendingSyncResult, clearPendingSyncItems, markPendingSyncAttempt, normalizeSyncRequestId, sortPendingSyncFifo } from "../utils/pendingSync";
import { isSessionTokenExpired } from "../utils/sessionToken";
import { isSriAuthorizationQueryDocument, sriPendingSendSummary } from "../utils/sriRetryPolicy";
import {
  canLoadRemoteSnapshot,
  hasLocalSyncWork,
  isNetworkReachableState,
  shouldAutoEnableBackup
} from "../utils/syncDecisions";
import { formatAuditDate, formatSyncStatus, SyncState } from "../utils/support";
import { sanitizeAppData } from "../validation";
import { getIncrementalDeviceId } from "../services/incrementalDeviceIdentity";
import { localIncrementalPilotEnabled, runIncrementalCatalogPilot } from "../services/incrementalCatalogSync";
import { markIncrementalCursorInactive } from "../services/incrementalCursorStorage";
import { refreshRegisteredDeviceSession } from "../services/deviceSessionCoordinator";

type RefreshReason = "login" | "active" | "manual" | "silent";
type ConnectivityReason = "network" | "active" | "pending";
export type PersistOptions = {
  skipAutoBackup?: boolean;
  syncState?: SyncState;
};

export type PersistMutation = (
  mutation: AppDataMutation,
  options?: PersistOptions
) => Promise<AppData>;

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
  setNetworkReachable: React.Dispatch<React.SetStateAction<boolean | null>>;
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
  setNetworkReachable,
  syncStateRef
}: UseSyncAndBackupParams) {
  const autoBackupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoBackupRunningRef = useRef(false);
  const pendingAutoBackupRef = useRef<AppData | null>(null);
  const remoteRefreshRunningRef = useRef(false);
  const lastRemoteRefreshRef = useRef(0);
  const connectivitySyncRunningRef = useRef(false);
  const lastConnectivitySyncRef = useRef(0);
  const sriAuthorizationQueryRunningRef = useRef(false);
  const lastSriAuthorizationQueryRef = useRef(0);
  const scheduleAutoBackupRef = useRef<(snapshot: AppData) => void>(() => undefined);
  const flushAutoBackupRef = useRef<() => Promise<boolean>>(async () => true);
  const refreshFromBackendRef = useRef<(reason?: RefreshReason) => Promise<void>>(async () => undefined);
  const syncAfterConnectivityRestoredRef = useRef<(reason: ConnectivityReason) => Promise<void>>(async () => undefined);
  const querySentSriAuthorizationsRef = useRef<() => Promise<void>>(async () => undefined);

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
    if (Platform.OS !== "web") {
      try {
        const renewed = await refreshRegisteredDeviceSession();
        backendTokenRef.current = renewed.token;
        setBackendToken(renewed.token);
        if (sessionRef.current) await saveSession(sessionRef.current, renewed.token, "", dataRef.current.issuer.ruc);
        return renewed.token;
      } catch (error) {
        if (!password) throw error;
      }
    }
    if (!password) {
      throw new Error("Para sincronizar debe iniciar sesion una vez con internet. Luego la app seguira trabajando offline con el token guardado.");
    }
    const deviceId = await getIncrementalDeviceId();
    const result = await loginBackend(backendUrl, email, password, "", sessionRef.current?.companyId || "", { deviceId, deviceLabel: Platform.OS, platform: Platform.OS });
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

  const persistMutation = useCallback<PersistMutation>(async (mutation, options = {}) => {
    const persisted = await updateStoredData(mutation);

    dataRef.current = persisted;
    setData(persisted);
    setSyncState(
      options.syncState ??
      (persisted.autoBackupEnabled === false ? "synced" : "pending")
    );

    if (!options.skipAutoBackup) {
      scheduleAutoBackupRef.current(persisted);
    } else if (options.syncState === "synced") {
      // El servidor acaba de confirmar el parche. Evita que un evento
      // automÃ¡tico de foco/visibilidad descargue inmediatamente el snapshot
      // completo; la sincronizaciÃ³n manual continÃºa forzando la revisiÃ³n.
      lastRemoteRefreshRef.current = Date.now();
    }

    return persisted;
  }, [dataRef, setData, setSyncState]);

  const flushPendingSyncQueue = useCallback(async (backendUrl: string, token: string, snapshot: AppData) => {
    const requiresMigration = (snapshot.pendingSync || []).some((item) => !normalizeSyncRequestId((item.patch as PendingSyncPatch)?.requestId));
    const durableSnapshot = requiresMigration ? await migrateStoredPendingSyncRequestIds() : snapshot;
    const pending = sortPendingSyncFifo(durableSnapshot.pendingSync || []);
    if (pending.length === 0) return durableSnapshot;

    const remaining: PendingSyncItem[] = [];
    for (const item of pending) {
      try {
        await mergeBackendData(backendUrl, item.patch, token);
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo enviar pendiente.";
        remaining.push(markPendingSyncAttempt(item, message));
      }
    }

    const batchIds = new Set(pending.map((item) => item.id));
    const failedById = new Map(remaining.map((item) => [item.id, item]));
    const applyBatchResult = (current: AppData) => {
      const nextPending = (current.pendingSync || []).flatMap((item) => {
        if (!batchIds.has(item.id)) return [item];
        const failed = failedById.get(item.id);
        return failed ? [failed] : [];
      });
      for (const failed of remaining) {
        if (!nextPending.some((item) => item.id === failed.id)) nextPending.push(failed);
      }
      return applyPendingSyncResult(current, sortPendingSyncFifo(nextPending));
    };

    const updated = await updateStoredData(applyBatchResult);
    dataRef.current = updated;
    setData(updated);
    return updated;
  }, [dataRef, setData]);

  const runAutoBackupRef = useRef<(snapshot: AppData) => Promise<boolean>>(async () => true);

  const runAutoBackup = useCallback(async (snapshot: AppData) => {
    if (snapshot.autoBackupEnabled === false) return true;
    if (autoBackupRunningRef.current) {
      pendingAutoBackupRef.current = snapshot;
      return false;
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
      const backupUpdatedAt = backupResult.updatedAt || new Date().toISOString();
      const persisted = await updateStoredData((current) => {
        const merged = mergeAppDataSnapshots(uploadSnapshot, current);
        if (pendingCoveredByFullBackup.length) {
          const withClearedPending = clearPendingSyncItems(merged, pendingCoveredByFullBackup);
          merged.pendingSync = withClearedPending.pendingSync;
          merged.autoBackupLastError = withClearedPending.autoBackupLastError;
        }
        merged.autoBackupLastAt = backupUpdatedAt;
        if (!merged.pendingSync?.length) merged.autoBackupLastError = "";
        return merged;
      });
      dataRef.current = persisted;
      setData(persisted);
      setSyncState("synced");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo ejecutar el respaldo automatico.";
      const persisted = await updateStoredData((current) => ({
        ...current,
        autoBackupLastError: shortText(message, 180)
      }));
      dataRef.current = persisted;
      setData(persisted);
      setSyncState("error");
      return false;
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
    if (!snapshot) return true;
    pendingAutoBackupRef.current = null;
    return runAutoBackup(snapshot);
  }, [runAutoBackup]);

  const applyRemoteSnapshot = useCallback(async (snapshot: { data: AppData; updatedAt: string }, options?: { notify?: boolean }) => {
    const restored = await updateStoredData((current) => sanitizeAppData({
      ...mergeAppDataSnapshots(snapshot.data, current),
      backendUrl: current.backendUrl,
      autoBackupEnabled: current.autoBackupEnabled,
      autoBackupLastAt: snapshot.updatedAt,
      autoBackupLastError: ""
    }));
    dataRef.current = restored;
    setData(restored);
    setSyncState("synced");
    if (options?.notify) {
      showSuccess("Datos actualizados", `Se cargaron cambios del servidor (${formatAuditDate(snapshot.updatedAt)}).`);
    }
  }, [dataRef, setData, setSyncState]);

  const clearResolvedSyncError = useCallback(async () => {
    if (!dataRef.current.autoBackupLastError) {
      setSyncState("synced");
      return dataRef.current;
    }
    const persisted = await updateStoredData((current) => ({
      ...current,
      autoBackupLastError: ""
    }));
    dataRef.current = persisted;
    setData(persisted);
    setSyncState("synced");
    return persisted;
  }, [dataRef, setData, setSyncState]);

  const refreshFromBackend = useCallback(async (reason: RefreshReason = "manual") => {
    const current = dataRef.current;

    if (
      !sessionRef.current ||
      current.autoBackupEnabled === false ||
      !current.backendUrl
    ) {
      return;
    }

    if (
      !canLoadRemoteSnapshot(
        current,
        Boolean(pendingAutoBackupRef.current),
        autoBackupRunningRef.current
      )
    ) {
      if (reason === "manual") {
        showWarning(
          "Sincronización pendiente",
          "Primero se debe terminar de subir el cambio local antes de cargar datos del servidor."
        );
      }
      return;
    }

    if (remoteRefreshRunningRef.current) return;

    const now = Date.now();

    if (
      reason !== "manual" &&
      now - lastRemoteRefreshRef.current < REMOTE_REFRESH_THROTTLE_MS
    ) {
      return;
    }

    remoteRefreshRunningRef.current = true;
    lastRemoteRefreshRef.current = now;

    try {
      const token = await ensureBackendToken(current.backendUrl);

      if (localIncrementalPilotEnabled() && sessionRef.current?.companyId) {
        try {
          const incremental = await runIncrementalCatalogPilot({ data: current, token, companyId: sessionRef.current.companyId });
          if (incremental.data) {
            dataRef.current = incremental.data;
            setData(incremental.data);
            setSyncState("synced");
          }
          if (incremental.status === "applied" || incremental.status === "bootstrapped") {
            await clearResolvedSyncError();
            if (reason === "manual") showSuccess("Catálogos actualizados", `${incremental.applied} cambio(s) incremental(es) aplicado(s).`);
            return;
          }
        } catch (incrementalError) {
          await markIncrementalCursorInactive(sessionRef.current.companyId);
          // eslint-disable-next-line no-console
          console.warn(JSON.stringify({ event: "sync_incremental_snapshot_fallback", code: incrementalError instanceof Error ? incrementalError.message : "UNKNOWN" }));
        }
      }

      // Primero consultamos únicamente la fecha del snapshot.
      const metadata = await getRemoteSnapshotMetadata(
        current.backendUrl,
        token
      );

      if (!metadata.updatedAt) {
        await clearResolvedSyncError();
        if (reason === "manual") {
          showInfo(
            "Sin copia remota",
            "El servidor todavía no tiene una copia de datos para esta empresa."
          );
        }
        return;
      }

      const remoteUpdatedAt = new Date(metadata.updatedAt).getTime();
      const localSyncedAt = current.autoBackupLastAt
        ? new Date(current.autoBackupLastAt).getTime()
        : 0;

      if (
        !Number.isFinite(remoteUpdatedAt) ||
        remoteUpdatedAt <= localSyncedAt + 1000
      ) {
        await clearResolvedSyncError();
        if (reason === "manual") {
          showSuccess(
            "Datos al día",
            "Este dispositivo ya tiene la última copia del servidor."
          );
        }
        return;
      }

      // Solo descargamos los 250 KB cuando realmente hubo cambios.
      const snapshot = await restoreAppData<AppData>(
        current.backendUrl,
        token
      );

      if (!snapshot?.data) {
        await clearResolvedSyncError();
        return;
      }

      await applyRemoteSnapshot(
        {
          data: snapshot.data,
          updatedAt: snapshot.updatedAt
        },
        {
          notify: reason === "manual"
        }
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo actualizar desde el servidor.";

      const persisted = await updateStoredData((stored) => ({
        ...stored,
        autoBackupLastError: shortText(
          `Actualización servidor: ${message}`,
          180
        )
      }));

      dataRef.current = persisted;
      setData(persisted);
      setSyncState("error");
    } finally {
      remoteRefreshRunningRef.current = false;
    }
  }, [
    applyRemoteSnapshot,
    clearResolvedSyncError,
    dataRef,
    ensureBackendToken,
    sessionRef,
    setData,
    setSyncState
  ]);

  const runManualSync = useCallback(async (refreshReason: RefreshReason = "manual") => {
    setAppMenuVisible(false);
    if (dataRef.current.autoBackupEnabled === false || !dataRef.current.backendUrl) {
      const enabled = await updateStoredData((current) => sanitizeAppData({
        ...current,
        autoBackupEnabled: true,
        autoBackupLastError: ""
      }));
      dataRef.current = enabled;
      setData(enabled);
    }
    const flushed = await flushAutoBackup();
    if (!flushed) return;
    const current = dataRef.current;
    if (current.autoBackupEnabled !== false && current.backendUrl && hasLocalSyncWork(current, syncStateRef.current)) {
      const uploaded = await runAutoBackup(current);
      if (!uploaded) return;
    }
    await refreshFromBackend(refreshReason);
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
        const autoInvoiceResult = await autoInvoiceOfflineTickets({
          backendToken: token,
          initialData: current,
          getCurrentData: () => dataRef.current,
          persistMutation,
          user: activeUser
        });
        if (autoInvoiceResult.processed > 0) {
          await runAutoBackup(dataRef.current);
          if (autoInvoiceResult.authorized > 0) {
            showSuccess("Tickets facturados", `${autoInvoiceResult.authorized} ticket(s) offline fueron facturados automaticamente.`);
          }
        }
        const retryBaseData = dataRef.current;
        const autoRetryResult = await autoRetrySriDocuments({
          backendToken: token,
          initialData: retryBaseData,
          getCurrentData: () => dataRef.current,
          persistMutation,
          user: activeUser
        });
        if (autoRetryResult.processed > 0 || autoRetryResult.expired > 0) {
          await runAutoBackup(dataRef.current);
          if (autoRetryResult.expired > 0) {
            showWarning("SRI fuera de fecha", `${autoRetryResult.expired} documento(s) se marcaron como anulados por estar fuera del dia permitido.`);
          }
          if (reason !== "active" && autoRetryResult.authorized > 0) {
            showSuccess(
              "SRI actualizado",
              `${autoRetryResult.authorized} documento(s) fueron autorizados en reintento automatico.`
            );
          }
        }
      }
      if ((dataRef.current.pendingSync || []).length === 0 && !dataRef.current.autoBackupLastError) {
        await refreshFromBackend("active");
      }
    } finally {
      connectivitySyncRunningRef.current = false;
    }
  }, [dataRef, ensureBackendToken, flushAutoBackup, persistMutation, refreshFromBackend, runAutoBackup, sessionRef, syncStateRef]);

  const querySentSriAuthorizations = useCallback(async () => {
    const current = dataRef.current;
    const activeUser = sessionRef.current;
    if (!activeUser || !current.backendUrl || current.autoBackupEnabled === false) return;
    if (!current.sales.some(isSriAuthorizationQueryDocument)) return;
    const now = Date.now();
    if (sriAuthorizationQueryRunningRef.current || now - lastSriAuthorizationQueryRef.current < WEB_SRI_AUTHORIZATION_QUERY_THROTTLE_MS) return;

    sriAuthorizationQueryRunningRef.current = true;
    lastSriAuthorizationQueryRef.current = now;
    try {
      const token = await ensureBackendToken(current.backendUrl);
      const result = await autoRetrySriDocuments({
        backendToken: token,
        initialData: dataRef.current,
        getCurrentData: () => dataRef.current,
        maxDocuments: 3,
        persistMutation,
        user: activeUser,
        authorizationQueriesOnly: true
      });
      if (result.processed > 0) await runAutoBackup(dataRef.current);
    } finally {
      sriAuthorizationQueryRunningRef.current = false;
    }
  }, [dataRef, ensureBackendToken, persistMutation, runAutoBackup, sessionRef]);

  useEffect(() => {
    querySentSriAuthorizationsRef.current = querySentSriAuthorizations;
  }, [querySentSriAuthorizations]);

  const openSyncCenter = useCallback(() => {
    setAppMenuVisible(false);
    setSyncCenterVisible(true);
  }, [setAppMenuVisible, setSyncCenterVisible]);

  const retryPendingSync = useCallback(async () => {
    setSyncActionLoading(true);
    try {
      await runManualSync("silent");
      await syncAfterConnectivityRestored("pending");
      const finalData = dataRef.current;
      const sriPending = sriPendingSendSummary(finalData).pendingCount;
      if ((finalData.pendingSync || []).length > 0) {
        showWarning("Sincronizacion pendiente", formatSyncStatus("pending", finalData));
      } else if (finalData.autoBackupLastError) {
        showError("No se pudo sincronizar", formatSyncStatus("error", finalData));
      } else if (sriPending > 0) {
        showWarning("SRI pendiente", `${sriPending} documento(s) siguen sin autorizacion definitiva del SRI.`);
      } else {
        showSuccess("Datos al dia", formatSyncStatus("synced", finalData));
      }
    } finally {
      setSyncActionLoading(false);
    }
  }, [dataRef, runManualSync, setSyncActionLoading, syncAfterConnectivityRestored]);

  const testSyncServer = useCallback(async () => {
    setSyncActionLoading(true);
    try {
      const health = await checkBackendHealth(dataRef.current.backendUrl);
      await clearResolvedSyncError();
      showSuccess("Servidor OK", `Backend responde: ${health.ok ? "SI" : "NO"}\nServicio: ${health.service || "FactuDarwin"}\nBase: ${health.database?.engine || "desconocida"}`);
    } catch (error) {
      showError("Servidor no disponible", error instanceof Error ? error.message : "No se pudo probar el servidor.");
    } finally {
      setSyncActionLoading(false);
    }
  }, [clearResolvedSyncError, dataRef, setSyncActionLoading]);

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
      if (document.visibilityState !== "visible") return;
      void refreshFromBackendRef.current("active");
      void querySentSriAuthorizationsRef.current();
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
    setSyncState("pending");
    void updateStoredData((current) => sanitizeAppData({
      ...current,
      autoBackupEnabled: true,
      autoBackupLastError: ""
    })).then((enabled) => {
      dataRef.current = enabled;
      setData(enabled);
      scheduleAutoBackupRef.current(enabled);
    }).catch(() => {
      setSyncState("error");
    });
  }, [data, dataRef, ready, session, setData, setSyncState]);

  useEffect(() => {
    if (!ready || !session) return undefined;
    const subscription = Network.addNetworkStateListener((networkState) => {
      const reachable = isNetworkReachableState(networkState);
      setNetworkReachable(reachable);
      if (reachable) {
        void syncAfterConnectivityRestoredRef.current("network");
      }
    });

    void Network.getNetworkStateAsync()
      .then((networkState) => setNetworkReachable(isNetworkReachableState(networkState)))
      .catch(() => setNetworkReachable(null));
    void syncAfterConnectivityRestoredRef.current("pending");
    return () => subscription.remove();
  }, [ready, session, session?.id, setNetworkReachable]);

  return {
    ensureBackendToken,
    openSyncCenter,
    persist,
    persistMutation,
    refreshFromBackend,
    retryPendingSync,
    runManualSync,
    testSyncServer
  };
}
