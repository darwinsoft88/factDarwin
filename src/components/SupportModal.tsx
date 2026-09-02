import React from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MODAL_EDGE_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { useAppTheme } from "../theme/AppTheme";
import { AppLegalFooter } from "./AppLegalFooter";

type SupportModalProps = {
  visible: boolean;
  loading: boolean;
  diagnosticText: string;
  showTechnicalDetails?: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onShare: () => void;
};

export function SupportModal({ visible, loading, diagnosticText, showTechnicalDetails = false, onClose, onRefresh, onShare }: SupportModalProps) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const safeTopPadding = Platform.OS === "web" ? 12 : Math.max(insets.top, MODAL_EDGE_PADDING);
  const safeBottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, MODAL_SAFE_BOTTOM_PADDING);
  const adaptiveMaxHeight = Math.max(320, windowHeight - safeTopPadding - safeBottomPadding);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.creditModalBackdrop, { backgroundColor: theme.colors.backdrop }, Platform.OS !== "web" && { paddingTop: safeTopPadding, paddingBottom: safeBottomPadding }]}>
        <View style={[styles.diagnosticModal, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, Platform.OS !== "web" && { maxHeight: adaptiveMaxHeight, flexShrink: 1 }]}>
          <View style={[styles.creditModalHeader, { borderBottomColor: theme.colors.border }]}>
            <View style={styles.flex}>
              <Text style={[styles.creditModalTitle, { color: theme.colors.text }]}>Soporte</Text>
              <Text style={[styles.creditModalMeta, { color: theme.colors.textMuted }]}>Diagnostico para revisar conexion, licencia y sincronizacion.</Text>
            </View>
            <Pressable style={[styles.smallButton, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }]} onPress={onClose}>
              <Text style={[styles.smallButtonText, { color: theme.colors.primaryStrong }]}>Cerrar</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.creditModalContent}>
            <View style={styles.buttonRow}>
              <Pressable style={[styles.primaryButton, { backgroundColor: loading ? theme.colors.textSubtle : theme.colors.primary }]} onPress={onRefresh} disabled={loading}>
                <Text style={[styles.primaryButtonText, { color: theme.colors.onPrimary }]}>{loading ? "Revisando..." : "Actualizar diagnostico"}</Text>
              </Pressable>
              <Pressable style={[styles.secondaryActionButton, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }]} onPress={onShare}>
                <Text style={[styles.secondaryActionText, { color: theme.colors.primaryStrong }]}>Compartir</Text>
              </Pressable>
            </View>
            {loading ? <Text style={[styles.inlineInfo, { color: theme.colors.textMuted }]}>Revisando conexion y sincronizacion...</Text> : null}
            {showTechnicalDetails ? (
              <Text selectable style={[styles.diagnosticText, { color: theme.colors.text, backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border }]}>{diagnosticText}</Text>
            ) : (
              <View style={[styles.customerSupportCard, { borderColor: theme.colors.success, backgroundColor: theme.colors.successSoft }]}>
                <Text style={[styles.customerSupportTitle, { color: theme.colors.success }]}>Diagnostico listo para soporte</Text>
                <Text style={[styles.customerSupportText, { color: theme.colors.textMuted }]}>Use Compartir para enviar la informacion tecnica a DarwinSoft. En esta pantalla no se muestran datos internos para evitar cambios accidentales.</Text>
              </View>
            )}
            <AppLegalFooter compact />
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
  customerSupportCard: {
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 8,
    backgroundColor: "#f0fdf4",
    padding: 12,
    gap: 5
  },
  customerSupportTitle: {
    color: "#065f46",
    fontWeight: "900"
  },
  customerSupportText: {
    color: "#475569",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700"
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
