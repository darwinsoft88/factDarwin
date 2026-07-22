import React, { useMemo } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Empty } from "./common";
import { OperationTile } from "./metrics";
import { AppData, PendingSyncItem } from "../types";
import { displayInvoiceStatus } from "../utils/invoiceStatus";
import { buildDashboard } from "../utils/dashboard";
import { documentTypeLabel } from "../utils/sales";
import { sriPendingSendSummary } from "../utils/sriRetryPolicy";
import { formatAuditDate, formatSyncStatus, SyncState } from "../utils/support";

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
  const pendingSync: PendingSyncItem[] = data.pendingSync || [];
  const sriSummary = sriPendingSendSummary(data);
  const dashboard = useMemo(() => buildDashboard(data), [data]);
  const reviewCount = dashboard.pendingCount + dashboard.rejectedCount;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.creditModalBackdrop}>
        <View style={styles.diagnosticModal}>
          <View style={styles.creditModalHeader}>
            <View style={styles.flex}>
              <Text style={styles.creditModalTitle}>Sincronizacion</Text>
              <Text style={styles.creditModalMeta}>{formatSyncStatus(syncState, data)}</Text>
            </View>
            <Pressable style={styles.smallButton} onPress={onClose}>
              <Text style={styles.smallButtonText}>Cerrar</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.creditModalContent}>
            <View style={styles.attentionCard}>
              <View style={styles.attentionCopy}>
                <Text style={styles.sectionMiniTitle}>Documentos pendientes</Text>
                <Text style={styles.attentionCount}>{sriSummary.pendingCount}</Text>
              </View>
              <Pressable style={[styles.primaryButton, syncActionLoading && styles.disabledButton]} onPress={onRetryPending} disabled={syncActionLoading}>
                <Text style={styles.primaryButtonText}>{syncActionLoading ? "Procesando..." : "Reintentar"}</Text>
              </Pressable>
            </View>
            <View style={styles.attentionCard}>
              <View style={styles.attentionCopy}>
                <Text style={styles.sectionMiniTitle}>Facturas por revisar</Text>
                <Text style={styles.attentionCount}>{reviewCount}</Text>
              </View>
              <Pressable style={styles.secondaryActionButton} onPress={onReviewDocuments}>
                <Text style={styles.secondaryActionText}>Revisar</Text>
              </Pressable>
            </View>
            <View style={styles.operationGrid}>
              <OperationTile title="Pendientes" value={String(pendingSync.length)} detail="Cambios locales sin subir" tone={pendingSync.length ? "warning" : "success"} icon="cloud-upload-outline" />
              <OperationTile title="SRI pendientes" value={String(sriSummary.pendingCount)} detail="Sin enviar o autorizar" tone={sriSummary.pendingCount ? "warning" : "success"} icon="file-clock-outline" />
              <OperationTile title="Fuera de fecha" value={String(sriSummary.staleCount)} detail="No reenviar al SRI" tone={sriSummary.staleCount ? "danger" : "success"} icon="calendar-alert" />
              <OperationTile title="Estado" value={syncState === "syncing" ? "Subiendo" : syncState === "error" ? "Error" : "OK"} detail={data.autoBackupEnabled === false ? "Modo manual" : "Respaldo automatico"} tone={syncState === "error" ? "danger" : syncState === "syncing" || pendingSync.length ? "warning" : "success"} icon="sync" />
            </View>
            <Text selectable style={styles.inlineInfo}>Servidor: {data.backendUrl || "sin URL configurada"}</Text>
            {data.autoBackupLastAt ? <Text style={styles.inlineInfo}>Ultima subida: {formatAuditDate(data.autoBackupLastAt)}</Text> : null}
            {data.autoBackupLastError ? <Text style={[styles.inlineInfo, styles.errorText]}>Ultimo error: {data.autoBackupLastError}</Text> : null}
            <View style={styles.buttonRow}>
              <Pressable style={[styles.primaryButton, syncActionLoading && styles.disabledButton]} onPress={onRetryPending} disabled={syncActionLoading}>
                <Text style={styles.primaryButtonText}>{syncActionLoading ? "Procesando..." : "Reintentar pendientes"}</Text>
              </Pressable>
              <Pressable style={styles.secondaryActionButton} onPress={onTestServer} disabled={syncActionLoading}>
                <Text style={styles.secondaryActionText}>Probar servidor</Text>
              </Pressable>
            </View>
            <Text style={styles.sectionMiniTitle}>Cola pendiente</Text>
            {pendingSync.length === 0 ? <Empty text="No hay cambios pendientes. Este dispositivo esta limpio." /> : null}
            {pendingSync.map((item) => (
              <View key={item.id} style={styles.pendingSyncCard}>
                <Text style={styles.pendingSyncTitle}>{item.title}</Text>
                <Text style={styles.pendingSyncMeta}>{formatAuditDate(item.createdAt)} | Intentos: {item.attempts}</Text>
                {item.lastError ? <Text style={styles.pendingSyncError}>{item.lastError}</Text> : null}
              </View>
            ))}
            <Text style={styles.sectionMiniTitle}>Documentos SRI pendientes</Text>
            {sriSummary.pendingCount === 0 ? <Empty text="No hay facturas ni notas credito pendientes de envio SRI." /> : null}
            {sriSummary.pending.map((sale) => {
              const isStale = sriSummary.stale.some((item) => item.id === sale.id);
              return (
                <View key={sale.id} style={[styles.pendingSyncCard, isStale && styles.staleSriCard]}>
                  <Text style={styles.pendingSyncTitle}>{sale.sequence} | {documentTypeLabel(sale)}</Text>
                  <Text style={styles.pendingSyncMeta}>{formatAuditDate(sale.createdAt)} | {displayInvoiceStatus(sale.status)}</Text>
                  <Text style={[styles.pendingSyncError, !isStale && styles.pendingSriInfo]}>
                    {isStale
                      ? "Fuera del dia permitido. No se debe reenviar; emita un nuevo comprobante con fecha actual."
                      : "Pendiente de envio o autorizacion SRI. Reintente durante el mismo dia."}
                  </Text>
                  {sale.sriMessage ? <Text style={styles.pendingSyncMeta}>{sale.sriMessage}</Text> : null}
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
