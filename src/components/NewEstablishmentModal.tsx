import React from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KEYBOARD_AVOIDING_BEHAVIOR, MODAL_EDGE_PADDING, MODAL_KEYBOARD_CONTENT_BOTTOM_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { useKeyboardInset } from "../hooks/useKeyboardInset";
import { useAppTheme } from "../theme/AppTheme";
import { sanitizeIntegerInput } from "../utils/numbers";
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
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const keyboardInset = useKeyboardInset();
  const androidKeyboardInset = Platform.OS === "android" ? keyboardInset : 0;
  const safeTopPadding = Platform.OS === "web" ? MODAL_EDGE_PADDING : Math.max(insets.top, MODAL_EDGE_PADDING);
  const safeBottomPadding = Platform.OS === "web" ? MODAL_SAFE_BOTTOM_PADDING : Math.max(insets.bottom, MODAL_SAFE_BOTTOM_PADDING);
  const adaptiveMaxHeight = Math.max(320, windowHeight - safeTopPadding - safeBottomPadding);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={KEYBOARD_AVOIDING_BEHAVIOR} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
        <View style={[styles.creditModalBackdrop, { backgroundColor: theme.colors.backdrop }, Platform.OS !== "web" && { paddingTop: safeTopPadding, paddingBottom: safeBottomPadding }, androidKeyboardInset > 0 && { paddingBottom: androidKeyboardInset + safeBottomPadding }]}>
          <View style={[styles.establishmentModal, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, Platform.OS !== "web" && { maxHeight: adaptiveMaxHeight, flexShrink: 1 }]}>
            <View style={[styles.creditModalHeader, { borderBottomColor: theme.colors.border }]}>
              <View style={styles.flex}>
                <Text style={[styles.creditModalTitle, { color: theme.colors.text }]}>Nuevo establecimiento</Text>
                <Text style={[styles.creditModalMeta, { color: theme.colors.textMuted }]}>Disponible para clientes con plan Pro activo.</Text>
              </View>
              <Pressable style={[styles.smallButton, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }]} onPress={onClose}>
                <Text style={[styles.smallButtonText, { color: theme.colors.primaryStrong }]}>Cerrar</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={[styles.creditModalContent, androidKeyboardInset > 0 && { paddingBottom: androidKeyboardInset + MODAL_KEYBOARD_CONTENT_BOTTOM_PADDING }]} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}>
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
