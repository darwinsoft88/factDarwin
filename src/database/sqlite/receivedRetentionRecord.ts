import type { ReceivedRetention } from "../../types";

export const RETENTION_DECIMAL_SCALE = 1_000_000;

const MODELED_KEYS = new Set([
  "id", "saleId", "clientId", "userId", "createdAt", "receivedAt",
  "documentNumber", "authorizationNumber", "taxType", "code", "base",
  "percentage", "amount", "notes",
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

function optionalText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function decimalMicros(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.round(numeric * RETENTION_DECIMAL_SCALE)
    : null;
}

export interface CanonicalReceivedRetention {
  id: string;
  saleId: string;
  clientId: string;
  userId: string;
  createdAt: string;
  receivedAt: string;
  documentNumber: string;
  authorizationNumber: string | null;
  taxType: string;
  code: string | null;
  baseMicros: number | null;
  percentageMicros: number | null;
  amountMicros: number | null;
  notes: string | null;
  compatibility: Record<string, unknown>;
}

export function canonicalReceivedRetention(
  retention: ReceivedRetention,
): CanonicalReceivedRetention {
  const source = retention as unknown as Record<string, unknown>;
  return {
    id: String(source.id ?? ""),
    saleId: String(source.saleId ?? ""),
    clientId: String(source.clientId ?? ""),
    userId: String(source.userId ?? ""),
    createdAt: String(source.createdAt ?? ""),
    receivedAt: String(source.receivedAt ?? ""),
    documentNumber: String(source.documentNumber ?? ""),
    authorizationNumber: optionalText(source.authorizationNumber),
    taxType: String(source.taxType ?? ""),
    code: optionalText(source.code),
    baseMicros: decimalMicros(source.base),
    percentageMicros: decimalMicros(source.percentage),
    amountMicros: decimalMicros(source.amount),
    notes: optionalText(source.notes),
    compatibility: Object.fromEntries(
      Object.entries(source)
        .filter(([key]) => !MODELED_KEYS.has(key))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => [key, stableValue(value)]),
    ),
  };
}

export async function hashReceivedRetention(
  retention: ReceivedRetention,
): Promise<string> {
  const { CryptoDigestAlgorithm, digestStringAsync } =
    await import("expo-crypto");
  return digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    JSON.stringify(canonicalReceivedRetention(retention)),
  );
}
