import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AppLicense, Issuer } from "../types";
import { ActivePlanInfo } from "./ActivePlanInfo";

type LicenseModalProps = {
  visible: boolean;
  license: AppLicense;
  issuer?: Issuer;
  onClose: () => void;
};

export function LicenseModal({ visible, license, issuer, onClose }: LicenseModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.flex}>
              <Text style={styles.title}>Licencia</Text>
              <Text style={styles.meta}>Planes, renovacion y activacion comercial.</Text>
            </View>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>Cerrar</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator>
            <ActivePlanInfo license={license} issuer={issuer} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "flex-end",
    padding: 12
  },
  modal: {
    maxHeight: "94%",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden"
  },
  header: {
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
  title: {
    color: "#111827",
    fontSize: 19,
    fontWeight: "900"
  },
  meta: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 3
  },
  closeButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  closeButtonText: {
    color: "#0f5f59",
    fontWeight: "900"
  },
  content: {
    padding: 14,
    gap: 10
  }
});
