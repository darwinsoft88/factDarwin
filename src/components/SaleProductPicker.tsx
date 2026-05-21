import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Product } from "../types";
import { Empty, Input, LoadMoreButton, Select } from "./common";
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
  onLoadMore
}: SaleProductPickerProps) {
  return (
    <>
      <View style={styles.scanBox}>
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
      </View>
      <Select label={`Seleccionar producto (${visibleProducts.length}/${filteredProductCount})`} value={selectedProductId} onChange={onProductChange} options={visibleProducts.map((item) => ({ label: `${item.code} - ${item.name}`, value: item.id }))} />
      {filteredProductCount === 0 ? <Empty text="No hay productos con esa busqueda." /> : null}
      {canLoadMore ? <LoadMoreButton label="Cargar mas productos" onPress={onLoadMore} /> : null}
      <SelectedProductCard product={selectedProduct} />
    </>
  );
}

const styles = StyleSheet.create({
  scanBox: {
    borderWidth: 1,
    borderColor: "#dbe4ee",
    borderRadius: 8,
    padding: 12,
    gap: 8,
    backgroundColor: "#ffffff"
  },
  inputCameraButton: {
    width: 42,
    minHeight: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f766e"
  }
});
