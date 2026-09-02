import React from "react";
import { ActivityIndicator, Modal, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MODAL_EDGE_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { useAppTheme } from "../theme/AppTheme";

export function ProcessingOverlay({ visible, message }: { visible: boolean; message: string }) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const safeTopPadding = Platform.OS === "web" ? 24 : Math.max(insets.top, MODAL_EDGE_PADDING);
  const safeBottomPadding = Platform.OS === "web" ? 24 : Math.max(insets.bottom, MODAL_SAFE_BOTTOM_PADDING);
  const adaptiveMaxHeight = Math.max(280, windowHeight - safeTopPadding - safeBottomPadding);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={[styles.processingBackdrop, { backgroundColor: theme.colors.backdrop }, Platform.OS !== "web" && { paddingTop: safeTopPadding, paddingBottom: safeBottomPadding }]}>
        <View style={[styles.processingCard, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }, Platform.OS !== "web" && { maxHeight: adaptiveMaxHeight, flexShrink: 1 }]}>
          <ScrollView contentContainerStyle={styles.processingContent}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={[styles.processingTitle, { color: theme.colors.text }]}>Procesando</Text>
          <Text style={[styles.processingText, { color: theme.colors.textMuted }]}>{message || "Espere un momento..."}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  processingBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(15, 23, 42, 0.35)"
  },
  processingCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dbe4ee",
    backgroundColor: "#ffffff",
    overflow: "hidden"
  },
  processingContent: {
    alignItems: "center",
    gap: 10,
    padding: 20
  },
  processingTitle: {
    color: "#102033",
    fontSize: 16,
    fontWeight: "900"
  },
  processingText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    textAlign: "center"
  }
});
