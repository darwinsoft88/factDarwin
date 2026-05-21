import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Input, PrimaryButton } from "./common";

export type NewEstablishmentForm = {
  name: string;
  establishment: string;
  emissionPoint: string;
  address: string;
  sequential: string;
  remissionSequential: string;
  creditNoteSequential: string;
};

type NewEstablishmentModalProps = {
  visible: boolean;
  form: NewEstablishmentForm;
  onChange: (form: NewEstablishmentForm) => void;
  onClose: () => void;
  onSave: () => void;
};

export function NewEstablishmentModal({ visible, form, onChange, onClose, onSave }: NewEstablishmentModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.creditModalBackdrop}>
        <View style={styles.establishmentModal}>
          <View style={styles.creditModalHeader}>
            <View style={styles.flex}>
              <Text style={styles.creditModalTitle}>Nuevo establecimiento</Text>
              <Text style={styles.creditModalMeta}>Disponible para clientes con plan Pro activo.</Text>
            </View>
            <Pressable style={styles.smallButton} onPress={onClose}>
              <Text style={styles.smallButtonText}>Cerrar</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.creditModalContent} keyboardShouldPersistTaps="handled">
            <Input label="Nombre establecimiento" value={form.name} onChangeText={(name) => onChange({ ...form, name })} />
            <View style={styles.row}>
              <View style={styles.flex}>
                <Input label="Estab." value={form.establishment} onChangeText={(establishment) => onChange({ ...form, establishment })} keyboardType="number-pad" />
              </View>
              <View style={styles.flex}>
                <Input label="Pto. emi." value={form.emissionPoint} onChangeText={(emissionPoint) => onChange({ ...form, emissionPoint })} keyboardType="number-pad" />
              </View>
            </View>
            <Input label="Direccion establecimiento" value={form.address} onChangeText={(address) => onChange({ ...form, address })} />
            <Input label="Siguiente secuencial" value={form.sequential} onChangeText={(sequential) => onChange({ ...form, sequential })} keyboardType="number-pad" />
            <Input label="Siguiente secuencial guia" value={form.remissionSequential} onChangeText={(remissionSequential) => onChange({ ...form, remissionSequential })} keyboardType="number-pad" />
            <Input label="Siguiente secuencial nota credito" value={form.creditNoteSequential} onChangeText={(creditNoteSequential) => onChange({ ...form, creditNoteSequential })} keyboardType="number-pad" />
            <PrimaryButton label="Guardar establecimiento" onPress={onSave} />
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
  creditModalContent: {
    padding: 14,
    gap: 10
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: 10
  }
});
