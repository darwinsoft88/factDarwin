import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { money } from "../services/sri";
import { Product } from "../types";
import { productMinStock } from "../utils/accounting";

type SelectedProductCardProps = {
  product?: Product;
};

export function SelectedProductCard({ product }: SelectedProductCardProps) {
  if (!product) return null;

  return (
    <View style={styles.productSummaryCard}>
      <View style={styles.flex}>
        <Text style={styles.itemTitle}>{product.name}</Text>
        <Text style={styles.inlineInfo}>Stock {product.stock} | Min. {productMinStock(product)} | Publico ${money(product.price)} | IVA {money(product.ivaRate * 100)}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  productSummaryCard: {
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#f0fdf4",
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  flex: {
    flex: 1,
    minWidth: 130
  },
  itemTitle: {
    color: "#111827",
    fontWeight: "900",
    flexShrink: 1
  },
  inlineInfo: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18
  }
});
