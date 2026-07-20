import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

type MetricIconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export function QuickAction({ label, onPress, icon }: { label: string; onPress: () => void; icon?: MetricIconName }) {
  return (
    <Pressable style={styles.quickAction} onPress={onPress}>
      {icon ? (
        <View style={styles.quickActionIcon}>
          <MaterialCommunityIcons name={icon} size={17} color="#0f766e" />
        </View>
      ) : null}
      <Text style={styles.quickActionText}>{label}</Text>
    </Pressable>
  );
}

export function AlertRow({ title, detail, tone, icon }: { title: string; detail: string; tone: "warning" | "danger"; icon?: MetricIconName }) {
  return (
    <View style={[styles.alertRow, tone === "danger" ? styles.alertDanger : styles.alertWarning]}>
      <View style={styles.alertHeader}>
        {icon ? <MaterialCommunityIcons name={icon} size={17} color={tone === "danger" ? "#991b1b" : "#92400e"} /> : null}
        <Text style={[styles.alertTitle, tone === "danger" ? styles.alertDangerText : styles.alertWarningText]}>{title}</Text>
      </View>
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

export function OperationTile({ title, value, detail, tone, icon }: { title: string; value: string; detail: string; tone: "success" | "warning" | "danger"; icon?: MetricIconName }) {
  return (
    <View style={[styles.operationTile, tone === "success" && styles.operationSuccess, tone === "warning" && styles.operationWarning, tone === "danger" && styles.operationDanger]}>
      <View style={styles.operationHeader}>
        {icon ? (
          <View style={[styles.operationIcon, tone === "success" && styles.operationIconSuccess, tone === "warning" && styles.operationIconWarning, tone === "danger" && styles.operationIconDanger]}>
            <MaterialCommunityIcons name={icon} size={16} color={tone === "success" ? "#166534" : tone === "warning" ? "#92400e" : "#991b1b"} />
          </View>
        ) : null}
        <Text style={[styles.operationTitle, tone === "success" && styles.operationSuccessText, tone === "warning" && styles.operationWarningText, tone === "danger" && styles.operationDangerText]}>{title}</Text>
      </View>
      <Text style={styles.operationValue}>{value}</Text>
      <Text style={styles.operationDetail}>{detail}</Text>
    </View>
  );
}

export function StatBox({ label, value, tone = "default", icon }: { label: string; value: string; tone?: "default" | "success" | "warning" | "danger" | "info"; icon?: MetricIconName }) {
  const iconColor = tone === "success" ? "#15803d" : tone === "warning" ? "#b45309" : tone === "danger" ? "#b91c1c" : tone === "info" ? "#1d4ed8" : "#0f766e";
  return (
    <View style={[styles.statBox, tone === "success" && styles.statBoxSuccess, tone === "warning" && styles.statBoxWarning, tone === "danger" && styles.statBoxDanger, tone === "info" && styles.statBoxInfo]}>
      <View style={styles.statHeader}>
        <Text style={styles.statValue}>{value}</Text>
        {icon ? (
          <View style={[styles.statIcon, tone === "success" && styles.statIconSuccess, tone === "warning" && styles.statIconWarning, tone === "danger" && styles.statIconDanger, tone === "info" && styles.statIconInfo]}>
            <MaterialCommunityIcons name={icon} size={15} color={iconColor} />
          </View>
        ) : null}
      </View>
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
  quickActionIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#d1fae5",
    marginBottom: 6
  },
  quickActionText: {
    color: "#0f766e",
    fontWeight: "900"
  },
  operationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  operationIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e2e8f0"
  },
  operationIconSuccess: {
    backgroundColor: "#dcfce7"
  },
  operationIconWarning: {
    backgroundColor: "#fef3c7"
  },
  operationIconDanger: {
    backgroundColor: "#fee2e2"
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
  statHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  statIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e0f2fe"
  },
  statIconSuccess: {
    backgroundColor: "#dcfce7"
  },
  statIconWarning: {
    backgroundColor: "#fef3c7"
  },
  statIconDanger: {
    backgroundColor: "#fee2e2"
  },
  statIconInfo: {
    backgroundColor: "#dbeafe"
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
  alertHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7
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
