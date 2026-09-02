import * as LocalAuthentication from "expo-local-authentication";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { loadBiometricLockEnabled, saveBiometricLockEnabled } from "../services/biometricLockStorage";
import { clearBiometricCredential, loadBiometricCredential } from "../services/biometricCredentialStorage";
import { registerCurrentDeviceSession } from "../services/deviceSessionCoordinator";
import { revokeDeviceSession } from "../services/backend";
import { consumeBiometricAuthentication } from "../services/biometricAuthenticationSession";
import type { User } from "../types";

const LOCK_AFTER_BACKGROUND_MS = 60_000;

type BiometricLockIdentity = {
  companyId: string;
  userId: string;
  backendUrl: string;
  companyRuc: string;
  establishmentId: string;
  token: string;
  user: User;
};

export type BiometricLockState = {
  available: boolean;
  enabled: boolean;
  locked: boolean;
  authenticating: boolean;
  loading: boolean;
  error: string;
  enable: () => Promise<boolean>;
  disable: () => Promise<void>;
  unlock: () => Promise<boolean>;
};

async function strongBiometricsAvailable(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const [hardware, enrolled, level] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.getEnrolledLevelAsync()
  ]);
  return hardware && enrolled && level === LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG;
}

async function authenticate(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Desbloquear FactuDarwin",
    promptSubtitle: "Confirme su identidad para continuar",
    promptDescription: "Sus datos de facturacion estan protegidos.",
    cancelLabel: "Cancelar",
    fallbackLabel: "Usar codigo del dispositivo",
    biometricsSecurityLevel: "strong",
    disableDeviceFallback: false
  });
  return result.success;
}

export function useBiometricLock(identity: BiometricLockIdentity | null): BiometricLockState {
  const companyId = identity?.companyId || "";
  const userId = identity?.userId || "";
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const mountedRef = useRef(true);
  const authenticationInFlightRef = useRef(false);
  const backgroundAtRef = useRef<number | null>(null);
  const identityRef = useRef(identity);

  useEffect(() => {
    identityRef.current = identity;
  }, [identity]);

  const unlock = useCallback(async () => {
    if (!identityRef.current || authenticationInFlightRef.current) return false;
    authenticationInFlightRef.current = true;
    setAuthenticating(true);
    setError("");
    try {
      const success = await authenticate();
      if (mountedRef.current && success) setLocked(false);
      if (mountedRef.current && !success) setError("No se pudo confirmar su identidad. Intente nuevamente.");
      return success;
    } catch {
      if (mountedRef.current) setError("La autenticacion biometrica no esta disponible en este momento.");
      return false;
    } finally {
      authenticationInFlightRef.current = false;
      if (mountedRef.current) setAuthenticating(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    if (!companyId || !userId || Platform.OS === "web") {
      setAvailable(false);
      setEnabled(false);
      setLocked(false);
      setLoading(false);
      return () => { active = false; };
    }
    void Promise.all([
      strongBiometricsAvailable(),
      loadBiometricLockEnabled(companyId, userId)
    ]).then(([supported, storedEnabled]) => {
      if (!active) return;
      const alreadyAuthenticated = storedEnabled && consumeBiometricAuthentication(companyId, userId);
      setAvailable(supported);
      setEnabled(storedEnabled);
      setLocked(storedEnabled && !alreadyAuthenticated);
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setAvailable(false);
      setEnabled(false);
      setLocked(false);
      setError("No se pudo comprobar la biometria del dispositivo.");
      setLoading(false);
    });
    return () => { active = false; };
  }, [companyId, userId]);

  useEffect(() => {
    if (!companyId || !userId || !enabled || Platform.OS === "web") return undefined;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        backgroundAtRef.current = Date.now();
        return;
      }
      if (state === "active" && backgroundAtRef.current !== null) {
        const elapsed = Date.now() - backgroundAtRef.current;
        backgroundAtRef.current = null;
        if (elapsed >= LOCK_AFTER_BACKGROUND_MS) setLocked(true);
      }
    });
    return () => subscription.remove();
  }, [companyId, enabled, userId]);

  const enable = useCallback(async () => {
    const current = identityRef.current;
    if (!current || !available || authenticationInFlightRef.current) return false;
    authenticationInFlightRef.current = true;
    setAuthenticating(true);
    setError("");
    try {
      const success = await authenticate();
      if (!success) {
        if (mountedRef.current) setError("No se activo el bloqueo porque no se confirmo la identidad.");
        return false;
      }
      if (!current.token) throw new Error("Inicie sesión en línea antes de activar el acceso biométrico.");
      await registerCurrentDeviceSession({
        backendUrl: current.backendUrl,
        accessToken: current.token,
        companyRuc: current.companyRuc,
        establishmentId: current.establishmentId,
        user: current.user,
        platform: Platform.OS
      });
      await saveBiometricLockEnabled(current.companyId, current.userId, true);
      if (mountedRef.current) {
        setEnabled(true);
        setLocked(false);
      }
      return true;
    } catch {
      if (mountedRef.current) setError("No se pudo activar el bloqueo biometrico.");
      return false;
    } finally {
      authenticationInFlightRef.current = false;
      if (mountedRef.current) setAuthenticating(false);
    }
  }, [available]);

  const disable = useCallback(async () => {
    const current = identityRef.current;
    if (!current) return;
    const credential = await loadBiometricCredential();
    if (credential) {
      if (!current.token) throw new Error("Inicie sesion en linea para eliminar este dispositivo.");
      await revokeDeviceSession(current.backendUrl, current.token, credential.sessionId);
    }
    await clearBiometricCredential();
    await saveBiometricLockEnabled(current.companyId, current.userId, false);
    if (mountedRef.current) {
      setEnabled(false);
      setLocked(false);
      setError("");
    }
  }, []);

  return { available, enabled, locked, authenticating, loading, error, enable, disable, unlock };
}
