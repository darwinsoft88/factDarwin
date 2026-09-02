import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { money } from "../sri";
import { Product } from "../types";
import { productMinStock } from "../utils/accounting";
import { catalogItemIcon, isServiceItem } from "../utils/catalogItems";
import { useAppTheme } from "../theme/AppTheme";

type SelectedProductCardProps = {
  product?: Product;
  onAdd?: () => void;
};

export function SelectedProductCard({ product, onAdd }: SelectedProductCardProps) {
  const { theme } = useAppTheme();
  if (!product) return null;
  const isService = isServiceItem(product);

  return (
    <View style={[styles.productSummaryCard, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.primarySoft }]}>
      <View style={[styles.productIcon, { backgroundColor: isService ? theme.colors.accentSoft : theme.colors.successSoft }]}>
        <MaterialCommunityIcons name={catalogItemIcon(product)} size={15} color={isService ? theme.colors.accent : theme.colors.success} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.itemTitle, { color: theme.colors.text }]} numberOfLines={1}>{product.name}</Text>
        <Text style={[styles.inlineInfo, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {isService ? `Servicio | IVA ${money(product.ivaRate * 100)}% | sin stock` : `Stock ${product.stock} | Min. ${productMinStock(product)} | IVA ${money(product.ivaRate * 100)}%`}
        </Text>
      </View>
      <Text style={[styles.price, { color: theme.colors.success }]}>${money(product.price)}</Text>
      {onAdd ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Agregar producto a la venta" style={[styles.addIconButton, { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface }]} onPress={onAdd}>
          <MaterialCommunityIcons name="plus" size={24} color={theme.colors.success} />
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
  serviceIcon: {
    backgroundColor: "#f5f3ff"
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
  }
});
