import React from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MODAL_EDGE_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { useAppTheme } from "../theme/AppTheme";

type PlanUpgradeModalProps = {
  visible: boolean;
  message: string;
  onClose: () => void;
};

export function PlanUpgradeModal({ visible, message, onClose }: PlanUpgradeModalProps) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const safeTopPadding = Platform.OS === "web" ? 24 : Math.max(insets.top, MODAL_EDGE_PADDING);
  const safeBottomPadding = Platform.OS === "web" ? 24 : Math.max(insets.bottom, MODAL_SAFE_BOTTOM_PADDING);
  const adaptiveMaxHeight = Math.max(320, windowHeight - safeTopPadding - safeBottomPadding);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.smallNoticeBackdrop, { backgroundColor: theme.colors.backdrop }, Platform.OS !== "web" && { paddingTop: safeTopPadding, paddingBottom: safeBottomPadding }]}>
        <View style={[styles.upgradeModal, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.primary, shadowColor: theme.colors.shadow }, Platform.OS !== "web" && { maxHeight: adaptiveMaxHeight, flexShrink: 1 }]}>
          <ScrollView contentContainerStyle={styles.upgradeContent}>
          <View style={[styles.upgradeIcon, { backgroundColor: theme.colors.primary }]}>
            <Text style={[styles.upgradeIconText, { color: theme.colors.onPrimary }]}>PRO</Text>
          </View>
          <Text style={[styles.smallNoticeTitle, { color: theme.colors.text }]}>Plan Pro requerido</Text>
          <Text style={[styles.smallNoticeText, { color: theme.colors.textMuted }]}>{message || "Agregar mas establecimientos esta disponible solo para clientes con licencia Pro activa."}</Text>
          <View style={[styles.upgradeBenefits, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }]}>
            <Text style={[styles.upgradeBenefit, { color: theme.colors.primaryStrong }]}>Multi punto de emision</Text>
            <Text style={[styles.upgradeBenefit, { color: theme.colors.primaryStrong }]}>Sucursales separadas por secuencial</Text>
            <Text style={[styles.upgradeBenefit, { color: theme.colors.primaryStrong }]}>Control comercial desde panel SaaS</Text>
          </View>
          <Pressable style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]} onPress={onClose}>
            <Text style={[styles.primaryButtonText, { color: theme.colors.onPrimary }]}>Entendido</Text>
          </Pressable>
          <Text style={[styles.upgradeFooter, { color: theme.colors.textMuted }]}>Active o cambie el plan desde el panel maestro.</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  smallNoticeBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  upgradeModal: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#99f6e4",
    backgroundColor: "#ffffff",
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4
  },
  upgradeContent: {
    padding: 18,
    gap: 12
  },
  upgradeIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f766e"
  },
  upgradeIconText: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 12
  },
  smallNoticeTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center"
  },
  smallNoticeText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    textAlign: "center"
  },
  upgradeBenefits: {
    borderWidth: 1,
    borderColor: "#ccfbf1",
    borderRadius: 8,
    backgroundColor: "#f0fdfa",
    padding: 10,
    gap: 6
  },
  upgradeBenefit: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "900"
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
  upgradeFooter: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center"
  }
});
