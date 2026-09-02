import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { calculateLineSubtotal, calculateLineTax, calculateLineTotal, grossToNetUnitPrice, money } from "../sri";
import { Product, SaleItem } from "../types";
import { parseDecimal, sanitizeDecimalInput } from "../utils/numbers";
import { EntityEditModal } from "./EntityEditModal";
import { Select } from "./common";
import { useAppTheme } from "../theme/AppTheme";
import type { LineEditForm } from "../hooks/useSaleLineEditor";
import { availableProductPrices } from "../utils/productPrices";

type SaleLineEditorProps = {
  visible: boolean;
  item?: SaleItem;
  product?: Product;
  form: LineEditForm;
  onChange: (form: LineEditForm) => void;
  onSave: (draft?: LineEditForm) => void;
  onClose: () => void;
};

export function SaleLineEditor({ visible, item, product, form, onChange, onSave, onClose }: SaleLineEditorProps) {
  const { theme } = useAppTheme();
  const [draft, setDraft] = useState(form);
  const initializedForLineRef = useRef("");

  useEffect(() => {
    if (!visible) return;
    const lineKey = item ? `${item.productId}:${item.code}:${item.name}` : "none";
    if (initializedForLineRef.current === lineKey) return;
    initializedForLineRef.current = lineKey;
    setDraft(form);
  }, [form, item, visible]);

  useEffect(() => {
    if (visible) return;
    initializedForLineRef.current = "";
  }, [visible]);

  const updateDraft = (nextDraft: LineEditForm) => {
    setDraft(nextDraft);
    onChange(nextDraft);
  };

  const quantity = Math.max(0, parseDecimal(draft.quantity) || 0);
  const grossPrice = Math.max(0, parseDecimal(draft.unitGrossPrice) || 0);
  const discountValue = Math.max(0, parseDecimal(draft.grossDiscount) || 0);
  const ivaRate = Number.isFinite(Number(item?.ivaRate)) ? Number(item?.ivaRate) : 0;
  const grossLineBeforeDiscount = grossPrice * quantity;
  const grossDiscount = Math.min(grossLineBeforeDiscount, draft.discountMode === "percent" ? grossLineBeforeDiscount * discountValue / 100 : discountValue);
  const unitPrice = item ? grossToNetUnitPrice(grossPrice, ivaRate) : 0;
  const discount = item ? grossToNetUnitPrice(grossDiscount, ivaRate) : 0;
  const previewItem = item ? { ...item, quantity, unitPrice, discount, ivaRate } : undefined;

  return (
    <EntityEditModal
      adaptiveViewport
      visible={visible}
      title="Editar detalle"
      subtitle={item ? `${item.code} - ${item.name}` : "Producto"}
      confirmLabel="Guardar cambio"
      onClose={onClose}
      onConfirm={() => onSave(draft)}
    >
      <DraftNumberInput label="Cantidad" value={draft.quantity} onChange={(value) => updateDraft({ ...draft, quantity: value })} />
      {product && availableProductPrices(product).length > 1 ? (
        <View style={styles.tierSection}>
          <Text style={[styles.label, { color: theme.colors.textMuted }]}>Lista de precio de esta línea</Text>
          <View style={styles.tierOptions}>
            {availableProductPrices(product).map((option) => {
              const active = draft.priceTier === option.tier;
              return <Pressable key={option.tier} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => updateDraft({ ...draft, priceTier: option.tier, unitGrossPrice: money(option.price) })} style={[styles.tierOption, { borderColor: active ? theme.colors.primary : theme.colors.borderStrong, backgroundColor: active ? theme.colors.primarySoft : theme.colors.surface }]}><Text style={[styles.tierOptionText, { color: active ? theme.colors.primary : theme.colors.text }]}>{active ? "✓ " : ""}{option.label} · ${money(option.price)}</Text></Pressable>;
            })}
          </View>
        </View>
      ) : null}
      <DraftNumberInput label="Precio publico" value={draft.unitGrossPrice} onChange={(value) => updateDraft({ ...draft, unitGrossPrice: value, priceTier: undefined })} />
      <Select
        label="Tipo de descuento"
        value={draft.discountMode}
        onChange={(value) => updateDraft({ ...draft, discountMode: value as "amount" | "percent" })}
        options={[
          { label: "Valor $", value: "amount" },
          { label: "Porcentaje %", value: "percent" }
        ]}
      />
      <DraftNumberInput label={draft.discountMode === "percent" ? "Descuento %" : "Descuento publico"} value={draft.grossDiscount} onChange={(value) => updateDraft({ ...draft, grossDiscount: value })} />
      {previewItem ? (
        <View style={[styles.creditTotalsBox, { backgroundColor: theme.colors.primarySoft }]}>
          <Text style={[styles.totalLine, { color: theme.colors.textMuted }]}>Base: ${money(calculateLineSubtotal(previewItem))}</Text>
          <Text style={[styles.totalLine, { color: theme.colors.textMuted }]}>Descuento: ${money(grossDiscount)}</Text>
          <Text style={[styles.totalLine, { color: theme.colors.textMuted }]}>IVA: ${money(calculateLineTax(previewItem))}</Text>
          <Text style={[styles.totalStrong, { color: theme.colors.text }]}>Total linea: ${money(calculateLineTotal(previewItem))}</Text>
        </View>
      ) : null}
    </EntityEditModal>
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
        placeholderTextColor={theme.colors.textSubtle}
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
  tierSection: { gap: 6 },
  tierOptions: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tierOption: { flexGrow: 1, minWidth: 92, minHeight: 40, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 10, alignItems: "center", justifyContent: "center" },
  tierOptionText: { fontSize: 11, fontWeight: "900" },
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
