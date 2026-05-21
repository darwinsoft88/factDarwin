import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

type PlanUpgradeModalProps = {
  visible: boolean;
  message: string;
  onClose: () => void;
};

export function PlanUpgradeModal({ visible, message, onClose }: PlanUpgradeModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.smallNoticeBackdrop}>
        <View style={styles.upgradeModal}>
          <View style={styles.upgradeIcon}>
            <Text style={styles.upgradeIconText}>PRO</Text>
          </View>
          <Text style={styles.smallNoticeTitle}>Plan Pro requerido</Text>
          <Text style={styles.smallNoticeText}>{message || "Agregar mas establecimientos esta disponible solo para clientes con licencia Pro activa."}</Text>
          <View style={styles.upgradeBenefits}>
            <Text style={styles.upgradeBenefit}>Multi punto de emision</Text>
            <Text style={styles.upgradeBenefit}>Sucursales separadas por secuencial</Text>
            <Text style={styles.upgradeBenefit}>Control comercial desde panel SaaS</Text>
          </View>
          <Pressable style={styles.primaryButton} onPress={onClose}>
            <Text style={styles.primaryButtonText}>Entendido</Text>
          </Pressable>
          <Text style={styles.upgradeFooter}>Active o cambie el plan desde el panel maestro.</Text>
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
    padding: 18,
    gap: 12,
    shadowColor: "#0f172a",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4
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
