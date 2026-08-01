import type { Product } from "../../types";

const PRODUCT_KEYS = new Set([
  "id",
  "itemType",
  "code",
  "barcode",
  "name",
  "price",
  "cost",
  "ivaRate",
  "stock",
  "minStock",
  "unitMeasure",
  "active",
  "deleted",
  "updatedAt",
]);

const DECIMAL_SCALE = 1_000_000;
const TAX_BASIS_POINT_SCALE = 10_000;

function decimalToMicros(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.round(numeric * DECIMAL_SCALE)
    : 0;
}

function taxRateToBasisPoints(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.round(numeric * TAX_BASIS_POINT_SCALE)
    : 0;
}

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

export interface CanonicalProductRecord {
  id: string;
  itemType: "product" | "service";
  code: string;
  barcode: string | null;
  name: string;
  priceMicros: number;
  costMicros: number;
  ivaRateBasisPoints: number;
  stockMicros: number;
  minStockMicros: number;
  unitMeasure: string | null;
  active: boolean;
  deleted: boolean;
  updatedAt: string | null;
  compatibility: Record<string, unknown>;
}

export function canonicalProductRecord(
  product: Product,
): CanonicalProductRecord {
  const source = product as Product & Record<string, unknown>;
  const compatibility = Object.fromEntries(
    Object.entries(source)
      .filter(([key]) => !PRODUCT_KEYS.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, stableValue(value)]),
  );

  return {
    id: String(product.id),
    itemType: product.itemType === "service" ? "service" : "product",
    code: String(product.code ?? ""),
    barcode:
      typeof source.barcode === "string" && source.barcode
        ? source.barcode
        : null,
    name: String(product.name ?? ""),
    priceMicros: decimalToMicros(product.price),
    costMicros: decimalToMicros(product.cost),
    ivaRateBasisPoints: taxRateToBasisPoints(product.ivaRate),
    stockMicros: decimalToMicros(product.stock),
    minStockMicros: decimalToMicros(product.minStock),
    unitMeasure:
      typeof source.unitMeasure === "string" && source.unitMeasure
        ? source.unitMeasure
        : null,
    active: source.active !== false,
    deleted: source.deleted === true,
    updatedAt: product.updatedAt ? String(product.updatedAt) : null,
    compatibility,
  };
}

export function serializeCanonicalProduct(product: Product): string {
  return JSON.stringify(canonicalProductRecord(product));
}

export async function hashProductRecord(product: Product): Promise<string> {
  const { CryptoDigestAlgorithm, digestStringAsync } =
    await import("expo-crypto");
  return digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    serializeCanonicalProduct(product),
  );
}
