import React, { useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { calculateLineSubtotal, calculateLineTax, calculateLineTotal, grossToNetUnitPrice, money } from "../services/sri";
import { SaleItem } from "../types";
import { parseDecimal, sanitizeDecimalInput } from "../utils/numbers";
import { PrimaryButton, Select } from "./common";

type SaleLineEditorForm = {
  quantity: string;
  unitGrossPrice: string;
  grossDiscount: string;
  discountMode: "amount" | "percent";
};

type SaleLineEditorProps = {
  visible: boolean;
  item?: SaleItem;
  form: SaleLineEditorForm;
  onChange: (form: SaleLineEditorForm) => void;
  onSave: (draft?: SaleLineEditorForm) => void;
  onClose: () => void;
};

export function SaleLineEditor({ visible, item, form, onChange, onSave, onClose }: SaleLineEditorProps) {
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

  const updateDraft = (nextDraft: SaleLineEditorForm) => {
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.creditModalBackdrop}>
        <View style={styles.quickClientModal}>
          <View style={styles.creditModalHeader}>
            <View style={styles.flex}>
              <Text style={styles.creditModalTitle}>Editar detalle</Text>
              <Text style={styles.creditModalMeta}>{item ? `${item.code} - ${item.name}` : "Producto"}</Text>
            </View>
            <Pressable style={styles.smallButton} onPress={onClose}>
              <Text style={styles.smallButtonText}>Cerrar</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.creditModalContent} keyboardShouldPersistTaps="handled">
            <DraftNumberInput label="Cantidad" value={draft.quantity} onChange={(value) => updateDraft({ ...draft, quantity: value })} />
            <DraftNumberInput label="Precio publico" value={draft.unitGrossPrice} onChange={(value) => updateDraft({ ...draft, unitGrossPrice: value })} />
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
              <View style={styles.creditTotalsBox}>
                <Text style={styles.totalLine}>Base: ${money(calculateLineSubtotal(previewItem))}</Text>
                <Text style={styles.totalLine}>Descuento: ${money(grossDiscount)}</Text>
                <Text style={styles.totalLine}>IVA: ${money(calculateLineTax(previewItem))}</Text>
                <Text style={styles.totalStrong}>Total linea: ${money(calculateLineTotal(previewItem))}</Text>
              </View>
            ) : null}
            <PrimaryButton label="Guardar cambio" onPress={() => onSave(draft)} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DraftNumberInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  if (Platform.OS === "web") {
    return (
      <View style={styles.inputGroup}>
        <Text style={styles.label}>{label}</Text>
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
          style: webInputStyle
        })}
      </View>
    );
  }

  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={(value) => onChange(sanitizeDecimalInput(value))}
        onChange={(event) => {
          const text = event.nativeEvent?.text ?? (event.target as unknown as { value?: string })?.value;
          if (typeof text === "string") onChange(sanitizeDecimalInput(text));
        }}
        keyboardType="decimal-pad"
        placeholderTextColor="#7d8796"
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
  creditModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "flex-end",
    padding: 12
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
