import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { calculateLineDiscount, calculateLineSubtotal, calculateLineTax, calculateLineTotal, grossToNetUnitPrice, money } from "../services/sri";
import { Product } from "../types";
import { productCost } from "../utils/accounting";
import { parseDecimal } from "../utils/numbers";
import { Input, PrimaryButton, Select } from "./common";

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
  onAdd: () => void;
  onClose: () => void;
};

export function ProductPriceOptionsModal({
  visible,
  product,
  quantity,
  unitGrossPrice,
  grossDiscount,
  discountMode,
  onQuantityChange,
  onUnitGrossPriceChange,
  onGrossDiscountChange,
  onDiscountModeChange,
  onAdd,
  onClose
}: ProductPriceOptionsModalProps) {
  const qty = Math.max(0, parseDecimal(quantity) || 0);
  const grossPrice = Math.max(0, parseDecimal(unitGrossPrice) || 0);
  const discountValue = Math.max(0, parseDecimal(grossDiscount) || 0);
  const grossDiscountValue = discountMode === "percent" ? grossPrice * qty * discountValue / 100 : discountValue;
  const unitPrice = product ? grossToNetUnitPrice(grossPrice, product.ivaRate) : 0;
  const discount = product ? grossToNetUnitPrice(grossDiscountValue, product.ivaRate) : 0;
  const previewItem = product ? {
    productId: product.id,
    code: product.code,
    name: product.name,
    quantity: qty,
    unitPrice,
    cost: productCost(product),
    discount,
    ivaRate: product.ivaRate
  } : undefined;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.creditModalBackdrop}>
        <View style={styles.quickClientModal}>
          <View style={styles.creditModalHeader}>
            <View style={styles.flex}>
              <Text style={styles.creditModalTitle}>Precio y descuento</Text>
              <Text style={styles.creditModalMeta}>{product ? `${product.code} - ${product.name}` : "Seleccione producto"}</Text>
            </View>
            <Pressable style={styles.smallButton} onPress={onClose}>
              <Text style={styles.smallButtonText}>Cerrar</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.creditModalContent} keyboardShouldPersistTaps="handled">
            <Input label="Cantidad" value={quantity} onChangeText={onQuantityChange} keyboardType="decimal-pad" />
            <Input label="Precio publico" value={unitGrossPrice} onChangeText={onUnitGrossPriceChange} keyboardType="decimal-pad" />
            <Select
              label="Tipo de descuento"
              value={discountMode}
              onChange={(value) => onDiscountModeChange(value as "amount" | "percent")}
              options={[
                { label: "Valor $", value: "amount" },
                { label: "Porcentaje %", value: "percent" }
              ]}
            />
            <Input label={discountMode === "percent" ? "Descuento %" : "Descuento publico"} value={grossDiscount} onChangeText={onGrossDiscountChange} keyboardType="decimal-pad" />
            {previewItem ? (
              <View style={styles.creditTotalsBox}>
                <Text style={styles.totalLine}>Base: ${money(calculateLineSubtotal(previewItem))}</Text>
                <Text style={styles.totalLine}>Descuento: ${money(calculateLineDiscount(previewItem))}</Text>
                <Text style={styles.totalLine}>IVA: ${money(calculateLineTax(previewItem))}</Text>
                <Text style={styles.totalStrong}>Total linea: ${money(calculateLineTotal(previewItem))}</Text>
              </View>
            ) : null}
            <PrimaryButton label="Agregar producto" onPress={onAdd} />
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
