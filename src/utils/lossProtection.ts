import { Alert, Platform } from "react-native";
import { grossToNetUnitPrice, money } from "../sri";
import { Product, SaleItem, UserRole } from "../types";
import { productCost } from "./accounting";
import { roundMoney } from "./numbers";

export type LossCheck = {
  hasLoss: boolean;
  displayUnitPrice: number;
  lossPerUnit: number;
  netUnitPrice: number;
  cost: number;
};

export function checkGrossPriceLoss(grossPrice: number, ivaRate: number, cost: number): LossCheck {
  const netUnitPrice = grossToNetUnitPrice(grossPrice, ivaRate);
  const lossPerUnit = roundMoney(Math.max(0, cost - netUnitPrice));
  return {
    hasLoss: lossPerUnit > 0,
    displayUnitPrice: grossPrice,
    lossPerUnit,
    netUnitPrice,
    cost
  };
}

export function checkProductLoss(product: Pick<Product, "price" | "ivaRate" | "cost">) {
  return checkGrossPriceLoss(Number(product.price) || 0, Number(product.ivaRate) || 0, productCost(product as Product));
}

export function checkSaleItemLoss(item: Pick<SaleItem, "unitPrice" | "cost" | "discount" | "quantity" | "ivaRate">) {
  const cost = Number.isFinite(Number(item.cost)) ? Number(item.cost) : 0;
  const quantity = Math.max(1, Number(item.quantity) || 1);
  const netUnitAfterDiscount = roundMoney(Math.max(0, (Number(item.unitPrice) || 0) - (Number(item.discount) || 0) / quantity));
  const displayUnitPrice = roundMoney(netUnitAfterDiscount * (1 + (Number(item.ivaRate) || 0)));
  const lossPerUnit = roundMoney(Math.max(0, cost - netUnitAfterDiscount));
  return {
    hasLoss: lossPerUnit > 0,
    displayUnitPrice,
    lossPerUnit,
    netUnitPrice: netUnitAfterDiscount,
    cost
  };
}

export function canOverrideLoss(role: UserRole) {
  return role === "admin";
}

export function confirmLossOverride({
  canOverride,
  loss,
  onChangePrice,
  onContinue,
  title = "Venta con perdida"
}: {
  canOverride: boolean;
  loss: LossCheck;
  onChangePrice: () => void;
  onContinue: () => void;
  title?: string;
}) {
  const message = `Atencion: El precio de venta ($${money(loss.displayUnitPrice)}) genera una perdida de $${money(loss.lossPerUnit)} por unidad.`;

  if (Platform.OS === "web" && typeof window !== "undefined") {
    if (!canOverride) {
      window.alert(`${title}\n\n${message}`);
      onChangePrice();
      return;
    }

    if (window.confirm(`${title}\n\n${message}\n\nAceptar para guardar de todas formas. Cancelar para cambiar precio.`)) {
      onContinue();
    } else {
      onChangePrice();
    }
    return;
  }

  const buttons = canOverride
    ? [
        { text: "Cambiar precio", style: "cancel" as const, onPress: onChangePrice },
        { text: "Guardar de todas formas", style: "destructive" as const, onPress: onContinue }
      ]
    : [{ text: "Cambiar precio", style: "cancel" as const, onPress: onChangePrice }];

  Alert.alert(title, message, buttons);
}
