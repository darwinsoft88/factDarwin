import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppData } from "../types";
import { buildDashboard } from "../utils/dashboard";
import { sriPendingSendSummary } from "../utils/sriRetryPolicy";
import { SyncState } from "../utils/support";

type SyncStatusBannerProps = {
  data: AppData;
  syncState: SyncState;
  onOpen: () => void;
};

export function SyncStatusBanner({ data, syncState, onOpen }: SyncStatusBannerProps) {
  const pendingCount = data.pendingSync?.length || 0;
  const sriSummary = sriPendingSendSummary(data);
  const sriPendingCount = sriSummary.pendingCount;
  const staleSriCount = sriSummary.staleCount;
  const dashboard = useMemo(() => buildDashboard(data), [data]);
  const reviewCount = dashboard.pendingCount + dashboard.rejectedCount;
  const documentCount = sriPendingCount + dashboard.rejectedCount;
  const hasError = syncState === "error" || Boolean(data.autoBackupLastError);
  const visible = documentCount > 0 || reviewCount > 0 || pendingCount > 0 || hasError || syncState === "syncing" || syncState === "pending";

  const content = useMemo(() => {
    if (staleSriCount > 0) {
      return {
        title: `SRI requiere atención (${documentCount || staleSriCount})`,
        tone: "danger" as const
      };
    }

    if (syncState === "syncing") {
      return {
        title: "Sincronizando documentos",
        tone: "info" as const
      };
    }

    if (hasError) {
      return {
        title: documentCount > 0 ? `SRI requiere atención (${documentCount})` : "Sincronización requiere atención",
        tone: "danger" as const
      };
    }

    if (sriPendingCount > 0) {
      return {
        title: `SRI requiere atención (${documentCount})`,
        tone: "warning" as const
      };
    }

    return {
      title: reviewCount > 0
        ? `${reviewCount} documento${reviewCount === 1 ? "" : "s"} requiere${reviewCount === 1 ? "" : "n"} atención`
        : `Sincronización requiere atención${pendingCount > 0 ? ` (${pendingCount})` : ""}`,
      tone: "warning" as const
    };
  }, [documentCount, hasError, pendingCount, reviewCount, sriPendingCount, staleSriCount, syncState]);

  if (!visible) return null;

  const isDanger = content.tone === "danger";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${content.title}. Abrir detalles de sincronización`}
      style={[styles.wrap, isDanger ? styles.wrapDanger : content.tone === "info" ? styles.wrapInfo : styles.wrapWarning]}
      onPress={onOpen}
    >
      <View style={styles.topRow}>
        <View style={styles.titleWrap}>
          <View style={[styles.dot, isDanger ? styles.dotDanger : content.tone === "info" ? styles.dotInfo : styles.dotWarning]} />
          <Text style={[styles.title, isDanger && styles.titleDanger]} numberOfLines={1}>{content.title}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={isDanger ? "#991b1b" : "#0f766e"} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    justifyContent: "center"
  },
  wrapDanger: {
    backgroundColor: "#fee2e2",
    borderColor: "#fecaca"
  },
  wrapInfo: {
    backgroundColor: "#ecfeff",
    borderColor: "#bae6fd"
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
    gap: 8
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 999
  },
  dotDanger: {
    backgroundColor: "#ef4444"
  },
  dotWarning: {
    backgroundColor: "#f59e0b"
  },
  dotInfo: {
    backgroundColor: "#0f766e"
  },
  title: {
    flex: 1,
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 16
  },
  titleDanger: {
    color: "#991b1b"
  }
});
