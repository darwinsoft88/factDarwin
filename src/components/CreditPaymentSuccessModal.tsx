import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MODAL_EDGE_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { useAppTheme } from "../theme/AppTheme";

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
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const safeTopPadding = Platform.OS === "web" ? 18 : Math.max(insets.top, MODAL_EDGE_PADDING);
  const safeBottomPadding = Platform.OS === "web" ? 18 : Math.max(insets.bottom, MODAL_SAFE_BOTTOM_PADDING);
  const adaptiveMaxHeight = Math.max(320, windowHeight - safeTopPadding - safeBottomPadding);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: theme.colors.backdrop }, Platform.OS !== "web" && { paddingTop: safeTopPadding, paddingBottom: safeBottomPadding }]}>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, shadowColor: theme.colors.shadow }, Platform.OS !== "web" && { maxHeight: adaptiveMaxHeight, flexShrink: 1 }]}>
          <ScrollView contentContainerStyle={styles.cardContent}>
          <View style={[styles.iconCircle, { backgroundColor: theme.colors.success }]}>
            <MaterialCommunityIcons name="check-bold" size={30} color="#ffffff" />
          </View>
          <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
          <Text style={[styles.message, { color: theme.colors.textMuted }]}>{message}</Text>
          <View style={styles.actions}>
            <Pressable style={[styles.primaryAction, { backgroundColor: theme.colors.primary }]} onPress={onOpenReceipt}>
              <MaterialCommunityIcons name="receipt-text-outline" size={18} color={theme.colors.onPrimary} />
              <Text style={[styles.primaryActionText, { color: theme.colors.onPrimary }]}>{receiptLabel}</Text>
            </Pressable>
            <Pressable style={[styles.secondaryAction, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }]} onPress={onShareReceipt}>
              <MaterialCommunityIcons name="share-variant-outline" size={18} color={theme.colors.primary} />
              <Text style={[styles.secondaryActionText, { color: theme.colors.primary }]}>{shareLabel}</Text>
            </Pressable>
          </View>
          <Pressable style={styles.closeAction} onPress={onClose}>
            <Text style={[styles.closeActionText, { color: theme.colors.textMuted }]}>Cerrar</Text>
          </Pressable>
          </ScrollView>
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
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5
  },
  cardContent: {
    padding: 18,
    alignItems: "center",
    gap: 12
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
