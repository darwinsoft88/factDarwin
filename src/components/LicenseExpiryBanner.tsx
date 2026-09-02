import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppLicense } from "../types";
import { appLicenseStatus } from "../utils/appAccess";
import { normalizeLicensePlanValue } from "../utils/license";
import { useAppTheme } from "../theme/AppTheme";

type LicenseExpiryBannerProps = {
  license?: AppLicense;
  onOpenLicense: () => void;
  visible?: boolean;
};

export function LicenseExpiryBanner({ license, onOpenLicense, visible = true }: LicenseExpiryBannerProps) {
  const { theme } = useAppTheme();
  const status = appLicenseStatus(license);
  const plan = normalizeLicensePlanValue(license?.plan);
  const isTrial = plan === "trial" || license?.status === "trial";
  const daysLeft = Math.max(0, status.daysLeft);
  const expired = !status.active || status.effectiveStatus === "expired" || status.effectiveStatus === "suspended";
  const shouldWarn = expired || (isTrial && daysLeft <= 15) || (!isTrial && daysLeft <= 7);

  if (!shouldWarn || (!visible && !expired)) return null;

  const title = expired ? "Tu prueba gratis termino" : isTrial ? `Tu prueba gratis termina en ${daysLeft} dia${daysLeft === 1 ? "" : "s"}` : `Tu plan vence en ${daysLeft} dia${daysLeft === 1 ? "" : "s"}`;
  const message = expired
    ? "Activa un plan para seguir trabajando sin interrupciones."
    : "Renueva antes del vencimiento y evita cortes en facturacion, sincronizacion y soporte.";

  return (
    <View style={[styles.banner, { backgroundColor: expired ? theme.colors.warningSoft : theme.colors.primarySoft, borderColor: theme.colors.borderStrong, shadowColor: theme.colors.shadow }]}>
      <View style={[styles.iconBox, { backgroundColor: expired ? theme.colors.dangerSoft : theme.colors.successSoft }]}>
        <MaterialCommunityIcons name={expired ? "shield-alert-outline" : "calendar-clock"} size={22} color={expired ? theme.colors.danger : theme.colors.primary} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
        <Text style={[styles.message, { color: theme.colors.textMuted }]}>{message}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Ver planes de licencia" style={[styles.button, { backgroundColor: expired ? theme.colors.danger : theme.colors.primary }]} onPress={onOpenLicense}>
        <Text style={[styles.buttonText, { color: theme.colors.onPrimary }]}>Ver planes</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 2,
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  copy: {
    flex: 1,
    minWidth: 0
  },
  title: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "900"
  },
  message: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
    marginTop: 2
  },
  button: {
    minHeight: 36,
    borderRadius: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center"
  },
  buttonText: {
    fontSize: 12,
    fontWeight: "900"
  }
});
