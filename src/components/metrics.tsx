import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export function QuickAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.quickAction} onPress={onPress}>
      <Text style={styles.quickActionText}>{label}</Text>
    </Pressable>
  );
}

export function AlertRow({ title, detail, tone }: { title: string; detail: string; tone: "warning" | "danger" }) {
  return (
    <View style={[styles.alertRow, tone === "danger" ? styles.alertDanger : styles.alertWarning]}>
      <Text style={[styles.alertTitle, tone === "danger" ? styles.alertDangerText : styles.alertWarningText]}>{title}</Text>
      <Text style={[styles.alertDetail, tone === "danger" ? styles.alertDangerText : styles.alertWarningText]}>{detail}</Text>
    </View>
  );
}

export function ReportRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.reportRow}>
      <Text style={[styles.reportLabel, strong && styles.reportStrong]}>{label}</Text>
      <Text style={[styles.reportValue, strong && styles.reportStrong]}>{value}</Text>
    </View>
  );
}

export function OperationTile({ title, value, detail, tone }: { title: string; value: string; detail: string; tone: "success" | "warning" | "danger" }) {
  return (
    <View style={[styles.operationTile, tone === "success" && styles.operationSuccess, tone === "warning" && styles.operationWarning, tone === "danger" && styles.operationDanger]}>
      <Text style={[styles.operationTitle, tone === "success" && styles.operationSuccessText, tone === "warning" && styles.operationWarningText, tone === "danger" && styles.operationDangerText]}>{title}</Text>
      <Text style={styles.operationValue}>{value}</Text>
      <Text style={styles.operationDetail}>{detail}</Text>
    </View>
  );
}

export function StatBox({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" | "warning" | "danger" | "info" }) {
  return (
    <View style={[styles.statBox, tone === "success" && styles.statBoxSuccess, tone === "warning" && styles.statBoxWarning, tone === "danger" && styles.statBoxDanger, tone === "info" && styles.statBoxInfo]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  quickAction: {
    flexGrow: 1,
    flexBasis: "45%",
    borderWidth: 1,
    borderColor: "#b8e7df",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#f4fbfa",
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center"
  },
  quickActionText: {
    color: "#0f766e",
    fontWeight: "900"
  },
  operationTile: {
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: 150,
    borderWidth: 1,
    borderColor: "#d7dee8",
    borderRadius: 8,
    padding: 11,
    backgroundColor: "#f8fafc",
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1
  },
  operationSuccess: {
    borderColor: "#86efac",
    backgroundColor: "#f0fdf4"
  },
  operationWarning: {
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb"
  },
  operationDanger: {
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2"
  },
  operationTitle: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "900"
  },
  operationSuccessText: {
    color: "#166534"
  },
  operationWarningText: {
    color: "#92400e"
  },
  operationDangerText: {
    color: "#991b1b"
  },
  operationValue: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 5
  },
  operationDetail: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
    lineHeight: 15
  },
  statBox: {
    flexGrow: 1,
    flexBasis: "45%",
    borderWidth: 1,
    borderColor: "#d7dee8",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#f8fafc",
    shadowColor: "#0f172a",
    shadowOpacity: 0.035,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1
  },
  statBoxSuccess: {
    borderColor: "#bbf7d0",
    backgroundColor: "#f0fdf4"
  },
  statBoxWarning: {
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb"
  },
  statBoxDanger: {
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2"
  },
  statBoxInfo: {
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff"
  },
  statValue: {
    color: "#111827",
    fontWeight: "900",
    fontSize: 16
  },
  statLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3
  },
  reportRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 8
  },
  reportLabel: {
    color: "#374151",
    fontWeight: "700",
    flex: 1
  },
  reportValue: {
    color: "#111827",
    fontWeight: "800",
    textAlign: "right"
  },
  reportStrong: {
    fontSize: 15,
    color: "#0f766e"
  },
  alertRow: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10
  },
  alertWarning: {
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb"
  },
  alertDanger: {
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2"
  },
  alertTitle: {
    fontWeight: "900"
  },
  alertDetail: {
    marginTop: 3,
    lineHeight: 17
  },
  alertWarningText: {
    color: "#92400e"
  },
  alertDangerText: {
    color: "#991b1b"
  }
});
