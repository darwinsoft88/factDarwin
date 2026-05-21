import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Empty, Input, LoadMoreButton, PrimaryButton, Section, Select } from "../components/common";
import { LIST_BATCH_SIZE } from "../constants/app";
import { grossToNetUnitPrice, money } from "../services/sri";
import { AppData, Product, User } from "../types";
import { productCost, productMinStock } from "../utils/accounting";
import { canDeleteCatalog, canEditCatalog } from "../utils/appAccess";
import { appendAudit } from "../utils/audit";
import { confirmAction, showMessage } from "../utils/dialogs";
import { createInventoryMovement } from "../utils/inventory";
import { generateId } from "../utils/id";
import { parseDecimal } from "../utils/numbers";
import { syncPatchToBackend } from "../utils/sync";
import { findDuplicateProductCode, normalizeProductCode } from "../validation";

type ProductsListItemProps = {
  title: string;
  meta: string;
  editLabel?: string;
  onEdit?: () => void;
  onDelete?: () => void;
};

type BarcodeScannerModalProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  onScan: (code: string) => void;
};

export function ProductsScreen({
  data,
  user,
  backendToken,
  persist,
  ListItemComponent,
  BarcodeScannerModalComponent
}: {
  data: AppData;
  user: User;
  backendToken: string;
  persist: (data: AppData) => Promise<void>;
  ListItemComponent: React.ComponentType<ProductsListItemProps>;
  BarcodeScannerModalComponent: React.ComponentType<BarcodeScannerModalProps>;
}) {
  const emptyForm = { code: "", name: "", price: "", cost: "", stock: "", minStock: "5", ivaRate: "0.15" };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productScannerVisible, setProductScannerVisible] = useState(false);
  const [visibleProductCount, setVisibleProductCount] = useState(LIST_BATCH_SIZE);
  const filteredProducts = useMemo(() => {
    const search = productSearch.trim().toLowerCase();
    if (!search) return data.products;
    return data.products.filter((product) => [product.code, product.name].some((value) => value.toLowerCase().includes(search)));
  }, [data.products, productSearch]);
  const visibleProducts = filteredProducts.slice(0, visibleProductCount);
  const canDelete = canDeleteCatalog(user.role);
  const canEdit = canEditCatalog(user.role);

  useEffect(() => {
    setVisibleProductCount(LIST_BATCH_SIZE);
  }, [productSearch]);

  const verifyScannedProductCode = () => {
    if (!canEdit) {
      Alert.alert("Acceso restringido", "Su usuario no tiene permiso para modificar productos.");
      return;
    }

    const code = normalizeProductCode(form.code);
    if (!code) {
      Alert.alert("Codigo requerido", "Escanee o ingrese el codigo de barras.");
      return;
    }
    const duplicate = findDuplicateProductCode(data.products, code, editingId);
    setForm({ ...form, code });
    if (duplicate) {
      setProductSearch(code);
      Alert.alert("Codigo ya registrado", `El codigo ${duplicate.code} ya pertenece a ${duplicate.name}.`);
      return;
    }
    showMessage("Codigo listo", `Codigo ${code} disponible para guardar.`);
  };

  const save = async () => {
    if (!canEdit) {
      Alert.alert("Acceso restringido", "Su usuario no tiene permiso para modificar productos.");
      return;
    }

    const price = parseDecimal(form.price);
    const cost = parseDecimal(form.cost || "0");
    const stock = parseDecimal(form.stock || "0");
    const minStock = parseDecimal(form.minStock || "5");
    const productData = { code: normalizeProductCode(form.code), name: form.name.trim(), price, cost, stock, minStock, ivaRate: Number(form.ivaRate), updatedAt: new Date().toISOString() };

    if (!productData.code || !productData.name || !Number.isFinite(price) || price <= 0) {
      Alert.alert("Datos incompletos", "Ingrese codigo, nombre y precio.");
      return;
    }

    if (!Number.isFinite(stock) || stock < 0) {
      Alert.alert("Stock invalido", "Ingrese un stock mayor o igual a cero.");
      return;
    }
    if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(minStock) || minStock < 0) {
      Alert.alert("Costos invalidos", "Ingrese costo y stock minimo mayor o igual a cero.");
      return;
    }

    const duplicate = findDuplicateProductCode(data.products, productData.code, editingId);
    if (duplicate) {
      Alert.alert("Codigo duplicado", `Ya existe un producto con el codigo ${duplicate.code}: ${duplicate.name}.`);
      return;
    }

    if (editingId) {
      const currentProduct = data.products.find((product) => product.id === editingId);
      const movement =
        currentProduct && currentProduct.stock !== productData.stock
          ? createInventoryMovement(currentProduct, "ajuste", Math.abs(productData.stock - currentProduct.stock), productData.stock, "Ajuste desde productos", user.id)
          : null;
      const updatedProduct = { ...currentProduct, ...productData, id: editingId } as Product;
      const nextData = appendAudit({
        ...data,
        products: data.products.map((product) => (product.id === editingId ? updatedProduct : product)),
        inventoryMovements: movement ? [movement, ...(data.inventoryMovements || [])] : data.inventoryMovements
      }, user, "PRODUCT_UPDATED", "product", editingId, `Producto actualizado: ${productData.code} - ${productData.name}`, { stockBefore: currentProduct?.stock, stockAfter: productData.stock });
      await persist(nextData);
      await syncPatchToBackend(data.backendUrl, backendToken, {
        baseData: data,
        products: [updatedProduct],
        inventoryMovements: movement ? [movement] : [],
        auditLogs: nextData.auditLogs.slice(0, 1)
      }, "Producto pendiente de sincronizar", nextData, persist);
      showMessage("Producto actualizado", "El producto se edito con exito.");
    } else {
      const product: Product = { id: generateId(), ...productData };
      const movement = product.stock > 0 ? createInventoryMovement(product, "entrada", product.stock, product.stock, "Stock inicial", user.id, 0) : null;
      const nextData = appendAudit({ ...data, products: [product, ...data.products], inventoryMovements: movement ? [movement, ...(data.inventoryMovements || [])] : data.inventoryMovements }, user, "PRODUCT_CREATED", "product", product.id, `Producto creado: ${product.code} - ${product.name}`, { stock: product.stock });
      await persist(nextData);
      await syncPatchToBackend(data.backendUrl, backendToken, {
        baseData: data,
        products: [product],
        inventoryMovements: movement ? [movement] : [],
        auditLogs: nextData.auditLogs.slice(0, 1)
      }, "Producto pendiente de sincronizar", nextData, persist);
      showMessage("Producto guardado", "El producto se guardo con exito.");
    }

    setEditingId("");
    setForm(emptyForm);
  };

  const edit = (product: Product) => {
    if (!canEdit) {
      Alert.alert("Acceso restringido", "Su usuario no tiene permiso para modificar productos.");
      return;
    }

    setEditingId(product.id);
    setForm({
      code: product.code,
      name: product.name,
      price: money(product.price),
      cost: money(productCost(product)),
      stock: String(product.stock),
      minStock: String(productMinStock(product)),
      ivaRate: String(product.ivaRate)
    });
  };

  return (
    <View style={styles.stack}>
      {canEdit ? (
        <Section title={editingId ? "Editar producto" : "Nuevo producto"}>
          <Input label="Codigo / barras" value={form.code} onChangeText={(code) => setForm({ ...form, code })} autoCapitalize="characters" placeholder="Escanee el codigo del producto" onSubmitEditing={verifyScannedProductCode} />
          <View style={styles.actionGroup}>
            <Pressable style={styles.smallButton} onPress={verifyScannedProductCode}>
              <Text style={styles.smallButtonText}>Verificar codigo</Text>
            </Pressable>
            <Pressable style={styles.scanButton} onPress={() => setProductScannerVisible(true)}>
              <Text style={styles.scanButtonText}>Escanear con camara</Text>
            </Pressable>
          </View>
          <Text style={styles.inlineInfo}>Puede escanear con lector Bluetooth/USB; el codigo se guarda como codigo principal del producto.</Text>
          <Input label="Nombre" value={form.name} onChangeText={(name) => setForm({ ...form, name })} />
          <Input label="Precio publico" value={form.price} onChangeText={(price) => setForm({ ...form, price })} keyboardType="decimal-pad" />
          <Input label="Costo promedio" value={form.cost} onChangeText={(cost) => setForm({ ...form, cost })} keyboardType="decimal-pad" />
          <Input label="Stock" value={form.stock} onChangeText={(stock) => setForm({ ...form, stock })} keyboardType="decimal-pad" />
          <Input label="Stock minimo" value={form.minStock} onChangeText={(minStock) => setForm({ ...form, minStock })} keyboardType="decimal-pad" />
          <Select label="IVA" value={form.ivaRate} onChange={(ivaRate) => setForm({ ...form, ivaRate })} options={[{ label: "15%", value: "0.15" }, { label: "0%", value: "0" }]} />
          {editingId ? (
            <Pressable style={styles.smallButton} onPress={() => { setEditingId(""); setForm(emptyForm); }}>
              <Text style={styles.smallButtonText}>Cancelar edicion</Text>
            </Pressable>
          ) : null}
          <PrimaryButton label="Guardar producto" onPress={save} />
        </Section>
      ) : null}

      <Section title="Productos guardados">
        <Input label="Buscar productos guardados" value={productSearch} onChangeText={setProductSearch} placeholder="Codigo o nombre" autoCapitalize="none" />
        {data.products.length === 0 ? <Empty text="Aun no hay productos." /> : null}
        {data.products.length > 0 && filteredProducts.length === 0 ? <Empty text="No hay productos con esa busqueda." /> : null}
        {visibleProducts.map((product) => {
          const productInUse =
            data.sales.some((sale) => sale.items.some((item) => item.productId === product.id)) ||
            (data.guides || []).some((guide) => guide.items.some((item) => item.productId === product.id)) ||
            (data.inventoryMovements || []).some((movement) => movement.productId === product.id);
          return (
            <ListItemComponent
              key={product.id}
              title={`${product.code} - ${product.name}`}
              meta={`Publico $${money(product.price)} | Costo $${money(productCost(product))} | Util. $${money(grossToNetUnitPrice(product.price, product.ivaRate) - productCost(product))} | stock ${product.stock}/${productMinStock(product)}`}
              editLabel={canEdit ? "Editar" : undefined}
              onEdit={() => edit(product)}
              onDelete={canDelete ? () => {
                if (productInUse) {
                  Alert.alert("Producto protegido", "Este producto ya tiene ventas, guias o movimientos de inventario. Para conservar el historial no se puede eliminar.");
                  return;
                }
                confirmAction("Eliminar producto", `Seguro que desea eliminar ${product.code} - ${product.name}? Esta accion quedara registrada en auditoria.`, () => {
                  void (async () => {
                    const nextData = appendAudit({ ...data, products: data.products.filter((item) => item.id !== product.id), deletedIds: { ...(data.deletedIds || {}), products: Array.from(new Set([...(data.deletedIds?.products || []), product.id])) } }, user, "PRODUCT_DELETED", "product", product.id, `Producto eliminado: ${product.code} - ${product.name}`);
                    await persist(nextData);
                    await syncPatchToBackend(data.backendUrl, backendToken, { baseData: data, deletions: { products: [product.id] }, auditLogs: nextData.auditLogs.slice(0, 1) }, "Producto eliminado pendiente de sincronizar", nextData, persist);
                    showMessage("Producto eliminado", "El producto se elimino con exito.");
                  })();
                });
              } : undefined}
            />
          );
        })}
        {visibleProducts.length < filteredProducts.length ? <LoadMoreButton label="Cargar mas productos" onPress={() => setVisibleProductCount((count) => count + LIST_BATCH_SIZE)} /> : null}
      </Section>
      <BarcodeScannerModalComponent
        visible={productScannerVisible}
        title="Escanear codigo del producto"
        onClose={() => setProductScannerVisible(false)}
        onScan={(code) => {
          const normalized = normalizeProductCode(code);
          setProductScannerVisible(false);
          setForm((current) => ({ ...current, code: normalized }));
          const duplicate = findDuplicateProductCode(data.products, normalized, editingId);
          if (duplicate) {
            setProductSearch(normalized);
            Alert.alert("Codigo ya registrado", `El codigo ${duplicate.code} ya pertenece a ${duplicate.name}.`);
          } else {
            showMessage("Codigo escaneado", `Codigo ${normalized} listo para guardar.`);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12
  },
  actionGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-end",
    flexShrink: 0
  },
  smallButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  smallButtonText: {
    color: "#0f5f59",
    fontWeight: "900"
  },
  scanButton: {
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  scanButtonText: {
    color: "#ffffff",
    fontWeight: "900",
    textAlign: "center"
  },
  inlineInfo: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18
  }
});
