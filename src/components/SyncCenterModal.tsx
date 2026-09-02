import React, { useMemo } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MODAL_EDGE_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { Empty } from "./common";
import { OperationTile } from "./metrics";
import { AppData, PendingSyncItem } from "../types";
import { displayInvoiceStatus } from "../utils/invoiceStatus";
import { buildDashboard } from "../utils/dashboard";
import { documentTypeLabel } from "../utils/sales";
import { sriPendingSendSummary } from "../utils/sriRetryPolicy";
import { formatAuditDate, formatSyncStatus, SyncState } from "../utils/support";
import { useAppTheme } from "../theme/AppTheme";

type SyncCenterModalProps = {
  visible: boolean;
  data: AppData;
  syncState: SyncState;
  syncActionLoading: boolean;
  onClose: () => void;
  onRetryPending: () => void;
  onReviewDocuments: () => void;
  onTestServer: () => void;
};

export function SyncCenterModal({ visible, data, syncState, syncActionLoading, onClose, onRetryPending, onReviewDocuments, onTestServer }: SyncCenterModalProps) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const safeTopPadding = Platform.OS === "web" ? 12 : Math.max(insets.top, MODAL_EDGE_PADDING);
  const safeBottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, MODAL_SAFE_BOTTOM_PADDING);
  const adaptiveMaxHeight = Math.max(320, windowHeight - safeTopPadding - safeBottomPadding);
  const pendingSync: PendingSyncItem[] = data.pendingSync || [];
  const sriSummary = sriPendingSendSummary(data);
  const dashboard = useMemo(() => buildDashboard(data), [data]);
  const reviewCount = dashboard.pendingCount + dashboard.rejectedCount;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.creditModalBackdrop, { backgroundColor: theme.colors.backdrop }, Platform.OS !== "web" && { paddingTop: safeTopPadding, paddingBottom: safeBottomPadding }]}>
        <View style={[styles.diagnosticModal, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, Platform.OS !== "web" && { maxHeight: adaptiveMaxHeight, flexShrink: 1 }]}>
          <View style={[styles.creditModalHeader, { borderBottomColor: theme.colors.border }]}>
            <View style={styles.flex}>
              <Text style={[styles.creditModalTitle, { color: theme.colors.text }]}>Sincronizacion</Text>
              <Text style={[styles.creditModalMeta, { color: theme.colors.textMuted }]}>{formatSyncStatus(syncState, data)}</Text>
            </View>
            <Pressable style={[styles.smallButton, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }]} onPress={onClose}>
              <Text style={[styles.smallButtonText, { color: theme.colors.primaryStrong }]}>Cerrar</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.creditModalContent}>
            <View style={[styles.attentionCard, { borderColor: theme.colors.warning, backgroundColor: theme.colors.warningSoft }]}>
              <View style={styles.attentionCopy}>
                <Text style={[styles.sectionMiniTitle, { color: theme.colors.text }]}>Documentos pendientes</Text>
                <Text style={[styles.attentionCount, { color: theme.colors.warning }]}>{sriSummary.pendingCount}</Text>
              </View>
              <Pressable style={[styles.primaryButton, { backgroundColor: syncActionLoading ? theme.colors.textSubtle : theme.colors.primary }]} onPress={onRetryPending} disabled={syncActionLoading}>
                <Text style={[styles.primaryButtonText, { color: theme.colors.onPrimary }]}>{syncActionLoading ? "Procesando..." : "Reintentar"}</Text>
              </Pressable>
            </View>
            <View style={[styles.attentionCard, { borderColor: theme.colors.warning, backgroundColor: theme.colors.warningSoft }]}>
              <View style={styles.attentionCopy}>
                <Text style={[styles.sectionMiniTitle, { color: theme.colors.text }]}>Facturas por revisar</Text>
                <Text style={[styles.attentionCount, { color: theme.colors.warning }]}>{reviewCount}</Text>
              </View>
              <Pressable style={[styles.secondaryActionButton, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }]} onPress={onReviewDocuments}>
                <Text style={[styles.secondaryActionText, { color: theme.colors.primaryStrong }]}>Revisar</Text>
              </Pressable>
            </View>
            <View style={styles.operationGrid}>
              <OperationTile title="Pendientes" value={String(pendingSync.length)} detail="Cambios locales sin subir" tone={pendingSync.length ? "warning" : "success"} icon="cloud-upload-outline" />
              <OperationTile title="SRI pendientes" value={String(sriSummary.pendingCount)} detail="Sin enviar o autorizar" tone={sriSummary.pendingCount ? "warning" : "success"} icon="file-clock-outline" />
              <OperationTile title="Fuera de fecha" value={String(sriSummary.staleCount)} detail="No reenviar al SRI" tone={sriSummary.staleCount ? "danger" : "success"} icon="calendar-alert" />
              <OperationTile title="Estado" value={syncState === "syncing" ? "Subiendo" : syncState === "error" ? "Error" : "OK"} detail={data.autoBackupEnabled === false ? "Modo manual" : "Respaldo automatico"} tone={syncState === "error" ? "danger" : syncState === "syncing" || pendingSync.length ? "warning" : "success"} icon="sync" />
            </View>
            <Text selectable style={[styles.inlineInfo, { color: theme.colors.textMuted }]}>Servidor: {data.backendUrl || "sin URL configurada"}</Text>
            {data.autoBackupLastAt ? <Text style={[styles.inlineInfo, { color: theme.colors.textMuted }]}>Ultima subida: {formatAuditDate(data.autoBackupLastAt)}</Text> : null}
            {data.autoBackupLastError ? <Text style={[styles.inlineInfo, { color: theme.colors.danger }]}>Ultimo error: {data.autoBackupLastError}</Text> : null}
            <View style={styles.buttonRow}>
              <Pressable style={[styles.primaryButton, { backgroundColor: syncActionLoading ? theme.colors.textSubtle : theme.colors.primary }]} onPress={onRetryPending} disabled={syncActionLoading}>
                <Text style={[styles.primaryButtonText, { color: theme.colors.onPrimary }]}>{syncActionLoading ? "Procesando..." : "Reintentar pendientes"}</Text>
              </Pressable>
              <Pressable style={[styles.secondaryActionButton, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }]} onPress={onTestServer} disabled={syncActionLoading}>
                <Text style={[styles.secondaryActionText, { color: theme.colors.primaryStrong }]}>Probar servidor</Text>
              </Pressable>
            </View>
            <Text style={[styles.sectionMiniTitle, { color: theme.colors.text }]}>Cola pendiente</Text>
            {pendingSync.length === 0 ? <Empty text="No hay cambios pendientes. Este dispositivo esta limpio." /> : null}
            {pendingSync.map((item) => (
              <View key={item.id} style={[styles.pendingSyncCard, { borderColor: theme.colors.warning, backgroundColor: theme.colors.warningSoft }]}>
                <Text style={[styles.pendingSyncTitle, { color: theme.colors.text }]}>{item.title}</Text>
                <Text style={[styles.pendingSyncMeta, { color: theme.colors.textMuted }]}>{formatAuditDate(item.createdAt)} | Intentos: {item.attempts}</Text>
                {item.lastError ? <Text style={[styles.pendingSyncError, { color: theme.colors.warning }]}>{item.lastError}</Text> : null}
              </View>
            ))}
            <Text style={[styles.sectionMiniTitle, { color: theme.colors.text }]}>Documentos SRI pendientes</Text>
            {sriSummary.pendingCount === 0 ? <Empty text="No hay facturas ni notas credito pendientes de envio SRI." /> : null}
            {sriSummary.pending.map((sale) => {
              const isStale = sriSummary.stale.some((item) => item.id === sale.id);
              return (
                <View key={sale.id} style={[styles.pendingSyncCard, { borderColor: isStale ? theme.colors.danger : theme.colors.warning, backgroundColor: isStale ? theme.colors.dangerSoft : theme.colors.warningSoft }]}>
                  <Text style={[styles.pendingSyncTitle, { color: theme.colors.text }]}>{sale.sequence} | {documentTypeLabel(sale)}</Text>
                  <Text style={[styles.pendingSyncMeta, { color: theme.colors.textMuted }]}>{formatAuditDate(sale.createdAt)} | {displayInvoiceStatus(sale.status)}</Text>
                  <Text style={[styles.pendingSyncError, { color: isStale ? theme.colors.danger : theme.colors.primaryStrong }]}>
                    {isStale
                      ? "Fuera del dia permitido. No se debe reenviar; emita un nuevo comprobante con fecha actual."
                      : "Pendiente de envio o autorizacion SRI. Reintente durante el mismo dia."}
                  </Text>
                  {sale.sriMessage ? <Text style={[styles.pendingSyncMeta, { color: theme.colors.textMuted }]}>{sale.sriMessage}</Text> : null}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  creditModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "flex-end",
    padding: 12
  },
  diagnosticModal: {
    maxHeight: "94%",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden"
  },
  creditModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb"
  },
  flex: {
    flex: 1,
    minWidth: 130
  },
  creditModalTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900"
  },
  creditModalMeta: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 3
  },
  smallButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  smallButtonText: {
    color: "#0f5f59",
    fontWeight: "900"
  },
  creditModalContent: {
    padding: 14,
    gap: 10
  },
  operationGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  attentionCard: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: "#fed7aa",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#fff7ed",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  attentionCopy: {
    flex: 1,
    minWidth: 0
  },
  attentionCount: {
    marginTop: 2,
    color: "#92400e",
    fontSize: 20,
    fontWeight: "900"
  },
  inlineInfo: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18
  },
  errorText: {
    color: "#b91c1c"
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "800"
  },
  disabledButton: {
    backgroundColor: "#94a3b8"
  },
  secondaryActionButton: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  secondaryActionText: {
    color: "#0f5f59",
    fontSize: 12,
    fontWeight: "900"
  },
  sectionMiniTitle: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 4
  },
  pendingSyncCard: {
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#fffbeb",
    gap: 4
  },
  pendingSyncTitle: {
    color: "#111827",
    fontWeight: "900"
  },
  pendingSyncMeta: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700"
  },
  pendingSyncError: {
    color: "#92400e",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17
  },
  pendingSriInfo: {
    color: "#0f766e"
  },
  staleSriCard: {
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2"
  }
});
