import React from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KEYBOARD_AVOIDING_BEHAVIOR, MODAL_EDGE_PADDING, MODAL_KEYBOARD_CONTENT_BOTTOM_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { useKeyboardInset } from "../hooks/useKeyboardInset";
import { calculateLineTotal, money } from "../sri";
import { Issuer, Sale } from "../types";
import { documentNumber } from "../utils/documents";
import { parseDecimal, sanitizeDecimalInput } from "../utils/numbers";
import { buildCreditNoteItem, formatQuantity, getCreditLineAvailable, getCreditLineKey } from "../utils/sales";
import { Input, PrimaryButton } from "./common";
import { useAppTheme } from "../theme/AppTheme";

type CreditNoteTotals = {
  subtotal: number;
  tax: number;
  total: number;
};

type CreditNoteModalProps = {
  source?: Sale;
  issuer: Issuer;
  sales: Sale[];
  reason: string;
  quantities: Record<string, string>;
  totals: CreditNoteTotals;
  issuing: boolean;
  onReasonChange: (value: string) => void;
  onQuantityChange: (lineKey: string, value: string) => void;
  onSelectAll: () => void;
  onClose: () => void;
  onIssue: () => void;
};

export function CreditNoteModal({
  source,
  issuer,
  sales,
  reason,
  quantities,
  totals,
  issuing,
  onReasonChange,
  onQuantityChange,
  onSelectAll,
  onClose,
  onIssue
}: CreditNoteModalProps) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const keyboardInset = useKeyboardInset();
  const androidKeyboardInset = Platform.OS === "android" ? keyboardInset : 0;
  const safeTopPadding = Platform.OS === "web" ? MODAL_EDGE_PADDING : Math.max(insets.top, MODAL_EDGE_PADDING);
  const safeBottomPadding = Platform.OS === "web" ? MODAL_SAFE_BOTTOM_PADDING : Math.max(insets.bottom, MODAL_SAFE_BOTTOM_PADDING);
  const adaptiveMaxHeight = Math.max(320, windowHeight - safeTopPadding - safeBottomPadding);

  return (
    <Modal visible={Boolean(source)} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={KEYBOARD_AVOIDING_BEHAVIOR} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
        <View style={[styles.creditModalBackdrop, Platform.OS !== "web" && { paddingTop: safeTopPadding, paddingBottom: safeBottomPadding }, androidKeyboardInset > 0 && { paddingBottom: androidKeyboardInset + safeBottomPadding }]}>
          <View style={[styles.creditModal, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, Platform.OS !== "web" && { maxHeight: adaptiveMaxHeight, flexShrink: 1 }]}>
            <View style={[styles.creditModalHeader, { borderBottomColor: theme.colors.border }]}>
              <View style={styles.flex}>
                <Text style={[styles.creditModalTitle, { color: theme.colors.text }]}>Nota de credito</Text>
                <Text style={[styles.creditModalMeta, { color: theme.colors.textMuted }]}>{source ? `Factura ${documentNumber(source, issuer)}` : ""}</Text>
              </View>
              <Pressable style={[styles.smallButton, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }]} onPress={onClose}>
                <Text style={[styles.smallButtonText, { color: theme.colors.primary }]}>Cerrar</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={[styles.creditModalContent, androidKeyboardInset > 0 && { paddingBottom: androidKeyboardInset + MODAL_KEYBOARD_CONTENT_BOTTOM_PADDING }]} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}>
              <Input label="Motivo" value={reason} onChangeText={onReasonChange} placeholder="Ej: devolucion parcial" />
              <Pressable style={[styles.creditSelectAllButton, { backgroundColor: theme.colors.infoSoft }]} onPress={onSelectAll}>
                <Text style={[styles.creditSelectAllText, { color: theme.colors.info }]}>Seleccionar todo disponible</Text>
              </Pressable>
              {source?.items.map((item, index) => {
                const lineKey = getCreditLineKey(item, index);
                const available = getCreditLineAvailable(sales, source, item, index);
                const selectedQuantity = Math.max(0, parseDecimal(quantities[lineKey] || "0") || 0);
                const selectedItem = selectedQuantity > 0 ? buildCreditNoteItem(item, selectedQuantity, lineKey) : undefined;
                return (
                  <View key={lineKey} style={[styles.creditLineCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted }]}>
                    <Text style={[styles.creditLineTitle, { color: theme.colors.text }]}>{item.code} - {item.name}</Text>
                    <Text style={[styles.creditLineMeta, { color: theme.colors.textMuted }]}>Facturado: {formatQuantity(item.quantity)} | Disponible: {formatQuantity(available)} | Total linea: ${money(calculateLineTotal(item))}</Text>
                    <View style={styles.row}>
                      <View style={styles.flex}>
                        <Input
                          label="Cantidad a devolver"
                          value={quantities[lineKey] || ""}
                          onChangeText={(value) => onQuantityChange(lineKey, sanitizeDecimalInput(value))}
                          placeholder="0"
                          keyboardType="decimal-pad"
                        />
                      </View>
                      <View style={[styles.creditLineTotalBox, { backgroundColor: theme.colors.primarySoft }]}>
                        <Text style={[styles.creditLineMeta, { color: theme.colors.textMuted }]}>Valor</Text>
                        <Text style={[styles.creditLineTotal, { color: theme.colors.primary }]}>{selectedItem ? `$${money(calculateLineTotal(selectedItem))}` : "$0.00"}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
              <View style={[styles.creditTotalsBox, { backgroundColor: theme.colors.primarySoft }]}>
                <Text style={[styles.totalLine, { color: theme.colors.textMuted }]}>Subtotal: ${money(totals.subtotal)}</Text>
                <Text style={[styles.totalLine, { color: theme.colors.textMuted }]}>IVA: ${money(totals.tax)}</Text>
                <Text style={[styles.totalStrong, { color: theme.colors.text }]}>Total nota credito: ${money(totals.total)}</Text>
              </View>
              <PrimaryButton label={issuing ? "Procesando..." : "Emitir nota de credito"} onPress={issuing ? () => undefined : onIssue} />
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
  creditSelectAllButton: {
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  creditSelectAllText: {
    color: "#3730a3",
    fontWeight: "900"
  },
  creditLineCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 10,
    gap: 8,
    backgroundColor: "#f8fafc"
  },
  creditLineTitle: {
    color: "#111827",
    fontWeight: "900"
  },
  creditLineMeta: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: 10
  },
  creditLineTotalBox: {
    minWidth: 100,
    borderRadius: 8,
    backgroundColor: "#ecfdf5",
    padding: 10,
    gap: 2
  },
  creditLineTotal: {
    color: "#0f766e",
    fontWeight: "900",
    fontSize: 16
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
