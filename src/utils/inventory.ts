import { InventoryMovementType, Product, Sale } from "../types";
import { saleStatusReducesStock } from "./sales";

export function buildStockCredits(sale?: Sale) {
  const credits = new Map<string, number>();
  if (!sale || !saleStatusReducesStock(sale.status)) return credits;

  sale.items.forEach((item) => {
    credits.set(item.productId, (credits.get(item.productId) || 0) + item.quantity);
  });

  return credits;
}

export function getAvailableStockForSale(product: Product, editingSale?: Sale) {
  return product.stock + (buildStockCredits(editingSale).get(product.id) || 0);
}

export function restoreSaleStock(products: Product[], sale: Sale) {
  const credits = buildStockCredits(sale);

  return products.map((product) => {
    const quantity = credits.get(product.id) || 0;
    return quantity > 0 ? { ...product, stock: product.stock + quantity } : product;
  });
}

export function buildStockMovements(products: Product[], sale: Sale, type: InventoryMovementType, reason: string, userId: string, createdAt: string, createId: () => string) {
  const quantities = new Map<string, number>();
  sale.items.forEach((item) => {
    quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity);
  });

  return products.flatMap((product) => {
    const quantity = quantities.get(product.id) || 0;
    if (quantity <= 0) return [];
    const stockAfter = type === "entrada" ? product.stock + quantity : product.stock - quantity;

    return [{
      id: createId(),
      productId: product.id,
      productName: product.name,
      type,
      quantity,
      stockBefore: product.stock,
      stockAfter,
      reason,
      reference: sale.sequence,
      userId,
      createdAt
    }];
  });
}
