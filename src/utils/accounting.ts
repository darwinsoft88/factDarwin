import { money } from "../services/sri";
import { Product, Sale } from "../types";
import { isCreditNoteSale } from "./sales";

export function productMinStock(product: Product) {
  return Number.isFinite(Number(product.minStock)) ? Number(product.minStock) : 5;
}

export function productCost(product: Product | undefined) {
  return Number.isFinite(Number(product?.cost)) ? Number(product?.cost) : 0;
}

export function accountingMoney(sale: Sale, value: number) {
  if (!(sale.status === "AUTORIZADA" || sale.status === "INTERNA")) return "0.00";
  return `${isCreditNoteSale(sale) ? "-" : ""}${money(value)}`;
}

export function accountingValue(sale: Sale, value: number) {
  if (!(sale.status === "AUTORIZADA" || sale.status === "INTERNA")) return 0;
  return isCreditNoteSale(sale) ? -value : value;
}

export function saleCostValue(sale: Sale, products: Product[]) {
  const productMap = new Map(products.map((product) => [product.id, product]));
  return sale.items.reduce((sum, item) => {
    const cost = Number.isFinite(Number(item.cost)) ? Number(item.cost) : productCost(productMap.get(item.productId));
    return sum + item.quantity * cost;
  }, 0);
}

export function saleProfitValue(sale: Sale, products: Product[]) {
  return accountingValue(sale, sale.subtotal) - accountingValue(sale, saleCostValue(sale, products));
}
