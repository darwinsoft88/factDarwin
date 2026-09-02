import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../theme/AppTheme";

type MetricIconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export function QuickAction({ label, onPress, icon }: { label: string; onPress: () => void; icon?: MetricIconName }) {
  const { theme } = useAppTheme();
  return (
    <Pressable style={[styles.quickAction, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.primarySoft }]} onPress={onPress}>
      {icon ? (
        <View style={[styles.quickActionIcon, { backgroundColor: theme.colors.successSoft }]}>
          <MaterialCommunityIcons name={icon} size={17} color={theme.colors.primary} />
        </View>
      ) : null}
      <Text style={[styles.quickActionText, { color: theme.colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

export function AlertRow({ title, detail, tone, icon }: { title: string; detail: string; tone: "warning" | "danger"; icon?: MetricIconName }) {
  const { theme } = useAppTheme();
  const toneColor = tone === "danger" ? theme.colors.danger : theme.colors.warning;
  return (
    <View style={[styles.alertRow, { borderColor: toneColor, backgroundColor: tone === "danger" ? theme.colors.dangerSoft : theme.colors.warningSoft }]}>
      <View style={styles.alertHeader}>
        {icon ? <MaterialCommunityIcons name={icon} size={17} color={toneColor} /> : null}
        <Text style={[styles.alertTitle, { color: toneColor }]}>{title}</Text>
      </View>
      <Text style={[styles.alertDetail, { color: toneColor }]}>{detail}</Text>
    </View>
  );
}

export function ReportRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const { theme } = useAppTheme();
  return (
    <View style={[styles.reportRow, { borderColor: theme.colors.border }]}>
      <Text style={[styles.reportLabel, { color: theme.colors.textMuted }, strong && [styles.reportStrong, { color: theme.colors.primary }]]}>{label}</Text>
      <Text style={[styles.reportValue, { color: theme.colors.text }, strong && [styles.reportStrong, { color: theme.colors.primary }]]}>{value}</Text>
    </View>
  );
}

export function OperationTile({ title, value, detail, tone, icon }: { title: string; value: string; detail: string; tone: "success" | "warning" | "danger"; icon?: MetricIconName }) {
  const { theme } = useAppTheme();
  const toneColor = tone === "success" ? theme.colors.success : tone === "warning" ? theme.colors.warning : theme.colors.danger;
  const toneSoft = tone === "success" ? theme.colors.successSoft : tone === "warning" ? theme.colors.warningSoft : theme.colors.dangerSoft;
  return (
    <View style={[styles.operationTile, { borderColor: toneColor, backgroundColor: toneSoft, shadowColor: theme.colors.shadow }]}>
      <View style={styles.operationHeader}>
        {icon ? (
          <View style={[styles.operationIcon, { backgroundColor: toneSoft }]}>
            <MaterialCommunityIcons name={icon} size={16} color={toneColor} />
          </View>
        ) : null}
        <Text style={[styles.operationTitle, { color: toneColor }]}>{title}</Text>
      </View>
      <Text style={[styles.operationValue, { color: theme.colors.text }]}>{value}</Text>
      <Text style={[styles.operationDetail, { color: theme.colors.textMuted }]}>{detail}</Text>
    </View>
  );
}

export function StatBox({ label, value, tone = "default", icon }: { label: string; value: string; tone?: "default" | "success" | "warning" | "danger" | "info"; icon?: MetricIconName }) {
  const { theme } = useAppTheme();
  const iconColor = tone === "success" ? theme.colors.success : tone === "warning" ? theme.colors.warning : tone === "danger" ? theme.colors.danger : tone === "info" ? theme.colors.info : theme.colors.primary;
  const toneSoft = tone === "success" ? theme.colors.successSoft : tone === "warning" ? theme.colors.warningSoft : tone === "danger" ? theme.colors.dangerSoft : tone === "info" ? theme.colors.infoSoft : theme.colors.surfaceMuted;
  return (
    <View style={[styles.statBox, { borderColor: theme.colors.border, backgroundColor: toneSoft, shadowColor: theme.colors.shadow }]}>
      <View style={styles.statHeader}>
        <Text style={[styles.statValue, { color: theme.colors.text }]}>{value}</Text>
        {icon ? (
          <View style={[styles.statIcon, { backgroundColor: toneSoft }]}>
            <MaterialCommunityIcons name={icon} size={15} color={iconColor} />
          </View>
        ) : null}
      </View>
      <Text style={[styles.statLabel, { color: theme.colors.textMuted }]}>{label}</Text>
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
