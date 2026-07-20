import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Empty, Input, Section } from "./common";
import { PaginationControls } from "./PaginationControls";
import { LIST_BATCH_SIZE } from "../constants/app";
import { grossToNetUnitPrice, money } from "../sri";
import { AppData, Product } from "../types";
import { productCost, productMinStock } from "../utils/accounting";
import { catalogItemBadge, isServiceItem } from "../utils/catalogItems";

export type ProductListItemProps = {
  title: string;
  meta: string;
  editLabel?: string;
  onEdit?: () => void;
  onDelete?: () => void;
};

type ProductListSectionProps = {
  canDelete: boolean;
  canEdit: boolean;
  data: AppData;
  filteredProducts: Product[];
  ListItemComponent: React.ComponentType<ProductListItemProps>;
  onDelete: (product: Product) => void;
  onEdit: (product: Product) => void;
  onCreate?: () => void;
  productPage: number;
  productSearch: string;
  setProductPage: (page: number) => void;
  setProductSearch: (value: string) => void;
  visibleProducts: Product[];
};

export function ProductListSection({
  canDelete,
  canEdit,
  data,
  filteredProducts,
  ListItemComponent,
  onDelete,
  onEdit,
  onCreate,
  productPage,
  productSearch,
  setProductPage,
  setProductSearch,
  visibleProducts
}: ProductListSectionProps) {
  return (
    <Section title="">
      <View style={styles.headerRow}>
        <Text style={styles.title}>Productos y servicios</Text>
        {canEdit && onCreate ? (
          <Pressable style={styles.addButton} onPress={onCreate}>
            <MaterialCommunityIcons name="package-variant-closed-plus" size={15} color="#ffffff" />
            <Text style={styles.addButtonText}>Agregar</Text>
          </Pressable>
        ) : null}
      </View>
      <Input label="Buscar productos o servicios guardados" value={productSearch} onChangeText={setProductSearch} placeholder="Codigo o nombre" autoCapitalize="none" />
      {data.products.length === 0 ? <Empty text="Aun no hay productos ni servicios." /> : null}
      {data.products.length > 0 && filteredProducts.length === 0 ? <Empty text="No hay items con esa busqueda." /> : null}
      {visibleProducts.map((product) => {
        const isService = isServiceItem(product);
        const meta = isService
          ? `${catalogItemBadge(product)} | Publico $${money(product.price)} | IVA ${money(product.ivaRate * 100)}% | Sin inventario`
          : `${catalogItemBadge(product)} | Publico $${money(product.price)} | Costo $${money(productCost(product))} | Util. $${money(grossToNetUnitPrice(product.price, product.ivaRate) - productCost(product))} | stock ${product.stock}/${productMinStock(product)}`;
        return (
          <ListItemComponent
            key={product.id}
            title={`${product.code} - ${product.name}`}
            meta={meta}
            editLabel={canEdit ? "Editar" : undefined}
            onEdit={() => onEdit(product)}
            onDelete={canDelete ? () => onDelete(product) : undefined}
          />
        );
      })}
      <PaginationControls page={productPage} pageSize={LIST_BATCH_SIZE} totalItems={filteredProducts.length} onPageChange={setProductPage} />
    </Section>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  title: {
    color: "#1f2937",
    flex: 1,
    fontSize: 17,
    fontWeight: "800"
  },
  addButton: {
    minHeight: 34,
    borderRadius: 8,
    backgroundColor: "#0f766e",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 10
  },
  addButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900"
  }
});
