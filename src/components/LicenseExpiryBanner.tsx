import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppLicense } from "../types";
import { appLicenseStatus } from "../utils/appAccess";
import { normalizeLicensePlanValue } from "../utils/license";

type LicenseExpiryBannerProps = {
  license?: AppLicense;
  onOpenLicense: () => void;
  visible?: boolean;
};

export function LicenseExpiryBanner({ license, onOpenLicense, visible = true }: LicenseExpiryBannerProps) {
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
    <View style={[styles.banner, expired ? styles.bannerExpired : styles.bannerWarning]}>
      <View style={[styles.iconBox, expired ? styles.iconBoxExpired : styles.iconBoxWarning]}>
        <MaterialCommunityIcons name={expired ? "shield-alert-outline" : "calendar-clock"} size={22} color={expired ? "#b91c1c" : "#0f766e"} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Ver planes de licencia" style={[styles.button, expired ? styles.buttonExpired : styles.buttonWarning]} onPress={onOpenLicense}>
        <Text style={styles.buttonText}>Ver planes</Text>
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
  bannerWarning: {
    backgroundColor: "#ecfdf5",
    borderColor: "#99f6e4"
  },
  bannerExpired: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa"
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  iconBoxWarning: {
    backgroundColor: "#ccfbf1"
  },
  iconBoxExpired: {
    backgroundColor: "#fee2e2"
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
  buttonWarning: {
    backgroundColor: "#0f766e"
  },
  buttonExpired: {
    backgroundColor: "#b91c1c"
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900"
  }
});
