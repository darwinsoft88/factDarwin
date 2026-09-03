import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { APP_VERSION } from "../constants/branding";
import { AppUpdatePolicy, evaluateAppUpdate, normalizeUpdatePolicy } from "../utils/appUpdate";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DISMISSED_KEY = "factudarwin:update-dismissed-version";
const POLICY_PATH = "/api/app/version-policy";

function policyUrl(): string {
  const backendUrl = String(process.env.EXPO_PUBLIC_BACKEND_URL || "https://api.factudarwin.com").trim();
  return `${backendUrl.replace(/\/$/, "")}${POLICY_PATH}`;
}

export function AppUpdatePrompt() {
  const [policy, setPolicy] = useState<AppUpdatePolicy | null>(null);
  const [visible, setVisible] = useState(false);
  const checkingRef = useRef(false);
  const lastCheckRef = useRef(0);

  const checkForUpdate = useCallback(async (force = false) => {
    if (Platform.OS !== "android" || checkingRef.current) return;
    const now = Date.now();
    if (!force && now - lastCheckRef.current < CHECK_INTERVAL_MS) return;
    checkingRef.current = true;
    lastCheckRef.current = now;
    try {
      const response = await fetch(policyUrl(), { headers: { Accept: "application/json" } });
      if (!response.ok) return;
      const nextPolicy = normalizeUpdatePolicy(await response.json());
      if (!nextPolicy) return;
      const decision = evaluateAppUpdate(APP_VERSION, nextPolicy);
      if (!decision.available) {
        setVisible(false);
        return;
      }
      if (!decision.required) {
        const dismissedVersion = await AsyncStorage.getItem(DISMISSED_KEY);
        if (dismissedVersion === nextPolicy.latestVersion) return;
      }
      setPolicy(nextPolicy);
      setVisible(true);
    } catch {
      // Una falla de red nunca debe impedir abrir ni usar FactuDarwin.
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void checkForUpdate(true);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void checkForUpdate();
    });
    return () => subscription.remove();
  }, [checkForUpdate]);

  if (Platform.OS !== "android" || !policy) return null;
  const decision = evaluateAppUpdate(APP_VERSION, policy);

  const dismiss = async () => {
    if (decision.required) return;
    await AsyncStorage.setItem(DISMISSED_KEY, policy.latestVersion);
    setVisible(false);
  };

  const openStore = async () => {
    try {
      await Linking.openURL(policy.storeUrl);
    } catch {
      // El aviso permanece disponible para que el usuario pueda reintentar.
    }
  };

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={() => { void dismiss(); }}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.iconCircle}><Text style={styles.icon}>↑</Text></View>
          <Text style={styles.title}>{decision.required ? "Actualización necesaria" : "Nueva versión disponible"}</Text>
          <Text style={styles.description}>
            {policy.message || `Actualiza FactuDarwin a la versión ${policy.latestVersion} para recibir las últimas mejoras y correcciones.`}
          </Text>
          <Text style={styles.version}>Instalada: {APP_VERSION}  ·  Disponible: {policy.latestVersion}</Text>
          <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={() => { void openStore(); }}>
            <Text style={styles.primaryText}>Actualizar en Google Play</Text>
          </Pressable>
          {!decision.required ? (
            <Pressable accessibilityRole="button" style={styles.secondaryButton} onPress={() => { void dismiss(); }}>
              <Text style={styles.secondaryText}>Ahora no</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { alignItems: "center", backgroundColor: "rgba(15, 23, 42, 0.58)", flex: 1, justifyContent: "center", padding: 22 },
  card: { backgroundColor: "#ffffff", borderRadius: 22, maxWidth: 420, padding: 24, width: "100%" },
  iconCircle: { alignItems: "center", alignSelf: "center", backgroundColor: "#d1fae5", borderRadius: 28, height: 56, justifyContent: "center", marginBottom: 14, width: 56 },
  icon: { color: "#087f72", fontSize: 32, fontWeight: "900", lineHeight: 36 },
  title: { color: "#0f172a", fontSize: 21, fontWeight: "900", textAlign: "center" },
  description: { color: "#475569", fontSize: 15, lineHeight: 22, marginTop: 10, textAlign: "center" },
  version: { color: "#64748b", fontSize: 12, marginTop: 12, textAlign: "center" },
  primaryButton: { alignItems: "center", backgroundColor: "#0b7f75", borderRadius: 11, marginTop: 20, paddingHorizontal: 16, paddingVertical: 14 },
  primaryText: { color: "#ffffff", fontSize: 15, fontWeight: "900" },
  secondaryButton: { alignItems: "center", marginTop: 6, paddingHorizontal: 16, paddingVertical: 12 },
  secondaryText: { color: "#0b6f68", fontSize: 14, fontWeight: "800" }
});
