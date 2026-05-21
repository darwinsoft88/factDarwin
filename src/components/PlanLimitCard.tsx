import React from "react";
import { StyleSheet, Text, View } from "react-native";

type PlanLimitCardProps = {
  licenseLabel: string;
};

export function PlanLimitCard({ licenseLabel }: PlanLimitCardProps) {
  return (
    <View style={styles.planLockCard}>
      <View style={styles.planLockHeader}>
        <Text style={styles.planLockKicker}>Plan actual</Text>
        <Text style={styles.planLockBadge}>{licenseLabel}</Text>
      </View>
      <Text style={styles.planLockTitle}>1 punto de emision incluido</Text>
      <Text style={styles.planLockText}>Para manejar sucursales o varios puntos de emision, active Plan Pro desde el panel SaaS.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  planLockCard: {
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 8,
    padding: 12,
    gap: 7,
    backgroundColor: "#eff6ff"
  },
  planLockHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  planLockKicker: {
    color: "#1d4ed8",
    fontSize: 11,
    fontWeight: "900"
  },
  planLockBadge: {
    color: "#0f766e",
    backgroundColor: "#ccfbf1",
    borderRadius: 8,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 10,
    fontWeight: "900"
  },
  planLockTitle: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900"
  },
  planLockText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
  }
});
