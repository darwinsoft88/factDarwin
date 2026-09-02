import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../theme/AppTheme";

type BiometricLockScreenProps = {
  authenticating: boolean;
  error: string;
  onUnlock: () => void;
  onUsePassword: () => void;
};

export function BiometricLockScreen({ authenticating, error, onUnlock, onUsePassword }: BiometricLockScreenProps) {
  const { theme } = useAppTheme();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.card, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border, shadowColor: theme.colors.shadow }]}>
        <View style={[styles.iconWrap, { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primary }]}>
          <MaterialCommunityIcons name="face-recognition" size={62} color={theme.colors.primary} />
        </View>
        <Text style={[styles.title, { color: theme.colors.text }]}>FactuDarwin protegido</Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>Confirme su identidad para continuar trabajando con la información de su empresa.</Text>
        {error ? <Text style={[styles.error, { color: theme.colors.danger, backgroundColor: theme.colors.dangerSoft }]}>{error}</Text> : null}
        <Pressable
          accessibilityRole="button"
          style={[styles.primaryButton, { backgroundColor: theme.colors.primary }, authenticating && styles.disabled]}
          disabled={authenticating}
          onPress={onUnlock}
        >
          {authenticating ? <ActivityIndicator color={theme.colors.onPrimary} /> : <MaterialCommunityIcons name="fingerprint" size={24} color={theme.colors.onPrimary} />}
          <Text style={[styles.primaryText, { color: theme.colors.onPrimary }]}>{authenticating ? "Verificando..." : "Desbloquear"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.secondaryButton} disabled={authenticating} onPress={onUsePassword}>
          <Text style={[styles.secondaryText, { color: theme.colors.textMuted }]}>Ingresar con contraseña</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 22 },
  card: { width: "100%", maxWidth: 390, borderWidth: 1, borderRadius: 24, padding: 24, alignItems: "center", gap: 14, shadowOpacity: 0.14, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 5 },
  iconWrap: { width: 112, height: 112, borderRadius: 28, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  title: { marginTop: 4, fontSize: 23, lineHeight: 28, fontWeight: "900", textAlign: "center" },
  description: { fontSize: 14, lineHeight: 21, fontWeight: "700", textAlign: "center" },
  error: { width: "100%", borderRadius: 10, padding: 10, fontSize: 12, lineHeight: 18, fontWeight: "800", textAlign: "center" },
  primaryButton: { width: "100%", minHeight: 52, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 16 },
  primaryText: { fontSize: 15, fontWeight: "900" },
  secondaryButton: { minHeight: 40, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  secondaryText: { fontSize: 13, fontWeight: "800" },
  disabled: { opacity: 0.65 }
});
