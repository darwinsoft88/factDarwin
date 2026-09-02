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
import { useAppTheme } from "../theme/AppTheme";
import { availableProductPrices } from "../utils/productPrices";
import { ProductThumbnail } from "./ProductThumbnail";

export type ProductListItemProps = {
  title: string;
  meta: string;
  accentTone?: "primary" | "success" | "warning" | "danger" | "info";
  editLabel?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  leading?: React.ReactNode;
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
  backendToken: string;
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
  visibleProducts,
  backendToken
}: ProductListSectionProps) {
  const { theme } = useAppTheme();
  return (
    <Section title="">
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Productos y servicios</Text>
        {canEdit && onCreate ? (
          <Pressable style={[styles.addButton, { backgroundColor: theme.colors.primary }]} onPress={onCreate}>
            <MaterialCommunityIcons name="package-variant-closed-plus" size={15} color={theme.colors.onPrimary} />
            <Text style={[styles.addButtonText, { color: theme.colors.onPrimary }]}>Agregar</Text>
          </Pressable>
        ) : null}
      </View>
      <Input label="Buscar productos o servicios guardados" value={productSearch} onChangeText={setProductSearch} placeholder="Codigo o nombre" autoCapitalize="none" />
      {data.products.length === 0 ? <Empty text="Aun no hay productos ni servicios." /> : null}
      {data.products.length > 0 && filteredProducts.length === 0 ? <Empty text="No hay items con esa busqueda." /> : null}
      {visibleProducts.map((product) => {
        const isService = isServiceItem(product);
        const minimumStock = productMinStock(product);
        const accentTone = isService ? "info" : product.stock <= 0 ? "danger" : product.stock <= minimumStock ? "warning" : "success";
        const priceSummary = availableProductPrices(product).map((item) => `${item.label} $${money(item.price)}`).join(" | ");
        const meta = isService
          ? `${catalogItemBadge(product)} | ${priceSummary} | IVA ${money(product.ivaRate * 100)}% | Sin inventario`
          : `${catalogItemBadge(product)} | ${priceSummary} | Costo $${money(productCost(product))} | Util. PVP1 $${money(grossToNetUnitPrice(product.price, product.ivaRate) - productCost(product))} | stock ${product.stock}/${minimumStock}`;
        return (
          <ListItemComponent
            key={product.id}
            leading={<ProductThumbnail product={product} backendUrl={data.backendUrl} token={backendToken} size={46} />}
            title={`${product.code} - ${product.name}`}
            meta={meta}
            accentTone={accentTone}
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
