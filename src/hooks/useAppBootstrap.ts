import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { clearSession, isStorageRecoveryError, loadData, loadSession, saveSession } from "../database";
import { AppData, User } from "../types";
import { isSessionTokenExpired } from "../utils/sessionToken";

type StatusMessage = { tone: "info" | "error" | "success"; message: string } | null;
type BootstrapStatus = "loading" | "ready" | "recovery-error";

export type BootstrapRecoveryInfo = {
  code: "STORAGE_RECOVERY_REQUIRED" | "BOOTSTRAP_FAILED";
  stage: "read" | "parse" | "normalize" | "bootstrap";
  snapshotExists: boolean | "unknown";
  approximateSize: number | null;
  attemptedAt: string;
};

type UseAppBootstrapParams = {
  backendTokenRef: React.MutableRefObject<string>;
  dataRef: React.MutableRefObject<AppData>;
  sessionRef: React.MutableRefObject<User | null>;
  setBackendToken: React.Dispatch<React.SetStateAction<string>>;
  setData: React.Dispatch<React.SetStateAction<AppData>>;
  setEmail: React.Dispatch<React.SetStateAction<string>>;
  setPasswordChangeStatus: React.Dispatch<React.SetStateAction<StatusMessage>>;
  setPasswordChangeVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setSession: React.Dispatch<React.SetStateAction<User | null>>;
};

export function useAppBootstrap({
  backendTokenRef,
  dataRef,
  sessionRef,
  setBackendToken,
  setData,
  setEmail,
  setPasswordChangeStatus,
  setPasswordChangeVisible,
  setSession
}: UseAppBootstrapParams) {
  const [status, setStatus] = useState<BootstrapStatus>("loading");
  const [recoveryError, setRecoveryError] = useState<BootstrapRecoveryInfo | null>(null);
  const [retrying, setRetrying] = useState(false);
  const mountedRef = useRef(false);
  const bootstrapRunningRef = useRef(false);
  const bootstrapRunIdRef = useRef(0);

  const clearRuntimeSession = useCallback(() => {
    setSession(null);
    sessionRef.current = null;
    setBackendToken("");
    backendTokenRef.current = "";
  }, [backendTokenRef, sessionRef, setBackendToken, setSession]);

  const runBootstrap = useCallback(async (isRetry = false) => {
    if (!mountedRef.current || bootstrapRunningRef.current) return;
    bootstrapRunningRef.current = true;
    const runId = ++bootstrapRunIdRef.current;
    const isCurrentRun = () => mountedRef.current && runId === bootstrapRunIdRef.current;
    if (isRetry) {
      setRetrying(true);
    } else {
      setStatus("loading");
    }
    clearRuntimeSession();

    try {
      const storedData = await loadData();
      if (!isCurrentRun()) return;
      const storedSession = await loadSession();
      if (!isCurrentRun()) return;
      setData(storedData);
      dataRef.current = storedData;
      if (storedSession?.user) {
        const storedToken = storedSession.token || "";
        if (!storedToken || isSessionTokenExpired(storedToken)) {
          if (storedToken) {
            await saveSession(storedSession.user, "", storedSession.passwordHash || "", storedSession.companyRuc || storedData.issuer.ruc);
          } else {
            await clearSession();
          }
          if (!isCurrentRun()) return;
          setEmail(storedSession.user.email);
        } else {
          setSession(storedSession.user);
          sessionRef.current = storedSession.user;
          if (storedSession.user.mustChangePassword) {
            setPasswordChangeVisible(true);
            setPasswordChangeStatus({ tone: "info", message: "Por seguridad, cree una nueva contrasena para reemplazar la clave temporal." });
          }
          setBackendToken(storedToken);
          backendTokenRef.current = storedToken;
          setEmail(storedSession.user.email);
          if (storedData.issuer.ruc && storedSession.companyRuc !== storedData.issuer.ruc) {
            void saveSession(storedSession.user, storedToken, storedSession.passwordHash || "", storedData.issuer.ruc);
          }
        }
      }
      setRecoveryError(null);
      setStatus("ready");
    } catch (error) {
      if (!isCurrentRun()) return;
      clearRuntimeSession();
      setPasswordChangeVisible(false);
      if (isStorageRecoveryError(error)) {
        setRecoveryError({
          code: error.code,
          stage: error.stage,
          snapshotExists: error.snapshotExists,
          approximateSize: error.approximateSize,
          attemptedAt: error.attemptedAt
        });
        setPasswordChangeStatus({
          tone: "error",
          message: "No se pudo cargar la informacion local. Los datos originales se conservaron. No continue facturando y contacte a soporte para recuperarlos."
        });
        if (!isRetry) {
          Alert.alert(
            "Datos locales protegidos",
            "No se pudo cargar la informacion guardada. La app conservo el almacenamiento original y bloqueo la sesion para evitar trabajar sobre datos demo. Contacte a soporte."
          );
        }
      } else {
        setRecoveryError({
          code: "BOOTSTRAP_FAILED",
          stage: "bootstrap",
          snapshotExists: "unknown",
          approximateSize: null,
          attemptedAt: new Date().toISOString()
        });
        setPasswordChangeStatus({ tone: "error", message: "No se pudo iniciar la aplicacion. Cierre la app e intente nuevamente." });
        if (!isRetry) Alert.alert("No se pudo iniciar", "Ocurrio un error inesperado al cargar la aplicacion. Cierre la app e intente nuevamente.");
      }
      setStatus("recovery-error");
    } finally {
      if (runId === bootstrapRunIdRef.current) {
        bootstrapRunningRef.current = false;
        if (mountedRef.current) setRetrying(false);
      }
    }
  }, [backendTokenRef, clearRuntimeSession, dataRef, sessionRef, setBackendToken, setData, setEmail, setPasswordChangeStatus, setPasswordChangeVisible, setSession]);

  useEffect(() => {
    mountedRef.current = true;
    void runBootstrap();

    return () => {
      mountedRef.current = false;
      bootstrapRunIdRef.current += 1;
      bootstrapRunningRef.current = false;
    };
  }, [runBootstrap]);

  const retryBootstrap = useCallback(() => runBootstrap(true), [runBootstrap]);

  return {
    ready: status === "ready",
    recoveryError,
    retryBootstrap,
    retrying,
    status
  };
}
