import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Product } from "../types";
import { productMinStock } from "../utils/accounting";
import { formatQuantity } from "../utils/sales";

type SaleProductControlsProps = {
  product?: Product;
  lowStock: boolean;
  projectedStock: number;
};

export function SaleProductControls({
  product,
  lowStock,
  projectedStock
}: SaleProductControlsProps) {
  return (
    <>
      {lowStock ? (
        <View style={styles.stockWarningBox}>
          <Text style={styles.stockWarningText}>Stock bajo: quedaria {formatQuantity(projectedStock)}. Minimo configurado {product ? productMinStock(product) : 0}.</Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
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
});
