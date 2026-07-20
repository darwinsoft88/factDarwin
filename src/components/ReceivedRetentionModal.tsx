import React from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { KEYBOARD_AVOIDING_BEHAVIOR, MODAL_EDGE_PADDING, MODAL_KEYBOARD_CONTENT_BOTTOM_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { retentionTaxOptions } from "../constants/options";
import { money } from "../sri";
import { Issuer, RetentionTaxType, Sale } from "../types";
import { documentNumber } from "../utils/documents";
import { parseDecimal, sanitizeDecimalInput, sanitizeIntegerInput } from "../utils/numbers";
import { Input, PrimaryButton, Select } from "./common";

type CalendarDateInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allowClear?: boolean;
};

type ReceivedRetentionModalProps = {
  sale?: Sale;
  clientName?: string;
  issuer: Issuer;
  taxType: RetentionTaxType;
  documentNumberText: string;
  authorizationNumber: string;
  receivedAt: string;
  base: string;
  percentage: string;
  amount: string;
  notes: string;
  CalendarDateInputComponent: React.ComponentType<CalendarDateInputProps>;
  onTaxTypeChange: (value: RetentionTaxType) => void;
  onDocumentNumberChange: (value: string) => void;
  onAuthorizationNumberChange: (value: string) => void;
  onReceivedAtChange: (value: string) => void;
  onBaseChange: (value: string) => void;
  onPercentageChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
};

export function ReceivedRetentionModal({
  sale,
  clientName,
  issuer,
  taxType,
  documentNumberText,
  authorizationNumber,
  receivedAt,
  base,
  percentage,
  amount,
  notes,
  CalendarDateInputComponent,
  onTaxTypeChange,
  onDocumentNumberChange,
  onAuthorizationNumberChange,
  onReceivedAtChange,
  onBaseChange,
  onPercentageChange,
  onAmountChange,
  onNotesChange,
  onClose,
  onSave
}: ReceivedRetentionModalProps) {
  const baseValue = parseDecimal(base || "0") || 0;
  const percentageValue = parseDecimal(percentage || "0") || 0;

  return (
    <Modal visible={Boolean(sale)} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={KEYBOARD_AVOIDING_BEHAVIOR} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
        <View style={styles.creditModalBackdrop}>
          <View style={styles.creditModal}>
            <View style={styles.creditModalHeader}>
              <View style={styles.flex}>
                <Text style={styles.creditModalTitle}>Retencion recibida</Text>
                <Text style={styles.creditModalMeta}>{sale ? `Factura ${documentNumber(sale, issuer)} | ${clientName || "Cliente"}` : ""}</Text>
              </View>
              <Pressable style={styles.smallButton} onPress={onClose}>
                <Text style={styles.smallButtonText}>Cerrar</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.creditModalContent} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}>
              <Select label="Impuesto retenido" value={taxType} onChange={(value) => onTaxTypeChange(value as RetentionTaxType)} options={retentionTaxOptions} />
              <Input label="No. comprobante recibido" value={documentNumberText} onChangeText={onDocumentNumberChange} placeholder="Ej: 001-001-000000123" />
              <Input label="Autorizacion" value={authorizationNumber} onChangeText={(value) => onAuthorizationNumberChange(sanitizeIntegerInput(value))} placeholder="Opcional" keyboardType="number-pad" />
              <CalendarDateInputComponent label="Fecha recepcion" value={receivedAt} onChange={onReceivedAtChange} />
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Input label="Base" value={base} onChangeText={(value) => onBaseChange(sanitizeDecimalInput(value))} keyboardType="decimal-pad" />
                </View>
                <View style={styles.flex}>
                  <Input label="Porcentaje" value={percentage} onChangeText={(value) => onPercentageChange(sanitizeDecimalInput(value))} keyboardType="decimal-pad" />
                </View>
              </View>
              <Input label="Valor retenido" value={amount} onChangeText={(value) => onAmountChange(sanitizeDecimalInput(value))} placeholder="Se calcula si lo deja vacio" keyboardType="decimal-pad" />
              <Input label="Notas" value={notes} onChangeText={onNotesChange} placeholder="Opcional" />
              <View style={styles.creditTotalsBox}>
                <Text style={styles.totalLine}>Base: ${money(baseValue)}</Text>
                <Text style={styles.totalLine}>Porcentaje: {money(percentageValue)}%</Text>
                <Text style={styles.totalStrong}>Valor estimado: ${money(baseValue * (percentageValue / 100))}</Text>
              </View>
              <PrimaryButton label="Guardar retencion" onPress={onSave} />
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
  creditModal: {
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
  },
  creditTotalsBox: {
    borderRadius: 8,
    backgroundColor: "#ecfdf5",
    padding: 12,
    gap: 4
  },
  totalLine: {
    color: "#374151",
    textAlign: "right"
  },
  totalStrong: {
    color: "#111827",
    fontWeight: "900",
    textAlign: "right",
    fontSize: 18
  }
});
