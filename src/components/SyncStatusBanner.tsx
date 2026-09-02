import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppData } from "../types";
import { scopedReportData } from "../utils/documents";
import { isStaleSriPendingDocument } from "../utils/sriRetryPolicy";
import { SyncState } from "../utils/support";
import { buildSyncStatusBannerView, countUniqueAttentionDocuments, requiresSyncBannerAttention, runSyncStatusBannerAction } from "../utils/syncStatusBanner";
import { useAppTheme } from "../theme/AppTheme";

type SyncStatusBannerProps = {
  data: AppData;
  syncState: SyncState;
  retrying: boolean;
  onOpen: () => void;
  onRetry: () => void;
  onView: () => void;
};

export function SyncStatusBanner({ data, syncState, retrying, onOpen, onRetry, onView }: SyncStatusBannerProps) {
  const { theme } = useAppTheme();
  const pendingCount = data.pendingSync?.length || 0;
  const attentionDocuments = useMemo(
    () => scopedReportData(data).sales.filter((sale) => requiresSyncBannerAttention(sale)),
    [data]
  );
  const staleSriCount = attentionDocuments.filter((sale) => isStaleSriPendingDocument(sale)).length;
  const documentCount = countUniqueAttentionDocuments(
    attentionDocuments.map((sale) => sale.id)
  );
  const hasError = syncState === "error" || Boolean(data.autoBackupLastError);
  const content = useMemo(() => buildSyncStatusBannerView({
    documentCount,
    hasError,
    pendingCount,
    reviewCount: documentCount,
    retrying,
    sriPendingCount: 0,
    staleSriCount,
    syncState
  }), [documentCount, hasError, pendingCount, retrying, staleSriCount, syncState]);

  if (!content.visible) return null;

  const isDanger = content.tone === "danger";
  const toneColor = isDanger ? theme.colors.danger : content.tone === "info" ? theme.colors.primary : theme.colors.warning;
  const toneBackground = isDanger ? theme.colors.dangerSoft : content.tone === "info" ? theme.colors.primarySoft : theme.colors.warningSoft;
  const callbacks = { onOpen, onRetry, onView };

  return (
    <View style={[styles.wrap, { backgroundColor: toneBackground, borderColor: theme.colors.borderStrong }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${content.title}. Abrir detalles de sincronización`}
        style={styles.titleAction}
        onPress={() => runSyncStatusBannerAction("open", callbacks)}
      >
        <View style={styles.titleWrap}>
          <View style={[styles.dot, { backgroundColor: toneColor }]} />
          <Text style={[styles.title, { color: toneColor }]} numberOfLines={1}>{content.title}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={toneColor} />
      </Pressable>
      {content.retryLabel && content.viewLabel ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={retrying ? "Reintentando sincronización" : content.retryLabel}
            disabled={content.retryDisabled}
            hitSlop={6}
            style={[styles.actionButton, { borderColor: toneColor }, content.retryDisabled && styles.actionDisabled]}
            onPress={() => runSyncStatusBannerAction("retry", callbacks)}
          >
            <Text style={[styles.actionText, { color: toneColor }]}>{retrying ? "Reintentando…" : content.retryLabel}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={content.viewLabel}
            hitSlop={6}
            style={[styles.actionButton, { borderColor: toneColor }]}
            onPress={() => runSyncStatusBannerAction("view", callbacks)}
          >
            <Text style={[styles.actionText, { color: toneColor }]}>{content.viewLabel}</Text>
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
  title: { flex: 1, fontSize: 12, fontWeight: "900", lineHeight: 16 },
  actions: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionButton: {
    minHeight: 36,
    paddingHorizontal: 9,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  actionDisabled: { opacity: 0.55 },
  actionText: { fontSize: 11, fontWeight: "900" }
});
