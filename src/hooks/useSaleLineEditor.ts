import { useState } from "react";
import { Alert } from "react-native";
import { grossToNetUnitPrice, money } from "../sri";
import { AppData, DocumentType, Sale, SaleItem, SalePriceTier } from "../types";
import { isInventoryProduct } from "../utils/catalogItems";
import { getAvailableStockForSale } from "../utils/inventory";
import { canOverrideLoss, checkSaleItemLoss, confirmLossOverride } from "../utils/lossProtection";
import { parseDecimal, roundMoney } from "../utils/numbers";
import { calculateGrossUnitPrice, calculateLineGrossDiscount, formatQuantity } from "../utils/sales";
import { productPriceForTier, saleItemWithPriceTier } from "../utils/productPrices";

export type LineEditForm = {
  quantity: string;
  unitGrossPrice: string;
  grossDiscount: string;
  discountMode: "amount" | "percent";
  priceTier?: SalePriceTier;
};

type UseSaleLineEditorParams = {
  data: AppData;
  documentType: DocumentType;
  editingSale?: Sale;
  items: SaleItem[];
  sourceProforma?: Sale;
  sourceTicket?: Sale;
  setIssueNotice: React.Dispatch<React.SetStateAction<string>>;
  setItems: React.Dispatch<React.SetStateAction<SaleItem[]>>;
  userRole: AppData["users"][number]["role"];
};

const defaultLineEditForm: LineEditForm = {
  quantity: "1",
  unitGrossPrice: "0",
  grossDiscount: "0",
  discountMode: "amount"
};

export function useSaleLineEditor({
  data,
  documentType,
  editingSale,
  items,
  setIssueNotice,
  setItems,
  sourceProforma,
  sourceTicket,
  userRole
}: UseSaleLineEditorParams) {
  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null);
  const [lineEditForm, setLineEditForm] = useState<LineEditForm>(defaultLineEditForm);

  const closeLineEditor = () => {
    setEditingLineIndex(null);
    setLineEditForm(defaultLineEditForm);
  };

  const openLineEditor = (index: number) => {
    const item = items[index];
    if (!item) return;
    setEditingLineIndex(index);
    setLineEditForm({
      quantity: formatQuantity(item.quantity),
      unitGrossPrice: money(calculateGrossUnitPrice(item)),
      grossDiscount: money(calculateLineGrossDiscount(item)),
      discountMode: "amount",
      priceTier: item.priceTier
    });
  };

  const saveLineEdit = (draft = lineEditForm, options?: { forceLoss?: boolean }) => {
    if (editingLineIndex === null) return;
    const currentItem = items[editingLineIndex];
    if (!currentItem) return;
    const product = data.products.find((item) => item.id === currentItem.productId);
    const qty = parseDecimal(draft.quantity);
    const grossPrice = parseDecimal(draft.unitGrossPrice);
    const discountValue = Math.max(0, parseDecimal(draft.grossDiscount) || 0);
    if (!product || !qty || qty <= 0 || !grossPrice || grossPrice <= 0) {
      Alert.alert("Linea incompleta", "Ingrese cantidad y precio validos.");
      return;
    }
    if (draft.discountMode === "percent" && discountValue > 100) {
      Alert.alert("Descuento invalido", "El porcentaje de descuento no puede ser mayor a 100%.");
      return;
    }
    const activeDocumentType = sourceTicket || sourceProforma ? documentType : editingSale?.documentType || documentType;
    if (activeDocumentType !== "proforma" && isInventoryProduct(product)) {
      const quantityInOtherLines = items.reduce((sum, item, index) => index !== editingLineIndex && item.productId === product.id ? sum + item.quantity : sum, 0);
      const availableStock = getAvailableStockForSale(product, editingSale || sourceTicket);
      if (availableStock < quantityInOtherLines + qty) {
        Alert.alert("Stock insuficiente", `Disponible: ${availableStock}. En otras lineas ya tiene ${quantityInOtherLines}.`);
        return;
      }
    }
    const discountGrossValue = draft.discountMode === "percent" ? grossPrice * qty * discountValue / 100 : discountValue;
    const unitPrice = grossToNetUnitPrice(grossPrice, currentItem.ivaRate);
    const discount = grossToNetUnitPrice(discountGrossValue, currentItem.ivaRate);
    if (discount > qty * unitPrice) {
      Alert.alert("Descuento invalido", "El descuento no puede ser mayor al valor del producto.");
      return;
    }
    const selectedTier = draft.priceTier;
    const keepsSelectedTier = selectedTier && Math.abs(productPriceForTier(product, selectedTier) - grossPrice) < 0.005;
    const updatedValues = { ...currentItem, quantity: qty, unitPrice, discount };
    const nextItem = keepsSelectedTier && selectedTier
      ? saleItemWithPriceTier(updatedValues, product, selectedTier)
      : { ...updatedValues, priceTier: undefined };
    const loss = checkSaleItemLoss(nextItem);
    if (loss.hasLoss && !options?.forceLoss) {
      confirmLossOverride({
        canOverride: canOverrideLoss(userRole),
        loss,
        onChangePrice: () => undefined,
        onContinue: () => saveLineEdit(draft, { forceLoss: true })
      });
      return;
    }
    setItems((current) => current.map((item, index) => index === editingLineIndex ? nextItem : item));
    closeLineEditor();
    setIssueNotice("Detalle actualizado.");
  };

  const adjustSaleLineQuantity = (index: number, amount: number) => {
    const item = items[index];
    if (!item) return;
    const nextQuantity = Math.max(1, item.quantity + amount);
    if (nextQuantity === item.quantity) return;

    const activeDocumentType = sourceTicket || sourceProforma ? documentType : editingSale?.documentType || documentType;
    if (amount > 0 && activeDocumentType !== "proforma") {
      const product = data.products.find((productItem) => productItem.id === item.productId);
      if (product && isInventoryProduct(product)) {
        const quantityInOtherLines = items.reduce((sum, currentItem, itemIndex) => itemIndex !== index && currentItem.productId === item.productId ? sum + currentItem.quantity : sum, 0);
        const availableStock = getAvailableStockForSale(product, editingSale || sourceTicket);
        if (availableStock < quantityInOtherLines + nextQuantity) {
          Alert.alert("Stock insuficiente", `Disponible: ${availableStock}. En otras lineas ya tiene ${quantityInOtherLines}.`);
          return;
        }
      }
    }

    const ratio = item.quantity > 0 ? nextQuantity / item.quantity : 1;
    const nextDiscount = roundMoney((item.discount || 0) * ratio);
    setItems((current) => current.map((currentItem, itemIndex) => itemIndex === index ? { ...currentItem, quantity: nextQuantity, discount: nextDiscount } : currentItem));
  };

  const changeLinePriceTier = (index: number, priceTier: SalePriceTier, options?: { forceLoss?: boolean }) => {
    const currentItem = items[index];
    if (!currentItem) return false;
    const product = data.products.find((item) => item.id === currentItem.productId);
    if (!product) {
      Alert.alert("Producto no encontrado", "No se pudo cargar el producto de esta línea.");
      return false;
    }
    const nextItem = saleItemWithPriceTier(currentItem, product, priceTier);
    if (nextItem.discount > nextItem.quantity * nextItem.unitPrice) {
      Alert.alert("Descuento inválido", "El descuento actual supera el nuevo precio. Ajuste el descuento desde Editar detalle.");
      return false;
    }
    const loss = checkSaleItemLoss(nextItem);
    if (loss.hasLoss && !options?.forceLoss) {
      confirmLossOverride({
        canOverride: canOverrideLoss(userRole),
        loss,
        onChangePrice: () => undefined,
        onContinue: () => changeLinePriceTier(index, priceTier, { forceLoss: true })
      });
      return false;
    }
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? nextItem : item));
    setIssueNotice(`${priceTier.toUpperCase()} aplicado solamente a ${currentItem.name}.`);
    return true;
  };

  return {
    adjustSaleLineQuantity,
    changeLinePriceTier,
    closeLineEditor,
    editingLineIndex,
    lineEditForm,
    openLineEditor,
    saveLineEdit,
    setLineEditForm
  };
}
