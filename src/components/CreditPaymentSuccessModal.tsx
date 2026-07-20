import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

type CreditPaymentSuccessModalProps = {
  visible: boolean;
  title: string;
  message: string;
  receiptLabel?: string;
  shareLabel?: string;
  onClose: () => void;
  onOpenReceipt: () => void;
  onShareReceipt: () => void;
};

export function CreditPaymentSuccessModal({
  visible,
  title,
  message,
  receiptLabel = "Ver recibo",
  shareLabel = "Compartir recibo",
  onClose,
  onOpenReceipt,
  onShareReceipt
}: CreditPaymentSuccessModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="check-bold" size={30} color="#ffffff" />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <Pressable style={styles.primaryAction} onPress={onOpenReceipt}>
              <MaterialCommunityIcons name="receipt-text-outline" size={18} color="#ffffff" />
              <Text style={styles.primaryActionText}>{receiptLabel}</Text>
            </Pressable>
            <Pressable style={styles.secondaryAction} onPress={onShareReceipt}>
              <MaterialCommunityIcons name="share-variant-outline" size={18} color="#0f766e" />
              <Text style={styles.secondaryActionText}>{shareLabel}</Text>
            </Pressable>
          </View>
          <Pressable style={styles.closeAction} onPress={onClose}>
            <Text style={styles.closeActionText}>Cerrar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18
  },
  card: {
    width: "100%",
    maxWidth: 390,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe5ef",
    padding: 18,
    alignItems: "center",
    gap: 12,
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5
  },
  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#16a34a",
    alignItems: "center",
    justifyContent: "center"
  },
  title: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center"
  },
  message: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    textAlign: "center"
  },
  actions: {
    width: "100%",
    gap: 8
  },
  primaryAction: {
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8
  },
  primaryActionText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  secondaryAction: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#99f6e4",
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8
  },
  secondaryActionText: {
    color: "#0f766e",
    fontSize: 13,
    fontWeight: "900"
  },
  closeAction: {
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  closeActionText: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "900"
  }
});
