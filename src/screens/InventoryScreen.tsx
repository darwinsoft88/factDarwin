import React, { useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Empty, Input, LoadMoreButton, PrimaryButton, Section, Select } from "../components/common";
import { StatBox } from "../components/metrics";
import { LIST_BATCH_SIZE } from "../constants/app";
import { calculateLineSubtotal, grossToNetUnitPrice, money } from "../services/sri";
import { AppData, InventoryMovementType, User } from "../types";
import { accountingValue, productCost, productMinStock } from "../utils/accounting";
import { appendAudit } from "../utils/audit";
import { showMessage } from "../utils/dialogs";
import { formatShortDate } from "../utils/format";
import { createInventoryMovement, movementReason, movementTypeLabel } from "../utils/inventory";
import { isTicketOffline } from "../utils/invoiceStatus";
import { parseDecimal, sanitizeDecimalInput } from "../utils/numbers";
import { formatAuditDate } from "../utils/support";
import { syncPatchToBackend } from "../utils/sync";

type InventoryListItemProps = {
  title: string;
  meta: string;
  badge?: string;
};

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
  const [productId, setProductId] = useState(data.products[0]?.id || "");
  const [type, setType] = useState<InventoryMovementType>("entrada");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [movementSearch, setMovementSearch] = useState("");
  const [visibleProductCount, setVisibleProductCount] = useState(LIST_BATCH_SIZE);
  const [visibleMovementCount, setVisibleMovementCount] = useState(LIST_BATCH_SIZE);
  const filteredProducts = useMemo(() => {
    const search = productSearch.trim().toLowerCase();
    if (!search) return data.products;
    return data.products.filter((product) => [product.code, product.name].some((value) => value.toLowerCase().includes(search)));
  }, [data.products, productSearch]);
  const visibleProducts = filteredProducts.slice(0, visibleProductCount);
  const filteredMovements = useMemo(() => {
    const search = movementSearch.trim().toLowerCase();
    const movements = data.inventoryMovements || [];
    if (!search) return movements;
    return movements.filter((movement) =>
      [movement.productName, movement.reason, movement.reference || "", movementTypeLabel(movement.type)].some((value) => value.toLowerCase().includes(search))
    );
  }, [data.inventoryMovements, movementSearch]);
  const visibleMovements = filteredMovements.slice(0, visibleMovementCount);
  const selectedProduct = data.products.find((product) => product.id === productId);
  const productKardex = useMemo(() => (data.inventoryMovements || []).filter((movement) => movement.productId === productId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [data.inventoryMovements, productId]);
  const productSales = useMemo(() => data.sales.filter((sale) => sale.items.some((item) => item.productId === productId) && (sale.status === "AUTORIZADA" || isTicketOffline(sale.status))), [data.sales, productId]);
  const productUnitsSold = productSales.reduce((sum, sale) => sum + sale.items.filter((item) => item.productId === productId).reduce((lineSum, item) => lineSum + accountingValue(sale, item.quantity), 0), 0);
  const productProfit = productSales.reduce((sum, sale) => sum + sale.items.filter((item) => item.productId === productId).reduce((lineSum, item) => {
    const cost = Number.isFinite(Number(item.cost)) ? Number(item.cost) : productCost(selectedProduct);
    return lineSum + accountingValue(sale, calculateLineSubtotal(item) - item.quantity * cost);
  }, 0), 0);

  useEffect(() => {
    setVisibleProductCount(LIST_BATCH_SIZE);
  }, [productSearch]);

  useEffect(() => {
    setVisibleMovementCount(LIST_BATCH_SIZE);
  }, [movementSearch]);

  useEffect(() => {
    if (productId && data.products.some((product) => product.id === productId)) return;
    setProductId(data.products[0]?.id || "");
  }, [data.products, productId]);

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
    showMessage("Movimiento guardado", `Inventario actualizado. Nuevo stock de ${selectedProduct.name}: ${stockAfter}.`);
  };

  return (
    <View style={styles.stack}>
      <Section title="Movimiento de inventario">
        <Input label="Buscar producto" value={productSearch} onChangeText={setProductSearch} placeholder="Codigo o nombre" autoCapitalize="none" />
        <Select label={`Producto (${visibleProducts.length}/${filteredProducts.length})`} value={productId} onChange={setProductId} options={visibleProducts.map((product) => ({ label: `${product.code} - ${product.name}`, value: product.id }))} />
        {filteredProducts.length === 0 ? <Empty text="No hay productos con esa busqueda." /> : null}
        {visibleProducts.length < filteredProducts.length ? <LoadMoreButton label="Cargar mas productos" onPress={() => setVisibleProductCount((count) => count + LIST_BATCH_SIZE)} /> : null}
        <Select
          label="Tipo"
          value={type}
          onChange={(value) => setType(value as InventoryMovementType)}
          options={[
            { label: "Entrada", value: "entrada" },
            { label: "Salida", value: "salida" },
            { label: "Ajuste", value: "ajuste" }
          ]}
        />
        {selectedProduct ? <Text style={styles.paragraph}>Stock actual: {selectedProduct.stock} | Minimo: {productMinStock(selectedProduct)} | Costo promedio: ${money(productCost(selectedProduct))}</Text> : null}
        <Input label={type === "ajuste" ? "Nuevo stock" : "Cantidad"} value={quantity} onChangeText={(value) => setQuantity(sanitizeDecimalInput(value))} keyboardType="decimal-pad" />
        <Input label="Motivo" value={reason} onChangeText={setReason} placeholder={movementReason(type)} />
        <PrimaryButton label="Guardar movimiento" onPress={saveMovement} />
      </Section>

      <Section title="Stock actual">
        {data.products.length === 0 ? <Empty text="Aun no hay productos." /> : null}
        {visibleProducts.map((product) => (
          <ListItemComponent key={product.id} title={`${product.code} - ${product.name}`} meta={`Stock ${product.stock}/${productMinStock(product)} | Costo $${money(productCost(product))} | Publico $${money(product.price)} | Util. $${money(grossToNetUnitPrice(product.price, product.ivaRate) - productCost(product))}`} badge={product.stock <= 0 ? "SIN STOCK" : product.stock <= productMinStock(product) ? "BAJO" : undefined} />
        ))}
        {visibleProducts.length < filteredProducts.length ? <LoadMoreButton label="Cargar mas stock" onPress={() => setVisibleProductCount((count) => count + LIST_BATCH_SIZE)} /> : null}
      </Section>

      <Section title="Kardex del producto">
        {selectedProduct ? (
          <View style={styles.statsGrid}>
            <StatBox label="Stock" value={String(selectedProduct.stock)} />
            <StatBox label="Minimo" value={String(productMinStock(selectedProduct))} />
            <StatBox label="Costo prom." value={`$${money(productCost(selectedProduct))}`} />
            <StatBox label="Unid. vendidas" value={money(productUnitsSold)} />
            <StatBox label="Utilidad" value={`$${money(productProfit)}`} />
            <StatBox label="Movimientos" value={String(productKardex.length)} />
          </View>
        ) : null}
        {productKardex.length === 0 ? <Empty text="No hay movimientos para este producto." /> : null}
        {productKardex.slice(0, LIST_BATCH_SIZE).map((movement) => (
          <ListItemComponent key={movement.id} title={`${movementTypeLabel(movement.type)} - ${movement.productName}`} meta={`${formatAuditDate(movement.createdAt)} | Cant. ${movement.quantity} | ${movement.stockBefore} -> ${movement.stockAfter} | ${movement.reason}${movement.reference ? ` | Ref. ${movement.reference}` : ""}`} />
        ))}
      </Section>

      <Section title="Ultimos movimientos">
        <Input label="Buscar movimientos" value={movementSearch} onChangeText={setMovementSearch} placeholder="Producto, motivo o referencia" autoCapitalize="none" />
        {(data.inventoryMovements || []).length === 0 ? <Empty text="Aun no hay movimientos de inventario." /> : null}
        {(data.inventoryMovements || []).length > 0 && filteredMovements.length === 0 ? <Empty text="No hay movimientos con esa busqueda." /> : null}
        {visibleMovements.map((movement) => (
          <ListItemComponent key={movement.id} title={`${movementTypeLabel(movement.type)} - ${movement.productName}`} meta={`${formatShortDate(movement.createdAt)} | Cant. ${movement.quantity} | ${movement.stockBefore} -> ${movement.stockAfter} | ${movement.reason}${movement.reference ? ` | Ref. ${movement.reference}` : ""}`} />
        ))}
        {visibleMovements.length < filteredMovements.length ? <LoadMoreButton label="Cargar mas movimientos" onPress={() => setVisibleMovementCount((count) => count + LIST_BATCH_SIZE)} /> : null}
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12
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
