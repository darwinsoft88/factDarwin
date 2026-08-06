import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, Text, StyleSheet, View } from "react-native";
import { Empty, Input, PrimaryButton, Section, Select } from "./common";
import { InventoryProductPickerModal } from "./InventoryProductPickerModal";
import { StatBox } from "./metrics";
import { PaginationControls } from "./PaginationControls";
import { LIST_BATCH_SIZE } from "../constants/app";
import { grossToNetUnitPrice, money } from "../sri";
import { InventoryMovement, InventoryMovementType, Product } from "../types";
import { productCost, productMinStock } from "../utils/accounting";
import { formatShortDate } from "../utils/format";
import { movementReason, movementTypeLabel } from "../utils/inventory";
import { sanitizeDecimalInput } from "../utils/numbers";
import { PaginationResult } from "../utils/pagination";
import { formatAuditDate } from "../utils/support";

export type InventoryListItemProps = {
  title: string;
  meta: string;
  badge?: string;
};

type InventoryMovementSectionProps = {
  framed?: boolean;
  showSaveButton?: boolean;
  filteredProducts: Product[];
  productId: string;
  productPickerVisible: boolean;
  productSearch: string;
  quantity: string;
  reason: string;
  selectedProduct?: Product;
  type: InventoryMovementType;
  onProductChange: (value: string) => void;
  onProductPickerVisibleChange: (visible: boolean) => void;
  onProductSearchChange: (value: string) => void;
  onQuantityChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onSave: () => void;
  onTypeChange: (value: InventoryMovementType) => void;
};

export function InventoryMovementSection({
  framed = true,
  showSaveButton = true,
  filteredProducts,
  onProductChange,
  onProductPickerVisibleChange,
  onProductSearchChange,
  onQuantityChange,
  onReasonChange,
  onSave,
  onTypeChange,
  productId,
  productPickerVisible,
  productSearch,
  quantity,
  reason,
  selectedProduct,
  type
}: InventoryMovementSectionProps) {
  const [productPage, setProductPage] = React.useState(1);
  const productPagination = React.useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(filteredProducts.length / LIST_BATCH_SIZE));
    const currentPage = Math.min(productPage, totalPages);
    const start = (currentPage - 1) * LIST_BATCH_SIZE;
    return {
      currentPage,
      items: filteredProducts.slice(start, start + LIST_BATCH_SIZE)
    };
  }, [filteredProducts, productPage]);

  React.useEffect(() => {
    setProductPage(1);
  }, [productSearch]);

  const selectProduct = (id: string) => {
    onProductChange(id);
    onProductPickerVisibleChange(false);
  };

  const content = (
    <>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Producto</Text>
        <Pressable style={styles.productSelectButton} onPress={() => onProductPickerVisibleChange(true)}>
          <View style={styles.productIcon}>
            <MaterialCommunityIcons name="package-variant-closed" size={16} color="#047857" />
          </View>
          <View style={styles.flex}>
            <Text style={styles.productSelectTitle} numberOfLines={1}>{selectedProduct ? `${selectedProduct.code} - ${selectedProduct.name}` : "Buscar producto"}</Text>
            <Text style={styles.productSelectMeta} numberOfLines={1}>{selectedProduct ? `Stock ${selectedProduct.stock} | Costo $${money(productCost(selectedProduct))}` : "Busque por codigo o nombre"}</Text>
          </View>
          <MaterialCommunityIcons name="magnify" size={20} color="#0f766e" />
        </Pressable>
      </View>
      <InventoryProductPickerModal
        filteredProducts={filteredProducts}
        onClose={() => onProductPickerVisibleChange(false)}
        onPageChange={setProductPage}
        onProductSearchChange={onProductSearchChange}
        onSelectProduct={selectProduct}
        productId={productId}
        productPagination={productPagination}
        productSearch={productSearch}
        visible={productPickerVisible}
      />
      <Select
        label="Tipo"
        value={type}
        onChange={(value) => onTypeChange(value as InventoryMovementType)}
        options={[
          { label: "Entrada", value: "entrada" },
          { label: "Salida", value: "salida" },
          { label: "Ajuste", value: "ajuste" }
        ]}
      />
      {selectedProduct ? <Text style={styles.paragraph}>Stock actual: {selectedProduct.stock} | Minimo: {productMinStock(selectedProduct)} | Costo promedio: ${money(productCost(selectedProduct))}</Text> : null}
      <Input label={type === "ajuste" ? "Nuevo stock" : "Cantidad"} value={quantity} onChangeText={(value) => onQuantityChange(sanitizeDecimalInput(value))} keyboardType="decimal-pad" />
      <Input label="Motivo" value={reason} onChangeText={onReasonChange} placeholder={movementReason(type)} />
      {showSaveButton ? <PrimaryButton label="Guardar movimiento" onPress={onSave} /> : null}
    </>
  );

  if (!framed) return content;

  return (
    <Section title="Movimiento de inventario">
      {content}
    </Section>
  );
}

export function InventoryStockSection({
  ListItemComponent,
  onCreateMovement,
  productPagination,
  products,
  setProductPage
}: {
  ListItemComponent: React.ComponentType<InventoryListItemProps>;
  onCreateMovement?: () => void;
  productPagination: PaginationResult<Product>;
  products: Product[];
  setProductPage: (page: number) => void;
}) {
  return (
    <Section title="">
      <View style={styles.headerRow}>
        <Text style={styles.title}>Stock actual</Text>
        {onCreateMovement ? (
          <Pressable style={styles.addButton} onPress={onCreateMovement}>
            <MaterialCommunityIcons name="swap-horizontal-bold" size={15} color="#ffffff" />
            <Text style={styles.addButtonText}>Movimiento</Text>
          </Pressable>
        ) : null}
      </View>
      {products.length === 0 ? <Empty text="Aun no hay productos." /> : null}
      {productPagination.items.map((product) => (
        <ListItemComponent key={product.id} title={`${product.code} - ${product.name}`} meta={`Stock ${product.stock}/${productMinStock(product)} | Costo $${money(productCost(product))} | Publico $${money(product.price)} | Util. $${money(grossToNetUnitPrice(product.price, product.ivaRate) - productCost(product))}`} badge={product.stock <= 0 ? "SIN STOCK" : product.stock <= productMinStock(product) ? "BAJO" : undefined} />
      ))}
      <PaginationControls page={productPagination.currentPage} pageSize={LIST_BATCH_SIZE} totalItems={products.length} onPageChange={setProductPage} />
    </Section>
  );
}

export function InventoryKardexSection({
  kardexPagination,
  ListItemComponent,
  productKardex,
  productProfit,
  productUnitsSold,
  selectedProduct,
  setKardexPage,
  visibleKardex
}: {
  kardexPagination: PaginationResult<InventoryMovement>;
  ListItemComponent: React.ComponentType<InventoryListItemProps>;
  productKardex: InventoryMovement[];
  productProfit: number;
  productUnitsSold: number;
  selectedProduct?: Product;
  setKardexPage: (page: number) => void;
  visibleKardex: InventoryMovement[];
}) {
  return (
    <Section title="Kardex del producto">
      {selectedProduct ? (
        <View style={styles.statsGrid}>
          <StatBox label="Stock" value={String(selectedProduct.stock)} icon="package-variant-closed" />
          <StatBox label="Minimo" value={String(productMinStock(selectedProduct))} icon="alert-circle-outline" />
          <StatBox label="Costo prom." value={`$${money(productCost(selectedProduct))}`} icon="cash-minus" />
          <StatBox label="Unid. vendidas" value={money(productUnitsSold)} icon="cart-arrow-up" />
          <StatBox label="Utilidad" value={`$${money(productProfit)}`} icon="trending-up" />
          <StatBox label="Movimientos" value={String(productKardex.length)} icon="swap-horizontal" />
        </View>
      ) : null}
      {productKardex.length === 0 ? <Empty text="No hay movimientos para este producto." /> : null}
      {visibleKardex.map((movement) => (
        <ListItemComponent key={movement.id} title={`${movementTypeLabel(movement.type)} - ${movement.productName}`} meta={`${formatAuditDate(movement.createdAt)} | Cant. ${movement.quantity} | ${movement.stockBefore} -> ${movement.stockAfter} | ${movement.reason}${movement.reference ? ` | Ref. ${movement.reference}` : ""}`} />
      ))}
      <PaginationControls page={kardexPagination.currentPage} pageSize={LIST_BATCH_SIZE} totalItems={productKardex.length} onPageChange={setKardexPage} />
    </Section>
  );
}

export function InventoryMovementsSection({
  filteredMovements,
  ListItemComponent,
  movementPagination,
  movementSearch,
  movements,
  setMovementPage,
  setMovementSearch,
  visibleMovements
}: {
  filteredMovements: InventoryMovement[];
  ListItemComponent: React.ComponentType<InventoryListItemProps>;
  movementPagination: PaginationResult<InventoryMovement>;
  movementSearch: string;
  movements: InventoryMovement[];
  setMovementPage: (page: number) => void;
  setMovementSearch: (value: string) => void;
  visibleMovements: InventoryMovement[];
}) {
  return (
    <Section title="Ultimos movimientos">
      <Input label="Buscar movimientos" value={movementSearch} onChangeText={setMovementSearch} placeholder="Producto, motivo o referencia" autoCapitalize="none" />
      {movements.length === 0 ? <Empty text="Aun no hay movimientos de inventario." /> : null}
      {movements.length > 0 && filteredMovements.length === 0 ? <Empty text="No hay movimientos con esa busqueda." /> : null}
      {visibleMovements.map((movement) => (
        <ListItemComponent key={movement.id} title={`${movementTypeLabel(movement.type)} - ${movement.productName}`} meta={`${formatShortDate(movement.createdAt)} | Cant. ${movement.quantity} | ${movement.stockBefore} -> ${movement.stockAfter} | ${movement.reason}${movement.reference ? ` | Ref. ${movement.reference}` : ""}`} />
      ))}
      <PaginationControls page={movementPagination.currentPage} pageSize={LIST_BATCH_SIZE} totalItems={filteredMovements.length} onPageChange={setMovementPage} />
    </Section>
  );
}

const styles = StyleSheet.create({
  inputGroup: {
    gap: 5
  },
  label: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800"
  },
  flex: {
    flex: 1,
    minWidth: 0
  },
  productSelectButton: {
    minHeight: 56,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#9de8c0",
    backgroundColor: "#ecfdf5",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  productIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#d1fae5"
  },
  productSelectTitle: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "900"
  },
  productSelectMeta: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2
  },
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
  },
  paragraph: {
    color: "#4b5563",
    lineHeight: 20
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  }
});
