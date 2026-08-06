import React from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { KEYBOARD_AVOIDING_BEHAVIOR, MODAL_EDGE_PADDING, MODAL_KEYBOARD_CONTENT_BOTTOM_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { sanitizeIntegerInput } from "../utils/numbers";
import { Input, PrimaryButton } from "./common";
import { AppToast } from "./AppToast";
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
      <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={KEYBOARD_AVOIDING_BEHAVIOR} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
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
            <ScrollView contentContainerStyle={styles.creditModalContent} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}>
              <Input label="Nombre establecimiento" value={form.name} onChangeText={(name) => onChange({ ...form, name })} />
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Input label="Estab." value={form.establishment} onChangeText={(establishment) => onChange({ ...form, establishment: sanitizeIntegerInput(establishment).slice(0, 3) })} keyboardType="number-pad" />
                </View>
                <View style={styles.flex}>
                  <Input label="Pto. emi." value={form.emissionPoint} onChangeText={(emissionPoint) => onChange({ ...form, emissionPoint: sanitizeIntegerInput(emissionPoint).slice(0, 3) })} keyboardType="number-pad" />
                </View>
              </View>
              <Input label="Direccion establecimiento" value={form.address} onChangeText={(address) => onChange({ ...form, address })} />
              <Input label="Siguiente secuencial" value={form.sequential} onChangeText={(sequential) => onChange({ ...form, sequential: sanitizeIntegerInput(sequential) })} keyboardType="number-pad" />
              <Input label="Siguiente secuencial guia" value={form.remissionSequential} onChangeText={(remissionSequential) => onChange({ ...form, remissionSequential: sanitizeIntegerInput(remissionSequential) })} keyboardType="number-pad" />
              <Input label="Siguiente secuencial nota credito" value={form.creditNoteSequential} onChangeText={(creditNoteSequential) => onChange({ ...form, creditNoteSequential: sanitizeIntegerInput(creditNoteSequential) })} keyboardType="number-pad" />
              <PrimaryButton label="Guardar establecimiento" onPress={onSave} />
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
      <AppToast />
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardAvoiding: {
    flex: 1
  },
  creditModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "flex-end",
    paddingHorizontal: MODAL_EDGE_PADDING,
    paddingTop: MODAL_EDGE_PADDING,
    paddingBottom: MODAL_SAFE_BOTTOM_PADDING
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
    paddingBottom: MODAL_KEYBOARD_CONTENT_BOTTOM_PADDING,
    gap: 10
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: 10
  }
});
