import React, { useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { EntityEditModal } from "../components/EntityEditModal";
import { InventoryKardexSection, InventoryListItemProps, InventoryMovementSection, InventoryMovementsSection, InventoryStockSection } from "../components/InventorySections";
import { LIST_BATCH_SIZE } from "../constants/app";
import { useControlledInventoryMovements } from "../hooks/useControlledInventoryMovements";
import { calculateLineSubtotal } from "../sri";
import { AppData, InventoryMovementType, User } from "../types";
import { accountingValue, productCost } from "../utils/accounting";
import { appendAudit } from "../utils/audit";
import { isInventoryProduct } from "../utils/catalogItems";
import { showMessage } from "../utils/dialogs";
import { createInventoryMovement, movementReason, movementTypeLabel } from "../utils/inventory";
import { isTicketOffline } from "../utils/invoiceStatus";
import { parseDecimal } from "../utils/numbers";
import { paginateItems } from "../utils/pagination";
import { syncPatchToBackend } from "../utils/sync";

export function InventoryScreen({
  data,
  user,
  backendToken,
  persist,
  ListItemComponent
}: {
  data: AppData;
  user: User;
  backendToken: string;
  persist: (data: AppData) => Promise<void>;
  ListItemComponent: React.ComponentType<InventoryListItemProps>;
}) {
  const [productId, setProductId] = useState(data.products.find(isInventoryProduct)?.id || "");
  const [type, setType] = useState<InventoryMovementType>("entrada");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [movementModalVisible, setMovementModalVisible] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [movementSearch, setMovementSearch] = useState("");
  const [stockProductPage, setStockProductPage] = useState(1);
  const [kardexPage, setKardexPage] = useState(1);
  const [movementPage, setMovementPage] = useState(1);
  const { movements: inventoryMovements } =
    useControlledInventoryMovements(data, user);
  const inventoryProducts = useMemo(() => data.products.filter(isInventoryProduct), [data.products]);
  const filteredProducts = useMemo(() => {
    const search = productSearch.trim().toLowerCase();
    if (!search) return inventoryProducts;
    return inventoryProducts.filter((product) => [product.code, product.name].some((value) => value.toLowerCase().includes(search)));
  }, [inventoryProducts, productSearch]);
  const stockProductPagination = paginateItems(inventoryProducts, stockProductPage, LIST_BATCH_SIZE);
  const filteredMovements = useMemo(() => {
    const search = movementSearch.trim().toLowerCase();
    const movements = inventoryMovements;
    if (!search) return movements;
    return movements.filter((movement) =>
      [movement.productName, movement.reason, movement.reference || "", movementTypeLabel(movement.type)].some((value) => value.toLowerCase().includes(search))
    );
  }, [inventoryMovements, movementSearch]);
  const movementPagination = paginateItems(filteredMovements, movementPage, LIST_BATCH_SIZE);
  const visibleMovements = movementPagination.items;
  const selectedProduct = inventoryProducts.find((product) => product.id === productId);
  const productKardex = useMemo(() => inventoryMovements.filter((movement) => movement.productId === productId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [inventoryMovements, productId]);
  const kardexPagination = paginateItems(productKardex, kardexPage, LIST_BATCH_SIZE);
  const visibleKardex = kardexPagination.items;
  const productSales = useMemo(() => data.sales.filter((sale) => sale.items.some((item) => item.productId === productId) && (sale.status === "AUTORIZADA" || isTicketOffline(sale.status))), [data.sales, productId]);
  const productUnitsSold = productSales.reduce((sum, sale) => sum + sale.items.filter((item) => item.productId === productId).reduce((lineSum, item) => lineSum + accountingValue(sale, item.quantity), 0), 0);
  const productProfit = productSales.reduce((sum, sale) => sum + sale.items.filter((item) => item.productId === productId).reduce((lineSum, item) => {
    const cost = Number.isFinite(Number(item.cost)) ? Number(item.cost) : productCost(selectedProduct);
    return lineSum + accountingValue(sale, calculateLineSubtotal(item) - item.quantity * cost);
  }, 0), 0);

  useEffect(() => {
    setMovementPage(1);
  }, [movementSearch]);

  useEffect(() => {
    setStockProductPage(1);
  }, [inventoryProducts.length]);

  useEffect(() => {
    setKardexPage(1);
  }, [productId]);

  useEffect(() => {
    if (productId && inventoryProducts.some((product) => product.id === productId)) return;
    setProductId(inventoryProducts[0]?.id || "");
  }, [inventoryProducts, productId]);

  useEffect(() => {
    if (filteredProducts.length === 0) return;
    if (filteredProducts.some((product) => product.id === productId)) return;
    setProductId(filteredProducts[0]?.id || "");
  }, [filteredProducts, productId]);

  const saveMovement = async () => {
    const qty = parseDecimal(quantity);
    if (!selectedProduct || !Number.isFinite(qty) || qty <= 0) {
      Alert.alert("Movimiento incompleto", "Seleccione producto e ingrese una cantidad mayor a cero.");
      return;
    }

    let stockAfter = selectedProduct.stock;
    if (type === "entrada") stockAfter = selectedProduct.stock + qty;
    if (type === "salida") stockAfter = selectedProduct.stock - qty;
    if (type === "ajuste") stockAfter = qty;

    if (stockAfter < 0) {
      Alert.alert("Stock insuficiente", `No puede dejar stock negativo. Disponible: ${selectedProduct.stock}.`);
      return;
    }

    const createdAt = new Date().toISOString();
    const movement = createInventoryMovement(selectedProduct, type, type === "ajuste" ? Math.abs(stockAfter - selectedProduct.stock) : qty, stockAfter, reason.trim() || movementReason(type), user.id);
    const updatedProduct = { ...selectedProduct, stock: stockAfter, updatedAt: createdAt };
    const nextData = appendAudit({
      ...data,
      products: data.products.map((product) => (product.id === selectedProduct.id ? updatedProduct : product)),
      inventoryMovements: [movement, ...(data.inventoryMovements || [])]
    }, user, "INVENTORY_MOVEMENT_CREATED", "inventory", movement.id, `${movementTypeLabel(type)} de inventario: ${selectedProduct.code} - ${selectedProduct.name}`, { quantity: movement.quantity, stockBefore: selectedProduct.stock, stockAfter });
    await persist(nextData);
    await syncPatchToBackend(data.backendUrl, backendToken, {
      baseData: data,
      products: [updatedProduct],
      inventoryMovements: [movement],
      auditLogs: nextData.auditLogs.slice(0, 1)
    }, "Movimiento de inventario pendiente de sincronizar", nextData, persist);
    setQuantity("");
    setReason("");
    setMovementModalVisible(false);
    showMessage("Movimiento guardado", `Inventario actualizado. Nuevo stock de ${selectedProduct.name}: ${stockAfter}.`);
  };

  return (
    <View style={styles.stack}>
      <InventoryStockSection
        ListItemComponent={ListItemComponent}
        onCreateMovement={() => setMovementModalVisible(true)}
        productPagination={stockProductPagination}
        products={inventoryProducts}
        setProductPage={setStockProductPage}
      />

      <InventoryKardexSection
        kardexPagination={kardexPagination}
        ListItemComponent={ListItemComponent}
        productKardex={productKardex}
        productProfit={productProfit}
        productUnitsSold={productUnitsSold}
        selectedProduct={selectedProduct}
        setKardexPage={setKardexPage}
        visibleKardex={visibleKardex}
      />

      <InventoryMovementsSection
        filteredMovements={filteredMovements}
        ListItemComponent={ListItemComponent}
        movementPagination={movementPagination}
        movementSearch={movementSearch}
        movements={inventoryMovements}
        setMovementPage={setMovementPage}
        setMovementSearch={setMovementSearch}
        visibleMovements={visibleMovements}
      />
      <EntityEditModal
        visible={movementModalVisible}
        title="Movimiento de inventario"
        subtitle={selectedProduct ? `${selectedProduct.code} - ${selectedProduct.name}` : "Seleccione producto y cantidad"}
        confirmLabel="Guardar movimiento"
        onClose={() => setMovementModalVisible(false)}
        onConfirm={() => { void saveMovement(); }}
      >
        <InventoryMovementSection
          framed={false}
          showSaveButton={false}
          filteredProducts={filteredProducts}
          productId={productId}
          productSearch={productSearch}
          quantity={quantity}
          reason={reason}
          selectedProduct={selectedProduct}
          type={type}
          onProductChange={setProductId}
          onProductSearchChange={setProductSearch}
          onQuantityChange={setQuantity}
          onReasonChange={setReason}
          onSave={saveMovement}
          onTypeChange={setType}
        />
      </EntityEditModal>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12
  }
});
