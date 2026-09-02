import React, { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KEYBOARD_AVOIDING_BEHAVIOR, MODAL_EDGE_PADDING, MODAL_KEYBOARD_CONTENT_BOTTOM_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { useKeyboardInset } from "../hooks/useKeyboardInset";
import { calculateLineSubtotal, calculateLineTax, calculateLineTotal, grossToNetUnitPrice, money } from "../sri";
import { Product } from "../types";
import { productCost } from "../utils/accounting";
import { parseDecimal, sanitizeDecimalInput } from "../utils/numbers";
import { PrimaryButton, Select } from "./common";
import { useAppTheme } from "../theme/AppTheme";

type ProductPriceOptionsModalProps = {
  visible: boolean;
  product?: Product;
  quantity: string;
  unitGrossPrice: string;
  grossDiscount: string;
  discountMode: "amount" | "percent";
  onQuantityChange: (value: string) => void;
  onUnitGrossPriceChange: (value: string) => void;
  onGrossDiscountChange: (value: string) => void;
  onDiscountModeChange: (value: "amount" | "percent") => void;
  onAdd: (draft?: { quantity: string; unitGrossPrice: string; grossDiscount: string; discountMode: "amount" | "percent" }) => void;
  onClose: () => void;
};

export function ProductPriceOptionsModal({
  visible,
  product,
  quantity,
  unitGrossPrice,
  grossDiscount,
  discountMode,
  onAdd,
  onClose
}: ProductPriceOptionsModalProps) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const keyboardInset = useKeyboardInset();
  const androidKeyboardInset = Platform.OS === "android" ? keyboardInset : 0;
  const safeTopPadding = Platform.OS === "web" ? MODAL_EDGE_PADDING : Math.max(insets.top, MODAL_EDGE_PADDING);
  const safeBottomPadding = Platform.OS === "web" ? MODAL_SAFE_BOTTOM_PADDING : Math.max(insets.bottom, MODAL_SAFE_BOTTOM_PADDING);
  const adaptiveMaxHeight = Math.max(320, windowHeight - safeTopPadding - safeBottomPadding);
  const [draft, setDraft] = useState({ quantity, unitGrossPrice, grossDiscount, discountMode });
  const initializedForProductRef = useRef("");

  useEffect(() => {
    if (!visible) return;
    const productKey = product?.id || "";
    if (initializedForProductRef.current === productKey) return;
    initializedForProductRef.current = productKey;
    setDraft({ quantity, unitGrossPrice, grossDiscount, discountMode });
  }, [discountMode, grossDiscount, product?.id, quantity, unitGrossPrice, visible]);

  useEffect(() => {
    if (visible) return;
    initializedForProductRef.current = "";
  }, [visible]);

  const qty = Math.max(0, parseDecimal(draft.quantity) || 0);
  const grossPrice = Math.max(0, parseDecimal(draft.unitGrossPrice) || 0);
  const discountValue = Math.max(0, parseDecimal(draft.grossDiscount) || 0);
  const ivaRate = Number.isFinite(Number(product?.ivaRate)) ? Number(product?.ivaRate) : 0;
  const grossLineBeforeDiscount = grossPrice * qty;
  const grossDiscountValue = Math.min(grossLineBeforeDiscount, draft.discountMode === "percent" ? grossLineBeforeDiscount * discountValue / 100 : discountValue);
  const unitPrice = product ? grossToNetUnitPrice(grossPrice, ivaRate) : 0;
  const discount = product ? grossToNetUnitPrice(grossDiscountValue, ivaRate) : 0;
  const previewItem = product ? {
    productId: product.id,
    code: product.code,
    name: product.name,
    quantity: qty,
    unitPrice,
    cost: productCost(product),
    discount,
    ivaRate
  } : undefined;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={KEYBOARD_AVOIDING_BEHAVIOR} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
        <View style={[styles.creditModalBackdrop, Platform.OS !== "web" && { paddingTop: safeTopPadding, paddingBottom: safeBottomPadding }, androidKeyboardInset > 0 && { paddingBottom: androidKeyboardInset + safeBottomPadding }]}>
          <View style={[styles.quickClientModal, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, Platform.OS !== "web" && { maxHeight: adaptiveMaxHeight, flexShrink: 1 }]}>
            <View style={[styles.creditModalHeader, { borderBottomColor: theme.colors.border }]}>
              <View style={styles.flex}>
                <Text style={[styles.creditModalTitle, { color: theme.colors.text }]}>Precio y descuento</Text>
                <Text style={[styles.creditModalMeta, { color: theme.colors.textMuted }]}>{product ? `${product.code} - ${product.name}` : "Seleccione producto"}</Text>
              </View>
              <Pressable style={[styles.smallButton, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }]} onPress={onClose}>
                <Text style={[styles.smallButtonText, { color: theme.colors.primary }]}>Cerrar</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={[styles.creditModalContent, androidKeyboardInset > 0 && { paddingBottom: androidKeyboardInset + MODAL_KEYBOARD_CONTENT_BOTTOM_PADDING }]} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}>
              <DraftNumberInput label="Cantidad" value={draft.quantity} onChange={(value) => setDraft((current) => ({ ...current, quantity: value }))} />
              <DraftNumberInput label="Precio publico" value={draft.unitGrossPrice} onChange={(value) => setDraft((current) => ({ ...current, unitGrossPrice: value }))} />
              <Select
                label="Tipo de descuento"
                value={draft.discountMode}
                onChange={(value) => setDraft((current) => ({ ...current, discountMode: value as "amount" | "percent" }))}
                options={[
                  { label: "Valor $", value: "amount" },
                  { label: "Porcentaje %", value: "percent" }
                ]}
              />
              <DraftNumberInput label={draft.discountMode === "percent" ? "Descuento %" : "Descuento publico"} value={draft.grossDiscount} onChange={(value) => setDraft((current) => ({ ...current, grossDiscount: value }))} />
              {previewItem ? (
                <View style={[styles.creditTotalsBox, { backgroundColor: theme.colors.primarySoft }]}>
                  <Text style={[styles.totalLine, { color: theme.colors.textMuted }]}>Base: ${money(calculateLineSubtotal(previewItem))}</Text>
                  <Text style={[styles.totalLine, { color: theme.colors.textMuted }]}>Descuento: ${money(grossDiscountValue)}</Text>
                  <Text style={[styles.totalLine, { color: theme.colors.textMuted }]}>IVA: ${money(calculateLineTax(previewItem))}</Text>
                  <Text style={[styles.totalStrong, { color: theme.colors.text }]}>Total linea: ${money(calculateLineTotal(previewItem))}</Text>
                </View>
              ) : null}
              <PrimaryButton label="Agregar producto" onPress={() => onAdd(draft)} />
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function DraftNumberInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const { theme } = useAppTheme();
  if (Platform.OS === "web") {
    return (
      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
        {React.createElement("input", {
          value,
          inputMode: "decimal",
          onInput: (event: { currentTarget?: { value?: string }; target?: { value?: string } }) => {
            const text = event.currentTarget?.value ?? event.target?.value;
            if (typeof text === "string") onChange(sanitizeDecimalInput(text));
          },
          onChange: (event: { currentTarget?: { value?: string }; target?: { value?: string } }) => {
            const text = event.currentTarget?.value ?? event.target?.value;
            if (typeof text === "string") onChange(sanitizeDecimalInput(text));
          },
          style: { ...webInputStyle, borderColor: theme.colors.borderStrong, color: theme.colors.text, backgroundColor: theme.colors.surfaceMuted, outlineColor: theme.colors.primary }
        })}
      </View>
    );
  }

  return (
    <View style={styles.inputGroup}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <TextInput
        style={[styles.input, { borderColor: theme.colors.borderStrong, color: theme.colors.text, backgroundColor: theme.colors.surfaceMuted }]}
        value={value}
        onChangeText={(value) => onChange(sanitizeDecimalInput(value))}
        onChange={(event) => {
          const text = event.nativeEvent?.text ?? (event.target as unknown as { value?: string })?.value;
          if (typeof text === "string") onChange(sanitizeDecimalInput(text));
        }}
        keyboardType="decimal-pad"
        placeholderTextColor={theme.colors.textMuted}
      />
    </View>
  );
}

const webInputStyle = {
  minHeight: 38,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "#cbd5e1",
  borderRadius: 8,
  paddingLeft: 12,
  paddingRight: 12,
  color: "#111827",
  backgroundColor: "#fbfdff",
  fontWeight: 700,
  outlineColor: "#111827"
} as const;

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
  quickClientModal: {
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
  inputGroup: {
    gap: 5
  },
  label: {
    color: "#4b5563",
    fontSize: 12,
    fontWeight: "700"
  },
  input: {
    minHeight: 38,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    color: "#111827",
    backgroundColor: "#fbfdff",
    fontWeight: "700"
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
