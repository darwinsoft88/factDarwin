import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Empty } from "./common";
import { OperationTile } from "./metrics";
import { AppData, PendingSyncItem } from "../types";
import { formatAuditDate, formatSyncStatus, SyncState } from "../utils/support";

type SyncCenterModalProps = {
  visible: boolean;
  data: AppData;
  syncState: SyncState;
  syncActionLoading: boolean;
  onClose: () => void;
  onRetryPending: () => void;
  onTestServer: () => void;
};

export function SyncCenterModal({ visible, data, syncState, syncActionLoading, onClose, onRetryPending, onTestServer }: SyncCenterModalProps) {
  const pendingSync: PendingSyncItem[] = data.pendingSync || [];

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
            <View style={styles.operationGrid}>
              <OperationTile title="Pendientes" value={String(pendingSync.length)} detail="Cambios locales sin subir" tone={pendingSync.length ? "warning" : "success"} />
              <OperationTile title="Estado" value={syncState === "syncing" ? "Subiendo" : syncState === "error" ? "Error" : "OK"} detail={data.autoBackupEnabled === false ? "Modo manual" : "Respaldo automatico"} tone={syncState === "error" ? "danger" : syncState === "syncing" || pendingSync.length ? "warning" : "success"} />
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
  }
});
