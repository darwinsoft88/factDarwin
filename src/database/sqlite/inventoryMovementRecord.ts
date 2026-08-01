import type { InventoryMovement } from "../../types";

export const INVENTORY_DECIMAL_SCALE = 1_000_000;

const KNOWN_KEYS = new Set([
  "id", "productId", "productName", "type", "quantity", "stockBefore",
  "stockAfter", "reason", "reference", "saleId", "inventoryOperationId",
  "inventoryOperationType", "userId", "createdAt",
]);

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function optionalScaled(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.round(numeric * INVENTORY_DECIMAL_SCALE)
    : null;
}

export interface CanonicalInventoryMovement {
  id: string;
  productId: string | null;
  productName: string | null;
  movementType: string | null;
  quantityMicros: number | null;
  stockBeforeMicros: number | null;
  stockAfterMicros: number | null;
  reason: string | null;
  reference: string | null;
  saleId: string | null;
  inventoryOperationId: string | null;
  inventoryOperationType: string | null;
  userId: string | null;
  createdAt: string | null;
  presentFields: string[];
  compatibility: Record<string, unknown>;
}

export function canonicalInventoryMovement(
  movement: InventoryMovement,
): CanonicalInventoryMovement {
  const source = movement as unknown as Record<string, unknown>;
  return {
    id: String(source.id ?? ""),
    productId: optionalString(source.productId),
    productName: optionalString(source.productName),
    movementType: optionalString(source.type),
    quantityMicros: optionalScaled(source.quantity),
    stockBeforeMicros: optionalScaled(source.stockBefore),
    stockAfterMicros: optionalScaled(source.stockAfter),
    reason: optionalString(source.reason),
    reference: optionalString(source.reference),
    saleId: optionalString(source.saleId),
    inventoryOperationId: optionalString(source.inventoryOperationId),
    inventoryOperationType: optionalString(source.inventoryOperationType),
    userId: optionalString(source.userId),
    createdAt: optionalString(source.createdAt),
    presentFields: [...KNOWN_KEYS].filter((key) =>
      Object.prototype.hasOwnProperty.call(source, key)
    ),
    compatibility: Object.fromEntries(
      Object.entries(source)
        .filter(([key]) => !KNOWN_KEYS.has(key))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => [key, stableValue(value)]),
    ),
  };
}

export async function hashInventoryMovement(
  movement: InventoryMovement,
): Promise<string> {
  const { CryptoDigestAlgorithm, digestStringAsync } =
    await import("expo-crypto");
  return digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    JSON.stringify(canonicalInventoryMovement(movement)),
  );
}
