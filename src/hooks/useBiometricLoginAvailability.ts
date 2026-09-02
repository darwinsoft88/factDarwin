import * as LocalAuthentication from "expo-local-authentication";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { loadBiometricAccountHint, type BiometricAccountHint } from "../services/biometricCredentialStorage";
import { loadBiometricLockEnabled } from "../services/biometricLockStorage";
import { getPasskeyCapabilities } from "../services/backend";
import { loadPasskeyAccountHint } from "../services/passkeyHintStorage";

export function useBiometricLoginAvailability(active: boolean) {
  const [hint, setHint] = useState<BiometricAccountHint | null>(null);
  const [buttonLabel, setButtonLabel] = useState("Continuar con biometría");
  const [loading, setLoading] = useState(active && Platform.OS !== "web");

  useEffect(() => {
    let mounted = true;
    if (!active) {
      setHint(null);
      setLoading(false);
      return () => { mounted = false; };
    }
    if (Platform.OS === "web") {
      setLoading(true);
      void loadPasskeyAccountHint().then(async (storedHint) => {
        if (!storedHint || typeof window === "undefined" || !window.isSecureContext || !("PublicKeyCredential" in window)) return null;
        const capability = await getPasskeyCapabilities(storedHint.backendUrl);
        return capability.enabled ? storedHint : null;
      }).then((storedHint) => {
        if (!mounted) return;
        setHint(storedHint ? {
          version: 2,
          companyId: storedHint.companyId,
          userId: storedHint.userId,
          email: storedHint.email,
          displayName: storedHint.displayName
        } : null);
        setButtonLabel("Continuar con Face ID");
      }).catch(() => {
        if (mounted) setHint(null);
      }).finally(() => {
        if (mounted) setLoading(false);
      });
      return () => { mounted = false; };
    }
    setLoading(true);
    void (async () => {
      const storedHint = await loadBiometricAccountHint();
      if (!storedHint) return null;
      const [hardware, enrolled, level, enabled, types] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        LocalAuthentication.getEnrolledLevelAsync(),
        loadBiometricLockEnabled(storedHint.companyId, storedHint.userId),
        LocalAuthentication.supportedAuthenticationTypesAsync()
      ]);
      return hardware && enrolled && enabled && level === LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG
        ? { hint: storedHint, types }
        : null;
    })().then((result) => {
      if (!mounted) return;
      setHint(result?.hint || null);
      setButtonLabel(
        Platform.OS === "ios" && result?.types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
          ? "Continuar con Face ID"
          : "Continuar con biometría"
      );
    }).catch(() => {
      if (mounted) setHint(null);
    }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [active]);

  return { hint, loading, buttonLabel };
}
