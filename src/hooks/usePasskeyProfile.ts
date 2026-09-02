import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { getPasskeyCapabilities, getPasskeyStatus, registerPasskey, revokePasskeys } from "../services/backend";
import { clearPasskeyAccountHint, savePasskeyAccountHint } from "../services/passkeyHintStorage";
import type { User } from "../types";

type PasskeyIdentity = {
  companyId: string;
  userId: string;
  backendUrl: string;
  companyRuc: string;
  establishmentId: string;
  token: string;
  user: User;
};

export function usePasskeyProfile(identity: PasskeyIdentity | null) {
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(Platform.OS === "web" && Boolean(identity));
  const [error, setError] = useState("");
  const mountedRef = useRef(true);
  const runningRef = useRef(false);
  const identityRef = useRef(identity);
  identityRef.current = identity;

  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    let active = true;
    if (Platform.OS !== "web" || !identity?.token) {
      setAvailable(false);
      setEnabled(false);
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    setError("");
    void Promise.all([
      getPasskeyCapabilities(identity.backendUrl),
      getPasskeyStatus(identity.backendUrl, identity.token)
    ]).then(([capabilities, status]) => {
      if (!active) return;
      setAvailable(capabilities.enabled && typeof window !== "undefined" && window.isSecureContext && "PublicKeyCredential" in window);
      setEnabled(status.enabled === true);
    }).catch((cause) => {
      if (!active) return;
      setAvailable(false);
      setEnabled(false);
      setError(cause instanceof Error ? cause.message : "Face ID para PWA no esta disponible.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [identity?.backendUrl, identity?.companyId, identity?.token, identity?.userId]);

  const enable = useCallback(async () => {
    const current = identityRef.current;
    if (!current || !available || runningRef.current) return false;
    runningRef.current = true;
    setLoading(true);
    setError("");
    try {
      await registerPasskey(current.backendUrl, current.token);
      await savePasskeyAccountHint({
        companyId: current.companyId,
        userId: current.userId,
        email: current.user.email,
        displayName: current.user.name,
        backendUrl: current.backendUrl,
        companyRuc: current.companyRuc,
        establishmentId: current.establishmentId
      });
      if (mountedRef.current) setEnabled(true);
      return true;
    } catch (cause) {
      if (mountedRef.current) setError(cause instanceof Error ? cause.message : "No se pudo activar Face ID para PWA.");
      return false;
    } finally {
      runningRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, [available]);

  const disable = useCallback(async () => {
    const current = identityRef.current;
    if (!current || runningRef.current) return;
    runningRef.current = true;
    setLoading(true);
    setError("");
    try {
      await revokePasskeys(current.backendUrl, current.token);
      await clearPasskeyAccountHint();
      if (mountedRef.current) setEnabled(false);
    } catch (cause) {
      if (mountedRef.current) setError(cause instanceof Error ? cause.message : "No se pudo desactivar Face ID para PWA.");
    } finally {
      runningRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  return { available, enabled, loading, authenticating: loading, error, enable, disable };
}
