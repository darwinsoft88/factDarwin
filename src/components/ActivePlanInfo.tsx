import React from "react";
import { StyleSheet, Text } from "react-native";
import { AppLicense } from "../types";
import { appLicenseStatus, licenseStatusLabel } from "../utils/appAccess";
import { maxEmissionPointsForLicense } from "../utils/license";

type ActivePlanInfoProps = {
  license: AppLicense;
};

export function ActivePlanInfo({ license }: ActivePlanInfoProps) {
  return (
    <>
      <Text style={styles.paragraph}>El plan comercial se administra desde el panel SaaS de DarwinSoft.</Text>
      <Text style={[styles.inlineInfo, !appLicenseStatus(license).active && styles.errorText]}>{licenseStatusLabel(license)}</Text>
      <Text style={styles.paragraph}>Usuarios: {license.maxUsers || 1} | Dispositivos: {license.maxDevices || 1} | Puntos de emision: {maxEmissionPointsForLicense(license)}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  paragraph: {
    color: "#4b5563",
    lineHeight: 20
  },
  inlineInfo: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18
  },
  errorText: {
    color: "#b91c1c"
  }
});
