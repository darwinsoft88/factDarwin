import { money } from "../sri";
import { Product, Sale } from "../types";
import { isInventoryProduct } from "./catalogItems";
import { isTicketOffline } from "./invoiceStatus";
import { isCreditNoteSale } from "./sales";

export function productMinStock(product: Product) {
  if (!isInventoryProduct(product)) return 0;
  return Number.isFinite(Number(product.minStock)) ? Number(product.minStock) : 5;
}

export function productCost(product: Product | undefined) {
  if (!product || !isInventoryProduct(product)) return 0;
  return Number.isFinite(Number(product?.cost)) ? Number(product?.cost) : 0;
}

export function accountingMoney(sale: Sale, value: number) {
  if (!(sale.status === "AUTORIZADA" || isTicketOffline(sale.status))) return "0.00";
  return `${isCreditNoteSale(sale) ? "-" : ""}${money(value)}`;
}

export function accountingValue(sale: Sale, value: number) {
  if (!(sale.status === "AUTORIZADA" || isTicketOffline(sale.status))) return 0;
  return isCreditNoteSale(sale) ? -value : value;
}

export function saleCostValue(sale: Sale, products: Product[]) {
  const productMap = new Map(products.map((product) => [product.id, product]));
  return sale.items.reduce((sum, item) => {
    if (!isInventoryProduct(item)) return sum;
    const cost = Number.isFinite(Number(item.cost)) ? Number(item.cost) : productCost(productMap.get(item.productId));
    return sum + item.quantity * cost;
  }, 0);
}

export function saleProfitValue(sale: Sale, products: Product[]) {
  return accountingValue(sale, sale.subtotal) - accountingValue(sale, saleCostValue(sale, products));
}
