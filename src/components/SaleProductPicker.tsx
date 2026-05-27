import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Product } from "../types";
import { money } from "../services/sri";
import { Empty, Input, LoadMoreButton } from "./common";
import { CameraIcon } from "./icons";
import { SelectedProductCard } from "./SelectedProductCard";

type SaleProductPickerProps = {
  search: string;
  selectedProductId: string;
  visibleProducts: Product[];
  filteredProductCount: number;
  selectedProduct?: Product;
  canLoadMore: boolean;
  onSearchChange: (value: string) => void;
  onProductChange: (value: string) => void;
  onSearchSubmit: () => void;
  onOpenScanner: () => void;
  onLoadMore: () => void;
  onAddSelected: () => void;
};

export function SaleProductPicker({
  search,
  selectedProductId,
  visibleProducts,
  filteredProductCount,
  selectedProduct,
  canLoadMore,
  onSearchChange,
  onProductChange,
  onSearchSubmit,
  onOpenScanner,
  onLoadMore,
  onAddSelected
}: SaleProductPickerProps) {
  const [pickerVisible, setPickerVisible] = React.useState(false);
  const selectProduct = (id: string) => {
    onProductChange(id);
    setPickerVisible(false);
  };

  return (
    <>
      <View style={styles.compactHeader}>
        <Text style={styles.compactTitle}>Producto</Text>
        <View style={styles.productActions}>
          <Pressable style={styles.actionButton} onPress={() => setPickerVisible(true)}>
            <Text style={styles.actionButtonText}>Buscar producto</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Escanear producto con camara" style={styles.cameraButton} onPress={onOpenScanner}>
            <CameraIcon />
          </Pressable>
        </View>
      </View>
      <SelectedProductCard key={selectedProduct?.id || "none"} product={selectedProduct} onAdd={onAddSelected} />
      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={() => setPickerVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerVisible(false)}>
          <Pressable style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.flex}>
                <Text style={styles.modalTitle}>Buscar producto</Text>
                <Text style={styles.modalMeta}>Busque por codigo, barras o descripcion. Los resultados cargan por bloques.</Text>
              </View>
              <Pressable style={styles.closeButton} onPress={() => setPickerVisible(false)}>
                <Text style={styles.closeButtonText}>Cerrar</Text>
              </Pressable>
            </View>
            <Input
              label="Buscar o escanear producto"
              value={search}
              onChangeText={onSearchChange}
              placeholder="Codigo, barras o descripcion"
              autoCapitalize="characters"
              onSubmitEditing={onSearchSubmit}
              rightElement={(
                <Pressable accessibilityRole="button" accessibilityLabel="Escanear producto con camara" style={styles.inputCameraButton} onPress={onOpenScanner}>
                  <CameraIcon />
                </Pressable>
              )}
            />
            <View style={styles.resultHeader}>
              <Text style={styles.resultLabel}>Productos encontrados</Text>
              <Text style={styles.resultCount}>{visibleProducts.length}/{filteredProductCount}</Text>
            </View>
            <ScrollView style={styles.resultsBox} contentContainerStyle={styles.resultsContent} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {visibleProducts.map((product) => {
                const selected = product.id === selectedProductId;
                return (
                  <Pressable key={product.id} style={[styles.productRow, selected && styles.productRowSelected]} onPress={() => selectProduct(product.id)}>
                    <View style={styles.flex}>
                      <Text style={[styles.productName, selected && styles.productNameSelected]} numberOfLines={1}>{product.code} - {product.name}</Text>
                      <Text style={styles.productMeta} numberOfLines={1}>Existencia {product.stock} | Precio $ {money(product.price)} | IVA {money(product.ivaRate * 100)}%</Text>
                    </View>
                    {selected ? <Text style={styles.selectedPill}>Activo</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            {filteredProductCount === 0 ? <Empty text="No hay productos con esa busqueda." /> : null}
            {canLoadMore ? <LoadMoreButton label="Cargar mas productos" onPress={onLoadMore} /> : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  compactHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  compactTitle: {
    color: "#111827",
    fontWeight: "900"
  },
  productActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  actionButton: {
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  actionButtonText: {
    color: "#0f5f59",
    fontWeight: "900"
  },
  cameraButton: {
    width: 38,
    minHeight: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f766e"
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
  flex: {
    flex: 1,
    minWidth: 0
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
  inputCameraButton: {
    width: 42,
    minHeight: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f766e"
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  resultLabel: {
    color: "#4b5563",
    fontSize: 12,
    fontWeight: "800"
  },
  resultCount: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800"
  },
  resultsBox: {
    maxHeight: 260,
    borderWidth: 1,
    borderColor: "#dbe4ee",
    borderRadius: 8,
    backgroundColor: "#ffffff"
  },
  resultsContent: {
    gap: 6,
    padding: 8
  },
  productRow: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#dbe4ee",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: "#f8fafc"
  },
  productRowSelected: {
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb"
  },
  productName: {
    color: "#111827",
    fontWeight: "900"
  },
  productNameSelected: {
    color: "#0f766e"
  },
  productMeta: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 2
  },
  selectedPill: {
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#bbf7d0",
    color: "#047857",
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 8,
    paddingVertical: 4
  }
});
