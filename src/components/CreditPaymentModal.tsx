import React from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Input, PrimaryButton, Select } from "./common";
import { KEYBOARD_AVOIDING_BEHAVIOR, MODAL_EDGE_PADDING, MODAL_KEYBOARD_CONTENT_BOTTOM_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { paymentOptions } from "../constants/options";
import { useKeyboardInset } from "../hooks/useKeyboardInset";
import { money } from "../sri";
import { Client, PaymentMethod, Sale } from "../types";
import { creditBalance } from "../utils/credit";
import { documentNumber } from "../utils/documents";
import { formatShortDate } from "../utils/format";
import { sanitizeDecimalInput } from "../utils/numbers";

type CreditPaymentModalProps = {
  amountText: string;
  issuer: Parameters<typeof documentNumber>[1];
  note: string;
  onAmountChange: (value: string) => void;
  onClose: () => void;
  onNoteChange: (value: string) => void;
  onPaymentMethodChange: (value: PaymentMethod) => void;
  onSave: () => void;
  paymentMethod: PaymentMethod;
  selectedClient?: Client;
  selectedSale?: Sale;
  submitting?: boolean;
};

export function CreditPaymentModal({
  amountText,
  issuer,
  note,
  onAmountChange,
  onClose,
  onNoteChange,
  onPaymentMethodChange,
  onSave,
  paymentMethod,
  selectedClient,
  selectedSale,
  submitting = false
}: CreditPaymentModalProps) {
  const keyboardInset = useKeyboardInset();
  const androidKeyboardInset = Platform.OS === "android" ? keyboardInset : 0;

  return (
    <Modal visible={Boolean(selectedSale)} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={KEYBOARD_AVOIDING_BEHAVIOR} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
        <View style={[styles.modalBackdrop, androidKeyboardInset > 0 && styles.modalBackdropWithKeyboard, androidKeyboardInset > 0 && { paddingBottom: androidKeyboardInset + MODAL_SAFE_BOTTOM_PADDING }]}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.headerText}>
                <Text style={styles.modalTitle}>Registrar abono</Text>
                <Text style={styles.selectedMeta}>{selectedSale ? documentNumber(selectedSale, issuer) : ""}</Text>
              </View>
              <Pressable style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeText}>Cerrar</Text>
              </Pressable>
            </View>
            {selectedSale ? (
              <ScrollView
                contentContainerStyle={[styles.modalContent, androidKeyboardInset > 0 && { paddingBottom: androidKeyboardInset + MODAL_KEYBOARD_CONTENT_BOTTOM_PADDING }]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              >
                <View style={styles.selectedBox}>
                  <Text style={styles.selectedTitle}>{selectedClient?.name || "Cliente"}</Text>
                  <Text style={styles.selectedMeta}>
                    Saldo pendiente $${money(creditBalance(selectedSale))}
                    {selectedSale.creditDueDate ? ` | vence ${formatShortDate(selectedSale.creditDueDate)}` : ""}
                  </Text>
                </View>
                <Input label="Valor abonado" value={amountText} onChangeText={(value) => onAmountChange(sanitizeDecimalInput(value))} keyboardType="decimal-pad" />
                <Select
                  label="Forma de cobro"
                  value={paymentMethod}
                  options={paymentOptions.map((option) => ({ label: option.label, value: option.value }))}
                  onChange={(value) => onPaymentMethodChange(value as PaymentMethod)}
                />
                <Input label="Nota" value={note} onChangeText={onNoteChange} placeholder="Ej. transferencia, recibo, observacion" />
                <PrimaryButton disabled={submitting} label={submitting ? "Registrando..." : "Registrar abono"} icon="cash-plus" onPress={onSave} />
              </ScrollView>
            ) : null}
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    paddingHorizontal: MODAL_EDGE_PADDING,
    paddingTop: MODAL_EDGE_PADDING,
    paddingBottom: MODAL_SAFE_BOTTOM_PADDING
  },
  modalBackdropWithKeyboard: {
    justifyContent: "flex-end"
  },
  modalCard: {
    maxHeight: "88%",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#dbe5ef"
  },
  modalHeader: {
    minHeight: 62,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  headerText: {
    flex: 1,
    minWidth: 0
  },
  modalTitle: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "900"
  },
  modalContent: {
    padding: 12,
    paddingBottom: MODAL_KEYBOARD_CONTENT_BOTTOM_PADDING,
    gap: 10
  },
  closeButton: {
    borderWidth: 1,
    borderColor: "#0f766e",
    borderRadius: 8,
    minHeight: 36,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f0fdfa"
  },
  closeText: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "900"
  },
  selectedBox: {
    borderWidth: 1,
    borderColor: "#bbf7d0",
    backgroundColor: "#f0fdf4",
    borderRadius: 8,
    padding: 10,
    gap: 3
  },
  selectedTitle: {
    color: "#111827",
    fontWeight: "900"
  },
  selectedMeta: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700"
  }
});
