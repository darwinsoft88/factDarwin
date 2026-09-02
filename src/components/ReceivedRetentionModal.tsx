import React from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KEYBOARD_AVOIDING_BEHAVIOR, MODAL_EDGE_PADDING, MODAL_KEYBOARD_CONTENT_BOTTOM_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { retentionTaxOptions } from "../constants/options";
import { useKeyboardInset } from "../hooks/useKeyboardInset";
import { money } from "../sri";
import { Issuer, RetentionTaxType, Sale } from "../types";
import { documentNumber } from "../utils/documents";
import { parseDecimal, sanitizeDecimalInput, sanitizeIntegerInput } from "../utils/numbers";
import { Input, PrimaryButton, Select } from "./common";
import { useAppTheme } from "../theme/AppTheme";
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
  saving: boolean;
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
  onSave,
  saving
}: ReceivedRetentionModalProps) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const keyboardInset = useKeyboardInset();
  const androidKeyboardInset = Platform.OS === "android" ? keyboardInset : 0;
  const safeTopPadding = Platform.OS === "web" ? MODAL_EDGE_PADDING : Math.max(insets.top, MODAL_EDGE_PADDING);
  const safeBottomPadding = Platform.OS === "web" ? MODAL_SAFE_BOTTOM_PADDING : Math.max(insets.bottom, MODAL_SAFE_BOTTOM_PADDING);
  const adaptiveMaxHeight = Math.max(320, windowHeight - safeTopPadding - safeBottomPadding);
  const baseValue = parseDecimal(base || "0") || 0;
  const percentageValue = parseDecimal(percentage || "0") || 0;

  return (
    <Modal visible={Boolean(sale)} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={KEYBOARD_AVOIDING_BEHAVIOR} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
        <View style={[styles.creditModalBackdrop, Platform.OS !== "web" && { paddingTop: safeTopPadding, paddingBottom: safeBottomPadding }, androidKeyboardInset > 0 && { paddingBottom: androidKeyboardInset + safeBottomPadding }]}>
          <View style={[styles.creditModal, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, Platform.OS !== "web" && { maxHeight: adaptiveMaxHeight, flexShrink: 1 }]}>
            <View style={[styles.creditModalHeader, { borderBottomColor: theme.colors.border }]}>
              <View style={styles.flex}>
                <Text style={[styles.creditModalTitle, { color: theme.colors.text }]}>Retencion recibida</Text>
                <Text style={[styles.creditModalMeta, { color: theme.colors.textMuted }]}>{sale ? `Factura ${documentNumber(sale, issuer)} | ${clientName || "Cliente"}` : ""}</Text>
              </View>
              <Pressable style={[styles.smallButton, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }]} onPress={onClose}>
                <Text style={[styles.smallButtonText, { color: theme.colors.primary }]}>Cerrar</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={[styles.creditModalContent, androidKeyboardInset > 0 && { paddingBottom: androidKeyboardInset + MODAL_KEYBOARD_CONTENT_BOTTOM_PADDING }]} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}>
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
              <View style={[styles.creditTotalsBox, { backgroundColor: theme.colors.primarySoft }]}>
                <Text style={[styles.totalLine, { color: theme.colors.textMuted }]}>Base: ${money(baseValue)}</Text>
                <Text style={[styles.totalLine, { color: theme.colors.textMuted }]}>Porcentaje: {money(percentageValue)}%</Text>
                <Text style={[styles.totalStrong, { color: theme.colors.text }]}>Valor estimado: ${money(baseValue * (percentageValue / 100))}</Text>
              </View>
              <PrimaryButton disabled={saving} label={saving ? "Guardando..." : "Guardar retencion"} onPress={onSave} />
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
