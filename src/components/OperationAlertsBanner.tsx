import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { AppData } from "../types";
import { AppTab } from "../utils/appAccess";
import { buildDashboard } from "../utils/dashboard";
import { useAppTheme } from "../theme/AppTheme";

type OperationAlertsBannerProps = {
  data: AppData;
  onNavigate: (tab: AppTab) => void;
};

export function OperationAlertsBanner({ data, onNavigate }: OperationAlertsBannerProps) {
  const { theme } = useAppTheme();
  const pulse = useRef(new Animated.Value(1)).current;
  const dashboard = useMemo(() => buildDashboard(data), [data]);

  const alert = useMemo(() => {
    if (dashboard.rejectedCount > 0) {
      return {
        icon: "alert-octagon-outline" as const,
        title: "Facturas rechazadas",
        detail: `${dashboard.rejectedCount} factura(s) requieren correccion o reintento.`,
        count: dashboard.rejectedCount,
        tone: "danger" as const,
        action: "Revisar",
        tab: "documentos" as AppTab
      };
    }

    if (dashboard.pendingCount > 0) {
      return {
        icon: "clock-alert-outline" as const,
        title: "Facturas por revisar",
        detail: `${dashboard.pendingCount} factura(s) no autorizada(s). Revise el estado SRI.`,
        count: dashboard.pendingCount,
        tone: "warning" as const,
        action: "Revisar",
        tab: "documentos" as AppTab
      };
    }

    return null;
  }, [dashboard]);

  useEffect(() => {
    if (!alert || alert.tone !== "danger") {
      pulse.setValue(1);
      return undefined;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.25, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true })
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [alert, pulse]);

  if (!alert) return null;

  const isDanger = alert.tone === "danger";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${alert.title}. ${alert.detail}`}
      style={[styles.wrap, { backgroundColor: isDanger ? theme.colors.dangerSoft : theme.colors.warningSoft, borderColor: isDanger ? theme.colors.danger : theme.colors.warning }]}
      onPress={() => onNavigate(alert.tab)}
    >
      <View style={styles.topRow}>
        <View style={styles.titleWrap}>
          <Animated.View style={[styles.dot, { backgroundColor: isDanger ? theme.colors.danger : theme.colors.warning, opacity: isDanger ? pulse : 1 }]} />
          <MaterialCommunityIcons name={alert.icon} size={15} color={isDanger ? theme.colors.danger : theme.colors.warning} />
          <Text style={[styles.title, { color: isDanger ? theme.colors.danger : theme.colors.warning }]} numberOfLines={1}>{alert.title}</Text>
        </View>
        <Text style={[styles.badge, { color: isDanger ? theme.colors.danger : theme.colors.warning, backgroundColor: theme.colors.surfaceElevated }]}>{alert.count} alerta{alert.count === 1 ? "" : "s"}</Text>
      </View>

      <View style={styles.bottomRow}>
        <Text style={[styles.detail, { color: isDanger ? theme.colors.danger : theme.colors.warning }]} numberOfLines={2}>{alert.detail}</Text>
        <View style={[styles.actionButton, { borderColor: isDanger ? theme.colors.danger : theme.colors.warning, backgroundColor: theme.colors.surfaceElevated }]}>
          <Text style={[styles.actionText, { color: isDanger ? theme.colors.danger : theme.colors.warning }]}>{alert.action}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1
  },
  wrapDanger: {
    backgroundColor: "#fee2e2",
    borderColor: "#fecaca"
  },
  wrapWarning: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa"
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999
  },
  dotDanger: {
    backgroundColor: "#ef4444"
  },
  dotWarning: {
    backgroundColor: "#f59e0b"
  },
  bottomRow: {
    marginTop: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    justifyContent: "space-between"
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: "#92400e",
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16
  },
  titleDanger: {
    color: "#991b1b"
  },
  badge: {
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 3,
    color: "#92400e",
    backgroundColor: "#fef3c7",
    fontSize: 11,
    fontWeight: "900"
  },
  badgeDanger: {
    color: "#ffffff",
    backgroundColor: "#b91c1c"
  },
  detail: {
    flex: 1,
    minWidth: 0,
    color: "#92400e",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 15
  },
  detailDanger: {
    color: "#991b1b"
  },
  actionButton: {
    minHeight: 31,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  actionDanger: {
    borderColor: "#fca5a5",
    backgroundColor: "#fff7f7"
  },
  actionWarning: {
    borderColor: "#fdba74",
    backgroundColor: "#fff7ed"
  },
  actionText: {
    color: "#92400e",
    fontSize: 11,
    fontWeight: "900"
  },
  actionTextDanger: {
    color: "#991b1b"
  }
});
