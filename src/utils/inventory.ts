import { InventoryMovement, InventoryMovementType, Product, Sale } from "../types";
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

export function createInventoryMovement(product: Product, type: InventoryMovementType, quantity: number, stockAfter: number, reason: string, userId: string, stockBefore = product.stock, reference?: string): InventoryMovement {
  return {
    id: inventoryMovementId(),
    productId: product.id,
    productName: product.name,
    type,
    quantity,
    stockBefore,
    stockAfter,
    reason,
    reference,
    userId,
    createdAt: new Date().toISOString()
  };
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

export function movementReason(type: InventoryMovementType) {
  if (type === "entrada") return "Compra o ingreso de mercaderia";
  if (type === "salida") return "Merma, uso interno o salida manual";
  return "Correccion de stock";
}

export function movementTypeLabel(type: InventoryMovementType) {
  if (type === "entrada") return "Entrada";
  if (type === "salida") return "Salida";
  return "Ajuste";
}

const inventoryMovementId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
