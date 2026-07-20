import React from "react";
import { Alert } from "react-native";
import { calculateLineTotal, grossToNetUnitPrice, money } from "../sri";
import { AppData, Client, DocumentType, Product, Sale, SaleItem } from "../types";
import { productCost } from "../utils/accounting";
import { getCatalogItemType, isInventoryProduct } from "../utils/catalogItems";
import { getAvailableStockForSale } from "../utils/inventory";
import { canOverrideLoss, checkSaleItemLoss, confirmLossOverride } from "../utils/lossProtection";
import { parseDecimal } from "../utils/numbers";
import { formatQuantity } from "../utils/sales";
import { canonicalConsumerFinalClient, isConsumerFinalClient, normalizeProductCode } from "../validation";

type DiscountMode = "amount" | "percent";

type UseSaleCartActionsParams = {
  clientsForSale: Client[];
  data: AppData;
  discountMode: DiscountMode;
  documentType: DocumentType;
  editingSale?: Sale;
  filteredClientsForSale: Client[];
  grossDiscount: string;
  items: SaleItem[];
  productId: string;
  productSearch: string;
  quantity: string;
  selectedProduct?: Product;
  sourceProforma?: Sale;
  sourceTicket?: Sale;
  unitGrossPrice: string;
  userRole: AppData["users"][number]["role"];
  setClientId: React.Dispatch<React.SetStateAction<string>>;
  setDiscountMode: React.Dispatch<React.SetStateAction<DiscountMode>>;
  setGrossDiscount: React.Dispatch<React.SetStateAction<string>>;
  setIssueNotice: React.Dispatch<React.SetStateAction<string>>;
  setItems: React.Dispatch<React.SetStateAction<SaleItem[]>>;
  setProductId: React.Dispatch<React.SetStateAction<string>>;
  setProductSearch: React.Dispatch<React.SetStateAction<string>>;
  setQuantity: React.Dispatch<React.SetStateAction<string>>;
  setSelectedRemoteClient: React.Dispatch<React.SetStateAction<Client | null>>;
  setUnitGrossPrice: React.Dispatch<React.SetStateAction<string>>;
};

export function useSaleCartActions({
  clientsForSale,
  data,
  discountMode,
  documentType,
  editingSale,
  filteredClientsForSale,
  grossDiscount,
  items,
  productId,
  productSearch,
  quantity,
  selectedProduct,
  setClientId,
  setDiscountMode,
  setGrossDiscount,
  setIssueNotice,
  setItems,
  setProductId,
  setProductSearch,
  setQuantity,
  setSelectedRemoteClient,
  setUnitGrossPrice,
  sourceProforma,
  sourceTicket,
  unitGrossPrice,
  userRole
}: UseSaleCartActionsParams) {
  const selectProductForSale = (nextProductId: string) => {
    const nextProduct = data.products.find((item) => item.id === nextProductId);
    setProductId(nextProductId);
    setUnitGrossPrice(nextProduct ? money(nextProduct.price) : "");
    setGrossDiscount("0");
    setDiscountMode("amount");
    setQuantity("1");
    setIssueNotice("");
  };

  const selectClientForSale = (nextClientId: string, nextClient?: Client) => {
    const resolvedClient = nextClient || filteredClientsForSale.find((client) => client.id === nextClientId) || clientsForSale.find((client) => client.id === nextClientId);
    setClientId(nextClientId);
    setSelectedRemoteClient(resolvedClient ? (isConsumerFinalClient(resolvedClient) ? canonicalConsumerFinalClient(resolvedClient) : resolvedClient) : null);
    setIssueNotice("");
  };

  const addProductToSale = (product: Product | undefined, qty: number, grossPrice: number, discountValue: number, mode: DiscountMode, options?: { forceLoss?: boolean }) => {
    setIssueNotice("");
    if (!product || !qty || qty <= 0 || !grossPrice || grossPrice <= 0) {
      Alert.alert("Item requerido", "Seleccione un producto o servicio, cantidad valida y precio publico mayor a cero.");
      return false;
    }
    if (mode === "percent" && discountValue > 100) {
      Alert.alert("Descuento invalido", "El porcentaje de descuento no puede ser mayor a 100%.");
      return false;
    }
    const discountGrossValue = mode === "percent" ? grossPrice * qty * discountValue / 100 : discountValue;
    const activeDocumentType = sourceTicket || sourceProforma ? documentType : editingSale?.documentType || documentType;
    if (activeDocumentType !== "proforma" && isInventoryProduct(product)) {
      const quantityInCart = items.filter((item) => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
      const availableStock = getAvailableStockForSale(product, editingSale || sourceTicket);
      if (availableStock < quantityInCart + qty) {
        Alert.alert("Stock insuficiente", `Disponible: ${availableStock}. En esta venta ya tiene ${quantityInCart}.`);
        return false;
      }
    }
    const unitPrice = grossToNetUnitPrice(grossPrice, product.ivaRate);
    const discount = grossToNetUnitPrice(discountGrossValue, product.ivaRate);
    const lineBaseBeforeDiscount = qty * unitPrice;
    if (discount > lineBaseBeforeDiscount) {
      Alert.alert("Descuento invalido", "El descuento no puede ser mayor al valor del producto.");
      return false;
    }
    const nextItem = {
      productId: product.id,
      itemType: getCatalogItemType(product),
      code: product.code,
      name: product.name,
      quantity: qty,
      unitPrice,
      cost: productCost(product),
      discount,
      ivaRate: product.ivaRate
    };
    const loss = checkSaleItemLoss(nextItem);
    if (loss.hasLoss && !options?.forceLoss) {
      confirmLossOverride({
        canOverride: canOverrideLoss(userRole),
        loss,
        onChangePrice: () => undefined,
        onContinue: () => addProductToSale(product, qty, grossPrice, discountValue, mode, { forceLoss: true })
      });
      return false;
    }
    setItems((current) => [...current, nextItem]);
    setQuantity("1");
    setGrossDiscount("0");
    setDiscountMode("amount");
    setUnitGrossPrice(money(product.price));
    setProductSearch("");
    setIssueNotice(`Agregado: ${product.name} x${formatQuantity(qty)} | Total $${money(calculateLineTotal(nextItem))}. Listo para agregar el siguiente item.`);
    return true;
  };

  const addItem = () => {
    const product = data.products.find((item) => item.id === productId);
    addProductToSale(product, parseDecimal(quantity), parseDecimal(unitGrossPrice), Math.max(0, parseDecimal(grossDiscount) || 0), discountMode);
  };

  const addProductById = (nextProductId: string) => {
    const product = data.products.find((item) => item.id === nextProductId);
    if (!product) {
      Alert.alert("Item no encontrado", "No se encontro el producto o servicio seleccionado.");
      return;
    }
    setProductId(product.id);
    addProductToSale(product, 1, product.price, 0, "amount");
  };

  const addScannedCodeToSale = (rawCode: string) => {
    const code = normalizeProductCode(rawCode);
    if (!code) {
      Alert.alert("Codigo requerido", "Escanee o ingrese el codigo de barras.");
      return false;
    }
    const product = data.products.find((item) => normalizeProductCode(item.code) === code);
    if (!product) {
      Alert.alert("Item no encontrado", `No existe producto o servicio con codigo ${code}. Primero guardelo en Productos.`);
      return false;
    }
    setProductId(product.id);
    setProductSearch("");
    return addProductToSale(product, 1, product.price, 0, "amount");
  };

  const addProductSearchSubmit = () => {
    const raw = productSearch.trim();
    if (!raw) {
      Alert.alert("Item requerido", "Escriba o escanee un codigo, o busque por descripcion.");
      return;
    }
    const exactProduct = data.products.find((item) => normalizeProductCode(item.code) === normalizeProductCode(raw));
    if (exactProduct) {
      addScannedCodeToSale(raw);
      return;
    }
    if (selectedProduct) {
      addItem();
      return;
    }
    Alert.alert("Producto no encontrado", "No se encontro un producto con ese codigo o descripcion.");
  };

  return {
    addItem,
    addProductById,
    addProductSearchSubmit,
    addScannedCodeToSale,
    selectClientForSale,
    selectProductForSale
  };
}
