import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Empty, Input } from "./common";
import { PaginationControls } from "./PaginationControls";
import { LIST_BATCH_SIZE } from "../constants/app";
import { money } from "../sri";
import { Product } from "../types";
import { productCost, productMinStock } from "../utils/accounting";
import { PaginationResult } from "../utils/pagination";
import { useAppTheme } from "../theme/AppTheme";

type InventoryProductPickerModalProps = {
  filteredProducts: Product[];
  onClose: () => void;
  onPageChange: (page: number) => void;
  onProductSearchChange: (value: string) => void;
  onSelectProduct: (id: string) => void;
  productId: string;
  productPagination: Pick<PaginationResult<Product>, "currentPage" | "items">;
  productSearch: string;
  visible: boolean;
};

export function InventoryProductPickerModal({
  filteredProducts,
  onClose,
  onPageChange,
  onProductSearchChange,
  onSelectProduct,
  productId,
  productPagination,
  productSearch,
  visible
}: InventoryProductPickerModalProps) {
  const { theme } = useAppTheme();
  if (!visible) return null;

  return (
    <View style={[styles.pickerPanel, { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderStrong }]}>
      <View style={styles.modalHeader}>
        <View style={styles.flex}>
          <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Buscar producto</Text>
          <Text style={[styles.modalMeta, { color: theme.colors.textMuted }]}>Resultados paginados para inventario</Text>
        </View>
        <Pressable style={[styles.closeButton, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }]} onPress={onClose}>
          <Text style={[styles.closeButtonText, { color: theme.colors.primaryStrong }]}>Cerrar</Text>
        </Pressable>
      </View>
      <Input label="" value={productSearch} onChangeText={onProductSearchChange} placeholder="Codigo o nombre" autoCapitalize="none" />
      <View style={styles.resultHeader}>
        <Text style={[styles.resultLabel, { color: theme.colors.textMuted }]}>Productos encontrados</Text>
        <Text style={[styles.resultCount, { color: theme.colors.primary }]}>{filteredProducts.length} registro(s)</Text>
      </View>
      <ScrollView style={[styles.resultsBox, { borderColor: theme.colors.border }]} contentContainerStyle={styles.resultsContent} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {productPagination.items.map((product) => {
          const selected = product.id === productId;
          return (
            <Pressable key={product.id} style={[styles.productRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted }, selected && [styles.productRowSelected, { borderColor: theme.colors.success, backgroundColor: theme.colors.successSoft }]]} onPress={() => onSelectProduct(product.id)}>
              <View style={styles.flex}>
                <Text style={[styles.productName, { color: theme.colors.text }, selected && [styles.productNameSelected, { color: theme.colors.success }]]} numberOfLines={1}>{product.code} - {product.name}</Text>
                <Text style={[styles.productMeta, { color: theme.colors.textMuted }]} numberOfLines={1}>Stock {product.stock}/{productMinStock(product)} | Costo ${money(productCost(product))} | Publico ${money(product.price)}</Text>
              </View>
              {selected ? <MaterialCommunityIcons name="check-circle" size={22} color={theme.colors.success} /> : <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.textMuted} />}
            </Pressable>
          );
        })}
      </ScrollView>
      {filteredProducts.length === 0 ? <Empty text="No hay productos con esa busqueda." /> : null}
      <PaginationControls page={productPagination.currentPage} pageSize={LIST_BATCH_SIZE} totalItems={filteredProducts.length} onPageChange={onPageChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    minWidth: 0
  },
  pickerPanel: {
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    padding: 12,
    gap: 10
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  modalTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900"
  },
  modalMeta: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 2
  },
  closeButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  closeButtonText: {
    color: "#0f5f59",
    fontWeight: "900"
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  resultLabel: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900"
  },
  resultCount: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "900"
  },
  resultsBox: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    maxHeight: 320
  },
  resultsContent: {
    gap: 7,
    padding: 8
  },
  productRow: {
    minHeight: 56,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dbe4f0",
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  productRowSelected: {
    borderColor: "#86efac",
    backgroundColor: "#f0fdf4"
  },
  productName: {
    color: "#111827",
    fontWeight: "900"
  },
  productNameSelected: {
    color: "#047857"
  },
  productMeta: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2
  }
});
