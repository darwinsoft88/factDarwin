import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { money } from "../services/sri";
import { Product } from "../types";
import { productMinStock } from "../utils/accounting";

type SelectedProductCardProps = {
  product?: Product;
  onAdd?: () => void;
};

export function SelectedProductCard({ product, onAdd }: SelectedProductCardProps) {
  if (!product) return null;

  return (
    <View style={styles.productSummaryCard}>
      <View style={styles.productIcon}>
        <Text style={styles.productIconText}>▣</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.itemTitle} numberOfLines={1}>{product.name}</Text>
        <Text style={styles.inlineInfo} numberOfLines={1}>Existencia {product.stock} | Min. {productMinStock(product)} | IVA {money(product.ivaRate * 100)}%</Text>
      </View>
      <Text style={styles.price}>${money(product.price)}</Text>
      {onAdd ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Agregar producto a la venta" style={styles.addIconButton} onPress={onAdd}>
          <Text style={styles.addIconText}>+</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  productSummaryCard: {
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: "#f0fdf4",
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  productIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#dcfce7",
    alignItems: "center",
    justifyContent: "center"
  },
  productIconText: {
    color: "#047857",
    fontSize: 14,
    fontWeight: "900"
  },
  flex: {
    flex: 1,
    minWidth: 0
  },
  itemTitle: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 15
  },
  inlineInfo: {
    color: "#475569",
    fontSize: 9,
    fontWeight: "700",
    lineHeight: 12
  },
  price: {
    color: "#047857",
    fontSize: 12,
    fontWeight: "900"
  },
  addIconButton: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center"
  },
  addIconText: {
    color: "#047857",
    fontSize: 24,
    lineHeight: 26,
    fontWeight: "600"
  }
});
