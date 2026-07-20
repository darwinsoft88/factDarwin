import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Empty, Input } from "./common";
import { PaginationControls } from "./PaginationControls";
import { LIST_BATCH_SIZE } from "../constants/app";
import { money } from "../sri";
import { Product } from "../types";
import { productCost, productMinStock } from "../utils/accounting";
import { PaginationResult } from "../utils/pagination";

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
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <View style={styles.flex}>
              <Text style={styles.modalTitle}>Buscar producto</Text>
              <Text style={styles.modalMeta}>Resultados paginados para inventario</Text>
            </View>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>Cerrar</Text>
            </Pressable>
          </View>
          <Input label="" value={productSearch} onChangeText={onProductSearchChange} placeholder="Codigo o nombre" autoCapitalize="none" />
          <View style={styles.resultHeader}>
            <Text style={styles.resultLabel}>Productos encontrados</Text>
            <Text style={styles.resultCount}>{filteredProducts.length} registro(s)</Text>
          </View>
          <ScrollView style={styles.resultsBox} contentContainerStyle={styles.resultsContent} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {productPagination.items.map((product) => {
              const selected = product.id === productId;
              return (
                <Pressable key={product.id} style={[styles.productRow, selected && styles.productRowSelected]} onPress={() => onSelectProduct(product.id)}>
                  <View style={styles.flex}>
                    <Text style={[styles.productName, selected && styles.productNameSelected]} numberOfLines={1}>{product.code} - {product.name}</Text>
                    <Text style={styles.productMeta} numberOfLines={1}>Stock {product.stock}/{productMinStock(product)} | Costo ${money(productCost(product))} | Publico ${money(product.price)}</Text>
                  </View>
                  {selected ? <MaterialCommunityIcons name="check-circle" size={22} color="#047857" /> : <MaterialCommunityIcons name="chevron-right" size={22} color="#64748b" />}
                </Pressable>
              );
            })}
          </ScrollView>
          {filteredProducts.length === 0 ? <Empty text="No hay productos con esa busqueda." /> : null}
          <PaginationControls page={productPagination.currentPage} pageSize={LIST_BATCH_SIZE} totalItems={filteredProducts.length} onPageChange={onPageChange} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    minWidth: 0
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.38)",
    justifyContent: "flex-end",
    padding: 12
  },
  modalSheet: {
    maxHeight: "86%",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
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
