import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { IssuerEstablishment } from "../types";
import { Input } from "./common";

type DeleteEstablishmentModalProps = {
  visible: boolean;
  establishment: IssuerEstablishment;
  confirmText: string;
  deleting: boolean;
  onConfirmTextChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export function DeleteEstablishmentModal({
  visible,
  establishment,
  confirmText,
  deleting,
  onConfirmTextChange,
  onClose,
  onConfirm
}: DeleteEstablishmentModalProps) {
  const canDelete = confirmText.trim() === establishment.id && !deleting;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!deleting) onClose(); }}>
      <View style={styles.creditModalBackdrop}>
        <View style={styles.establishmentModal}>
          <View style={styles.creditModalHeader}>
            <View style={styles.flex}>
              <Text style={styles.creditModalTitle}>Eliminar establecimiento</Text>
              <Text style={styles.creditModalMeta}>Esta accion solo esta disponible si no existen documentos asociados.</Text>
            </View>
            <Pressable style={[styles.smallButton, deleting && styles.disabledButton]} onPress={() => { if (!deleting) onClose(); }} disabled={deleting}>
              <Text style={styles.smallButtonText}>Cerrar</Text>
            </Pressable>
          </View>
          <View style={styles.creditModalContent}>
            <Text style={styles.paragraph}>Para eliminar {establishment.name} escriba exactamente {establishment.id}.</Text>
            <Input label="Confirmar codigo" value={confirmText} onChangeText={onConfirmTextChange} autoCapitalize="characters" />
            <Pressable
              style={[styles.establishmentDeleteButton, !canDelete && styles.disabledDangerButton]}
              onPress={onConfirm}
              disabled={!canDelete}
            >
              <Text style={styles.establishmentDeleteButtonText}>{deleting ? "Eliminando..." : "Eliminar definitivamente"}</Text>
            </Pressable>
          </View>
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
  establishmentModal: {
    maxHeight: "92%",
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
  disabledButton: {
    backgroundColor: "#94a3b8"
  },
  creditModalContent: {
    padding: 14,
    gap: 10
  },
  paragraph: {
    color: "#4b5563",
    lineHeight: 20
  },
  establishmentDeleteButton: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fff1f2",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  establishmentDeleteButtonText: {
    color: "#991b1b",
    fontWeight: "900",
    textAlign: "center"
  },
  disabledDangerButton: {
    opacity: 0.55
  }
});
