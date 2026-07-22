import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppData } from "../types";
import { buildDashboard } from "../utils/dashboard";
import { sriPendingSendSummary } from "../utils/sriRetryPolicy";
import { SyncState } from "../utils/support";
import { buildSyncStatusBannerView, runSyncStatusBannerAction } from "../utils/syncStatusBanner";

type SyncStatusBannerProps = {
  data: AppData;
  syncState: SyncState;
  retrying: boolean;
  onOpen: () => void;
  onRetry: () => void;
  onView: () => void;
};

export function SyncStatusBanner({ data, syncState, retrying, onOpen, onRetry, onView }: SyncStatusBannerProps) {
  const pendingCount = data.pendingSync?.length || 0;
  const sriSummary = sriPendingSendSummary(data);
  const sriPendingCount = sriSummary.pendingCount;
  const staleSriCount = sriSummary.staleCount;
  const dashboard = useMemo(() => buildDashboard(data), [data]);
  const reviewCount = dashboard.pendingCount + dashboard.rejectedCount;
  const documentCount = sriPendingCount + dashboard.rejectedCount;
  const hasError = syncState === "error" || Boolean(data.autoBackupLastError);
  const content = useMemo(() => buildSyncStatusBannerView({
    documentCount,
    hasError,
    pendingCount,
    reviewCount,
    retrying,
    sriPendingCount,
    staleSriCount,
    syncState
  }), [documentCount, hasError, pendingCount, reviewCount, retrying, sriPendingCount, staleSriCount, syncState]);

  if (!content.visible) return null;

  const isDanger = content.tone === "danger";
  const callbacks = { onOpen, onRetry, onView };

  return (
    <View style={[styles.wrap, isDanger ? styles.wrapDanger : content.tone === "info" ? styles.wrapInfo : styles.wrapWarning]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${content.title}. Abrir detalles de sincronización`}
        style={styles.titleAction}
        onPress={() => runSyncStatusBannerAction("open", callbacks)}
      >
        <View style={styles.titleWrap}>
          <View style={[styles.dot, isDanger ? styles.dotDanger : content.tone === "info" ? styles.dotInfo : styles.dotWarning]} />
          <Text style={[styles.title, isDanger && styles.titleDanger]} numberOfLines={1}>{content.title}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={isDanger ? "#991b1b" : "#0f766e"} />
      </Pressable>
      {content.retryLabel && content.viewLabel ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={retrying ? "Reintentando sincronización" : content.retryLabel}
            disabled={content.retryDisabled}
            hitSlop={6}
            style={[styles.actionButton, content.retryDisabled && styles.actionDisabled]}
            onPress={() => runSyncStatusBannerAction("retry", callbacks)}
          >
            <Text style={styles.actionText}>{retrying ? "Reintentando…" : content.retryLabel}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={content.viewLabel}
            hitSlop={6}
            style={styles.actionButton}
            onPress={() => runSyncStatusBannerAction("view", callbacks)}
          >
            <Text style={styles.actionText}>{content.viewLabel}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    justifyContent: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  wrapDanger: { backgroundColor: "#fee2e2", borderColor: "#fecaca" },
  wrapInfo: { backgroundColor: "#ecfeff", borderColor: "#bae6fd" },
  wrapWarning: { backgroundColor: "#fff7ed", borderColor: "#fed7aa" },
  titleAction: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6
  },
  titleWrap: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 999 },
  dotDanger: { backgroundColor: "#ef4444" },
  dotWarning: { backgroundColor: "#f59e0b" },
  dotInfo: { backgroundColor: "#0f766e" },
  title: { flex: 1, color: "#0f766e", fontSize: 12, fontWeight: "900", lineHeight: 16 },
  titleDanger: { color: "#991b1b" },
  actions: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionButton: {
    minHeight: 36,
    paddingHorizontal: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center"
  },
  actionDisabled: { opacity: 0.55 },
  actionText: { color: "#0f766e", fontSize: 11, fontWeight: "900" }
});
