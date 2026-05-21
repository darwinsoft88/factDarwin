import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type SupportModalProps = {
  visible: boolean;
  loading: boolean;
  diagnosticText: string;
  onClose: () => void;
  onRefresh: () => void;
  onShare: () => void;
};

export function SupportModal({ visible, loading, diagnosticText, onClose, onRefresh, onShare }: SupportModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.creditModalBackdrop}>
        <View style={styles.diagnosticModal}>
          <View style={styles.creditModalHeader}>
            <View style={styles.flex}>
              <Text style={styles.creditModalTitle}>Soporte</Text>
              <Text style={styles.creditModalMeta}>Diagnostico para revisar conexion, licencia y sincronizacion.</Text>
            </View>
            <Pressable style={styles.smallButton} onPress={onClose}>
              <Text style={styles.smallButtonText}>Cerrar</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.creditModalContent}>
            <View style={styles.buttonRow}>
              <Pressable style={[styles.primaryButton, loading && styles.disabledButton]} onPress={onRefresh} disabled={loading}>
                <Text style={styles.primaryButtonText}>{loading ? "Revisando..." : "Actualizar diagnostico"}</Text>
              </Pressable>
              <Pressable style={styles.secondaryActionButton} onPress={onShare}>
                <Text style={styles.secondaryActionText}>Compartir</Text>
              </Pressable>
            </View>
            {loading ? <Text style={styles.inlineInfo}>Consultando backend y logs tecnicos...</Text> : null}
            <Text selectable style={styles.diagnosticText}>{diagnosticText}</Text>
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
  inlineInfo: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18
  },
  diagnosticText: {
    fontFamily: "monospace",
    color: "#111827",
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    fontSize: 11,
    lineHeight: 16
  }
});
