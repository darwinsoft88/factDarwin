import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Empty, Input, PrimaryButton, Select } from "./common";
import { PaginationControls } from "./PaginationControls";
import { LIST_BATCH_SIZE } from "../constants/app";
import { KEYBOARD_AVOIDING_BEHAVIOR, MODAL_EDGE_PADDING, MODAL_KEYBOARD_CONTENT_BOTTOM_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { paymentOptions } from "../constants/options";
import { useKeyboardInset } from "../hooks/useKeyboardInset";
import { money } from "../sri";
import { AppData, Client, PaymentMethod, Sale } from "../types";
import { creditBalance, creditSaleScopeText } from "../utils/credit";
import { documentNumber } from "../utils/documents";
import { formatShortDate } from "../utils/format";
import { AppToast } from "./AppToast";

type CreditBulkPaymentModalProps = {
  bulkClient?: Client;
  bulkAmountText: string;
  bulkNote: string;
  bulkPaymentMethod: PaymentMethod;
  bulkSales: Sale[];
  bulkSelectedSaleIds: string[];
  bulkSelectedTotal: number;
  data: AppData;
  onClose: () => void;
  onAmountChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onPaymentMethodChange: (value: PaymentMethod) => void;
  onSave: () => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onToggleSale: (saleId: string) => void;
  page: number;
  submitting?: boolean;
  visible: boolean;
  visibleBulkSales: Sale[];
};

export function CreditBulkPaymentModal({
  bulkClient,
  bulkAmountText,
  bulkNote,
  bulkPaymentMethod,
  bulkSales,
  bulkSelectedSaleIds,
  bulkSelectedTotal,
  data,
  onClose,
  onAmountChange,
  onNoteChange,
  onPageChange,
  onPaymentMethodChange,
  onSave,
  onSelectAll,
  onSelectNone,
  onToggleSale,
  page,
  submitting = false,
  visible,
  visibleBulkSales
}: CreditBulkPaymentModalProps) {
  const keyboardInset = useKeyboardInset();
  const androidKeyboardInset = Platform.OS === "android" ? keyboardInset : 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={KEYBOARD_AVOIDING_BEHAVIOR} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
        <View style={[styles.modalBackdrop, androidKeyboardInset > 0 && styles.modalBackdropWithKeyboard, androidKeyboardInset > 0 && { paddingBottom: androidKeyboardInset + MODAL_SAFE_BOTTOM_PADDING }]}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.headerText}>
                <Text style={styles.modalTitle}>Cobro multiple</Text>
                <Text style={styles.selectedMeta}>{bulkClient?.name || "Cliente"}</Text>
              </View>
              <Pressable style={styles.closeButton} onPress={onClose}>
                <Text style={styles.closeText}>Cerrar</Text>
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={[styles.modalContent, androidKeyboardInset > 0 && { paddingBottom: androidKeyboardInset + MODAL_KEYBOARD_CONTENT_BOTTOM_PADDING }]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            >
              <View style={styles.selectedBox}>
                <Text style={styles.selectedTitle}>{bulkSelectedSaleIds.length} factura(s) seleccionada(s)</Text>
                <Text style={styles.selectedMeta}>Total a cobrar $${money(bulkSelectedTotal)}</Text>
              </View>
              <Input
                label="Valor a abonar"
                value={bulkAmountText}
                onChangeText={onAmountChange}
                placeholder={`Maximo $${money(bulkSelectedTotal)}`}
                keyboardType="decimal-pad"
              />
              <View style={styles.bulkActions}>
                <Pressable style={styles.secondaryAction} onPress={onSelectAll}>
                  <MaterialCommunityIcons name="checkbox-multiple-marked-outline" size={16} color="#0f766e" />
                  <Text style={styles.secondaryActionText}>Todas</Text>
                </Pressable>
                <Pressable style={styles.secondaryAction} onPress={onSelectNone}>
                  <MaterialCommunityIcons name="checkbox-blank-off-outline" size={16} color="#0f766e" />
                  <Text style={styles.secondaryActionText}>Limpiar</Text>
                </Pressable>
              </View>
              <View style={styles.itemsBox}>
                <Text style={styles.itemsTitle}>Facturas pendientes</Text>
                {bulkSales.length === 0 ? <Empty text="Este cliente no tiene facturas pendientes." /> : null}
                {visibleBulkSales.map((sale) => {
                  const checked = bulkSelectedSaleIds.includes(sale.id);
                  return (
                    <Pressable key={sale.id} style={[styles.bulkSaleRow, checked && styles.bulkSaleRowActive]} onPress={() => onToggleSale(sale.id)}>
                      <View style={[styles.checkBox, checked && styles.checkBoxActive]}>
                        <MaterialCommunityIcons name={checked ? "check" : "plus"} size={15} color={checked ? "#ffffff" : "#0f766e"} />
                      </View>
                      <View style={styles.itemTextBox}>
                        <Text style={styles.itemName}>{documentNumber(sale, data.issuer)}</Text>
                        <Text style={styles.itemMeta} numberOfLines={2}>
                          {(sale.creditDueDate ? `Vence ${formatShortDate(sale.creditDueDate)}` : `Emitida ${formatShortDate(sale.createdAt)}`)} | {creditSaleScopeText(sale, data)}
                        </Text>
                      </View>
                      <Text style={styles.itemTotal}>${money(creditBalance(sale))}</Text>
                    </Pressable>
                  );
                })}
                <PaginationControls page={page} pageSize={LIST_BATCH_SIZE} totalItems={bulkSales.length} onPageChange={onPageChange} />
              </View>
              <Select
                label="Forma de cobro"
                value={bulkPaymentMethod}
                options={paymentOptions.map((option) => ({ label: option.label, value: option.value }))}
                onChange={(value) => onPaymentMethodChange(value as PaymentMethod)}
              />
              <Input label="Nota" value={bulkNote} onChangeText={onNoteChange} placeholder="Ej. transferencia, recibo, observacion" />
              <PrimaryButton
                disabled={submitting}
                label={submitting ? "Registrando..." : `Registrar cobro $${bulkAmountText.trim() || money(bulkSelectedTotal)}`}
                icon="cash-multiple"
                onPress={onSave}
              />
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
  },
  bulkActions: {
    flexDirection: "row",
    gap: 8
  },
  secondaryAction: {
    flex: 1,
    minHeight: 38,
    borderWidth: 1,
    borderColor: "#b8e7df",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    backgroundColor: "#ffffff"
  },
  secondaryActionText: {
    color: "#0f766e",
    fontWeight: "900"
  },
  itemsBox: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 10,
    gap: 8,
    backgroundColor: "#ffffff"
  },
  itemsTitle: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "900"
  },
  bulkSaleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 9,
    backgroundColor: "#ffffff"
  },
  bulkSaleRowActive: {
    borderColor: "#86efac",
    backgroundColor: "#f0fdf4"
  },
  checkBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#99f6e4",
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center"
  },
  checkBoxActive: {
    borderColor: "#0f766e",
    backgroundColor: "#0f766e"
  },
  itemTextBox: {
    flex: 1,
    minWidth: 0
  },
  itemName: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "900"
  },
  itemMeta: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2
  },
  itemTotal: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "900"
  }
});
