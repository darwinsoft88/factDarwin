import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ProductEditModal } from "../components/ProductEditModal";
import { ProductFormValues } from "../components/ProductForm";
import { ProductListItemProps, ProductListSection } from "../components/ProductListSection";
import { LIST_BATCH_SIZE } from "../constants/app";
import { money } from "../sri";
import { AppData, CatalogItemType, Product, User } from "../types";
import { productCost, productMinStock } from "../utils/accounting";
import { canDeleteCatalog, canEditCatalog } from "../utils/appAccess";
import { appendAudit } from "../utils/audit";
import {
  confirmAction,
  showError,
  showSuccess,
  showWarning
} from "../utils/dialogs";
import { isInventoryProduct, isServiceItem } from "../utils/catalogItems";
import { createInventoryMovement } from "../utils/inventory";
import { generateId } from "../utils/id";
import { canOverrideLoss, checkProductLoss, confirmLossOverride } from "../utils/lossProtection";
import { parseDecimal } from "../utils/numbers";
import { paginateItems } from "../utils/pagination";
import { syncPatchToBackend } from "../utils/sync";
import { findDuplicateProductCode, normalizeProductCode } from "../validation";

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
  ListItemComponent: React.ComponentType<ProductListItemProps>;
  BarcodeScannerModalComponent: React.ComponentType<BarcodeScannerModalProps>;
}) {
  const emptyForm: ProductFormValues = { itemType: "product", code: "", name: "", price: "", cost: "", stock: "", minStock: "5", ivaRate: "0.15" };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productScannerVisible, setProductScannerVisible] = useState(false);
  const [productPage, setProductPage] = useState(1);
  const filteredProducts = useMemo(() => {
    const search = productSearch.trim().toLowerCase();
    if (!search) return data.products;
    return data.products.filter((product) => [product.code, product.name].some((value) => value.toLowerCase().includes(search)));
  }, [data.products, productSearch]);
  const productPagination = paginateItems(filteredProducts, productPage, LIST_BATCH_SIZE);
  const visibleProducts = productPagination.items;
  const canDelete = canDeleteCatalog(user.role);
  const canEdit = canEditCatalog(user.role);

  useEffect(() => {
    setProductPage(1);
  }, [productSearch]);

  const verifyScannedProductCode = () => {
    if (!canEdit) {
      showWarning("Acceso restringido", "Su usuario no tiene permiso para modificar items.");
      return;
    }

    const code = normalizeProductCode(form.code);
    if (!code) {
      showWarning("Codigo requerido", "Escanee o ingrese el codigo de barras.");
      return;
    }
    const duplicate = findDuplicateProductCode(data.products, code, editingId);
    setForm({ ...form, code });
    if (duplicate) {
      setProductSearch(code);
      showWarning("Codigo ya registrado", `El codigo ${duplicate.code} ya pertenece a ${duplicate.name}.`);
      return;
    }
    showSuccess("Codigo listo", `Codigo ${code} disponible para guardar.`);
  };

  const save = async (options?: { forceLoss?: boolean }) => {
    if (savingProduct) return;

    if (!canEdit) {
      showWarning("Acceso restringido", "Su usuario no tiene permiso para modificar productos.");
      return;
    }

    const itemType: CatalogItemType = form.itemType === "service" ? "service" : "product";
    const isService = itemType === "service";
    const itemName = isService ? "servicio" : "producto";
    const price = parseDecimal(form.price);
    const cost = isService ? 0 : parseDecimal(form.cost || "0");
    const stock = isService ? 0 : parseDecimal(form.stock || "0");
    const minStock = isService ? 0 : parseDecimal(form.minStock || "5");
    const productData = { itemType, code: normalizeProductCode(form.code), name: form.name.trim(), price, cost, stock, minStock, ivaRate: Number(form.ivaRate), updatedAt: new Date().toISOString() };

    if (!productData.code || !productData.name || !Number.isFinite(price) || price <= 0) {
      showWarning("Datos incompletos", `Ingrese codigo, nombre y precio del ${itemName}.`);
      return;
    }

    if (!isService && (!Number.isFinite(stock) || stock < 0)) {
      showWarning("Stock invalido", "Ingrese un stock mayor o igual a cero.");
      return;
    }
    if (!isService && (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(minStock) || minStock < 0)) {
      showWarning("Costos invalidos", "Ingrese costo y stock minimo mayor o igual a cero.");
      return;
    }

    const duplicate = findDuplicateProductCode(data.products, productData.code, editingId);
    if (duplicate) {
      showWarning("Codigo duplicado", `Ya existe un item con el codigo ${duplicate.code}: ${duplicate.name}.`);
      return;
    }

    const loss = checkProductLoss(productData);
    if (loss.hasLoss && !options?.forceLoss) {
      confirmLossOverride({
        canOverride: canOverrideLoss(user.role),
        loss,
        onChangePrice: () => undefined,
        onContinue: () => { void save({ forceLoss: true }); },
        title: "Producto con perdida"
      });
      return;
    }

    setSavingProduct(true);
    try {
      const successTitle = editingId
        ? (isService ? "Servicio actualizado" : "Producto actualizado")
        : (isService ? "Servicio guardado" : "Producto guardado");
      const successMessage = editingId ? `El ${itemName} se edito con exito.` : `El ${itemName} se guardo con exito.`;
      let synced = false;

      if (editingId) {
        const currentProduct = data.products.find((product) => product.id === editingId);
        const movement =
          currentProduct && isInventoryProduct(productData) && currentProduct.stock !== productData.stock
            ? createInventoryMovement(currentProduct, "ajuste", Math.abs(productData.stock - currentProduct.stock), productData.stock, "Ajuste desde productos", user.id)
            : null;
        const updatedProduct = { ...currentProduct, ...productData, id: editingId } as Product;
        const nextData = appendAudit({
          ...data,
          products: data.products.map((product) => (product.id === editingId ? updatedProduct : product)),
          inventoryMovements: movement ? [movement, ...(data.inventoryMovements || [])] : data.inventoryMovements
        }, user, "PRODUCT_UPDATED", "product", editingId, `Producto actualizado: ${productData.code} - ${productData.name}`, { stockBefore: currentProduct?.stock, stockAfter: productData.stock });
        await persist(nextData);
        synced = await syncPatchToBackend(data.backendUrl, backendToken, {
          baseData: data,
          products: [updatedProduct],
          inventoryMovements: movement ? [movement] : [],
          auditLogs: nextData.auditLogs.slice(0, 1)
        }, "Producto pendiente de sincronizar", nextData, persist);
      } else {
        const product: Product = { id: generateId(), ...productData };
        const movement = isInventoryProduct(product) && product.stock > 0 ? createInventoryMovement(product, "entrada", product.stock, product.stock, "Stock inicial", user.id, 0) : null;
        const nextData = appendAudit({ ...data, products: [product, ...data.products], inventoryMovements: movement ? [movement, ...(data.inventoryMovements || [])] : data.inventoryMovements }, user, "PRODUCT_CREATED", "product", product.id, `Producto creado: ${product.code} - ${product.name}`, { stock: product.stock });
        await persist(nextData);
        synced = await syncPatchToBackend(data.backendUrl, backendToken, {
          baseData: data,
          products: [product],
          inventoryMovements: movement ? [movement] : [],
          auditLogs: nextData.auditLogs.slice(0, 1)
        }, "Producto pendiente de sincronizar", nextData, persist);
      }

      if (!synced) return;
      setEditingId("");
      setEditModalVisible(false);
      setForm(emptyForm);
      showSuccess(successTitle, successMessage);
    } catch (error) {
      showError("Error al guardar", error instanceof Error ? error.message : `No se pudo guardar el ${itemName}.`);
    } finally {
      setSavingProduct(false);
    }
  };

  const edit = (product: Product) => {
    if (!canEdit) {
      showWarning("Acceso restringido", "Su usuario no tiene permiso para modificar productos.");
      return;
    }

    setEditingId(product.id);
    setForm({
      itemType: isServiceItem(product) ? "service" : "product",
      code: product.code,
      name: product.name,
      price: money(product.price),
      cost: money(productCost(product)),
      stock: String(product.stock),
      minStock: String(productMinStock(product)),
      ivaRate: String(product.ivaRate)
    });
    setEditModalVisible(true);
  };

  const openCreate = () => {
    if (!canEdit) {
      showWarning("Acceso restringido", "Su usuario no tiene permiso para crear productos.");
      return;
    }
    setEditingId("");
    setForm(emptyForm);
    setEditModalVisible(true);
  };

  const cancelEdit = () => {
    setEditingId("");
    setEditModalVisible(false);
    setForm(emptyForm);
  };

  const editingProductName = data.products.find((product) => product.id === editingId)?.name || "Producto";

  const deleteProduct = (product: Product) => {
    const hasFiscalHistory =
      data.sales.some((sale) => sale.items.some((item) => item.productId === product.id)) ||
      (data.guides || []).some((guide) => guide.items.some((item) => item.productId === product.id));
    if (hasFiscalHistory) {
      showWarning("Producto protegido", "Este producto ya tiene ventas o guias. Para conservar el historial fiscal no se puede eliminar.");
      return;
    }
    confirmAction("Eliminar producto", `Seguro que desea eliminar ${product.code} - ${product.name}? Esta accion quedara registrada en auditoria.`, () => {
      void (async () => {
        const inventoryMovementIds = (data.inventoryMovements || []).filter((movement) => movement.productId === product.id).map((movement) => movement.id);
        const nextData = appendAudit({
          ...data,
          products: data.products.filter((item) => item.id !== product.id),
          inventoryMovements: (data.inventoryMovements || []).filter((movement) => movement.productId !== product.id),
          deletedIds: {
            ...(data.deletedIds || {}),
            products: Array.from(new Set([...(data.deletedIds?.products || []), product.id])),
            inventoryMovements: Array.from(new Set([...(data.deletedIds?.inventoryMovements || []), ...inventoryMovementIds]))
          }
        }, user, "PRODUCT_DELETED", "product", product.id, `Producto eliminado: ${product.code} - ${product.name}`);
        await persist(nextData);
        await syncPatchToBackend(data.backendUrl, backendToken, {
          baseData: data,
          deletions: { products: [product.id], inventoryMovements: inventoryMovementIds },
          auditLogs: nextData.auditLogs.slice(0, 1)
        }, "Producto eliminado pendiente de sincronizar", nextData, persist);
        showSuccess("Producto eliminado", "El producto se elimino con exito.");
      })();
    });
  };

  return (
    <View style={styles.stack}>
      <ProductListSection
        canDelete={canDelete}
        canEdit={canEdit}
        data={data}
        filteredProducts={filteredProducts}
        ListItemComponent={ListItemComponent}
        onCreate={openCreate}
        onDelete={deleteProduct}
        onEdit={edit}
        productPage={productPagination.currentPage}
        productSearch={productSearch}
        setProductPage={setProductPage}
        setProductSearch={setProductSearch}
        visibleProducts={visibleProducts}
      />
      <BarcodeScannerModalComponent
        visible={productScannerVisible}
        title="Escanear codigo del item"
        onClose={() => setProductScannerVisible(false)}
        onScan={(code) => {
          const normalized = normalizeProductCode(code);
          setProductScannerVisible(false);
          setForm((current) => ({ ...current, code: normalized }));
          const duplicate = findDuplicateProductCode(data.products, normalized, editingId);
          if (duplicate) {
            setProductSearch(normalized);
            showWarning("Codigo ya registrado", `El codigo ${duplicate.code} ya pertenece a ${duplicate.name}.`);
          } else {
            showSuccess("Codigo escaneado", `Codigo ${normalized} listo para guardar.`);
          }
        }}
      />
      {canEdit ? (
        <ProductEditModal
          editingId={editingId}
          editingProductName={editingProductName}
          form={form}
          saving={savingProduct}
          onChange={setForm}
          onClose={cancelEdit}
          onOpenScanner={() => setProductScannerVisible(true)}
          onSave={() => { void save(); }}
          onVerifyCode={verifyScannedProductCode}
          visible={editModalVisible}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12
  }
});
