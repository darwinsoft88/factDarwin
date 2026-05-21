import React from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, View } from "react-native";

export function ProcessingOverlay({ visible, message }: { visible: boolean; message: string }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.processingBackdrop}>
        <View style={styles.processingCard}>
          <ActivityIndicator size="large" color="#0f766e" />
          <Text style={styles.processingTitle}>Procesando</Text>
          <Text style={styles.processingText}>{message || "Espere un momento..."}</Text>
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
    alignItems: "center",
    gap: 10,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dbe4ee",
    backgroundColor: "#ffffff"
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
