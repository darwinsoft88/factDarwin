import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { money } from "../services/sri";
import { Product } from "../types";
import { productMinStock } from "../utils/accounting";
import { formatQuantity } from "../utils/sales";

type SaleProductControlsProps = {
  product?: Product;
  quantity: string;
  currentQty: number;
  currentGrossPrice: number;
  currentGrossDiscount: number;
  currentGrossLineTotal: number;
  lowStock: boolean;
  projectedStock: number;
  onQuantityChange: (value: string) => void;
  onAdjustQuantity: (amount: number) => void;
  onOpenPriceOptions: () => void;
  onAdd: () => void;
};

export function SaleProductControls({
  product,
  quantity,
  currentQty,
  currentGrossPrice,
  currentGrossDiscount,
  currentGrossLineTotal,
  lowStock,
  projectedStock,
  onQuantityChange,
  onAdjustQuantity,
  onOpenPriceOptions,
  onAdd
}: SaleProductControlsProps) {
  return (
    <>
      <View style={styles.saleControlsRow}>
        <View style={styles.quantityBlock}>
          <Text style={styles.label}>Cantidad</Text>
          <View style={styles.quantityStepper}>
            <Pressable style={styles.stepperButton} onPress={() => onAdjustQuantity(-1)}>
              <Text style={styles.stepperButtonText}>-</Text>
            </Pressable>
            <TextInput style={styles.stepperInput} value={quantity} onChangeText={onQuantityChange} keyboardType="decimal-pad" placeholderTextColor="#7d8796" />
            <Pressable style={styles.stepperButton} onPress={() => onAdjustQuantity(1)}>
              <Text style={styles.stepperButtonText}>+</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.flex}>
          <Text style={[styles.label, styles.optionsLabel]}>Opciones</Text>
          <Pressable style={styles.secondaryActionButton} onPress={onOpenPriceOptions}>
            <Text style={styles.secondaryActionText}>Precio / descuento</Text>
          </Pressable>
        </View>
      </View>
      {lowStock ? (
        <View style={styles.stockWarningBox}>
          <Text style={styles.stockWarningText}>Stock bajo: quedaria {formatQuantity(projectedStock)}. Minimo configurado {product ? productMinStock(product) : 0}.</Text>
        </View>
      ) : null}
      {product ? (
        <View style={styles.taxPreview}>
          <Text style={styles.taxPreviewText}>
            Cant. {formatQuantity(currentQty)} | Total estimado ${money(currentGrossLineTotal - currentGrossDiscount)}
          </Text>
          <Text style={styles.taxPreviewText}>Precio ${money(currentGrossPrice || product.price)} | Desc. ${money(currentGrossDiscount)}</Text>
        </View>
      ) : null}
      <Pressable style={styles.addButton} onPress={onAdd}>
        <Text style={styles.addButtonText}>Agregar a la venta</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  saleControlsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8
  },
  quantityBlock: {
    width: 152,
    flexShrink: 0,
    gap: 6
  },
  label: {
    fontSize: 12,
    color: "#4b5563",
    fontWeight: "700"
  },
  quantityStepper: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center"
  },
  stepperButton: {
    width: 38,
    flexShrink: 0,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eef2ff"
  },
  stepperButtonText: {
    color: "#1d4ed8",
    fontSize: 20,
    fontWeight: "900"
  },
  stepperInput: {
    flex: 1,
    minWidth: 42,
    minHeight: 44,
    textAlign: "center",
    color: "#111827",
    fontWeight: "900",
    backgroundColor: "#ffffff"
  },
  flex: {
    flex: 1,
    minWidth: 130
  },
  optionsLabel: {
    paddingLeft: 2,
    marginBottom: 6
  },
  secondaryActionButton: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  secondaryActionText: {
    color: "#0f5f59",
    fontSize: 12,
    fontWeight: "900"
  },
  stockWarningBox: {
    borderWidth: 1,
    borderColor: "#fbbf24",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#fffbeb"
  },
  stockWarningText: {
    color: "#92400e",
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 17
  },
  taxPreview: {
    borderWidth: 1,
    borderColor: "#bae6fd",
    borderRadius: 8,
    padding: 9,
    backgroundColor: "#f0f9ff"
  },
  taxPreviewText: {
    color: "#075985",
    fontSize: 12,
    fontWeight: "800"
  },
  addButton: {
    flexGrow: 1,
    minWidth: 96,
    height: 46,
    borderRadius: 8,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14
  },
  addButtonText: {
    color: "#ffffff",
    fontWeight: "800"
  }
});
