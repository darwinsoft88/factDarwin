import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { calculateLineDiscount, calculateLineSubtotal, calculateLineTax, calculateLineTotal, grossToNetUnitPrice, money } from "../services/sri";
import { SaleItem } from "../types";
import { parseDecimal } from "../utils/numbers";
import { Input, PrimaryButton, Select } from "./common";

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
  onSave: () => void;
  onClose: () => void;
};

export function SaleLineEditor({ visible, item, form, onChange, onSave, onClose }: SaleLineEditorProps) {
  const quantity = Math.max(0, parseDecimal(form.quantity) || 0);
  const grossPrice = Math.max(0, parseDecimal(form.unitGrossPrice) || 0);
  const discountValue = Math.max(0, parseDecimal(form.grossDiscount) || 0);
  const grossDiscount = form.discountMode === "percent" ? grossPrice * quantity * discountValue / 100 : discountValue;
  const unitPrice = item ? grossToNetUnitPrice(grossPrice, item.ivaRate) : 0;
  const discount = item ? grossToNetUnitPrice(grossDiscount, item.ivaRate) : 0;
  const previewItem = item ? { ...item, quantity, unitPrice, discount } : undefined;

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
            <Input label="Cantidad" value={form.quantity} onChangeText={(value) => onChange({ ...form, quantity: value })} keyboardType="decimal-pad" />
            <Input label="Precio publico" value={form.unitGrossPrice} onChangeText={(value) => onChange({ ...form, unitGrossPrice: value })} keyboardType="decimal-pad" />
            <Select
              label="Tipo de descuento"
              value={form.discountMode}
              onChange={(value) => onChange({ ...form, discountMode: value as "amount" | "percent" })}
              options={[
                { label: "Valor $", value: "amount" },
                { label: "Porcentaje %", value: "percent" }
              ]}
            />
            <Input label={form.discountMode === "percent" ? "Descuento %" : "Descuento publico"} value={form.grossDiscount} onChangeText={(value) => onChange({ ...form, grossDiscount: value })} keyboardType="decimal-pad" />
            {previewItem ? (
              <View style={styles.creditTotalsBox}>
                <Text style={styles.totalLine}>Base: ${money(calculateLineSubtotal(previewItem))}</Text>
                <Text style={styles.totalLine}>Descuento: ${money(calculateLineDiscount(previewItem))}</Text>
                <Text style={styles.totalLine}>IVA: ${money(calculateLineTax(previewItem))}</Text>
                <Text style={styles.totalStrong}>Total linea: ${money(calculateLineTotal(previewItem))}</Text>
              </View>
            ) : null}
            <PrimaryButton label="Guardar cambio" onPress={onSave} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

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
