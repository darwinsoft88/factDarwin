import type { CreditAdjustment, CreditPayment } from "../../types";
import { SALE_DECIMAL_SCALE } from "./saleRecord";

const PAYMENT_KEYS = new Set([
  "id", "operationId", "batchId", "batchOperationId", "batchSize",
  "voidOperationId", "saleId", "clientId", "establishment",
  "emissionPoint", "establishmentName", "userId", "userName", "amount",
  "paymentMethod", "note", "createdAt", "voidedAt", "voidedByUserId",
  "voidedByUserName", "voidReason",
]);

const ADJUSTMENT_KEYS = new Set([
  "id", "operationId", "reverseOperationId", "type",
  "sourceCreditNoteId", "sourceSaleId", "clientId", "amount", "state",
  "appliedAt", "reversedAt", "userId", "reason",
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

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function integer(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : null;
}

function moneyMicros(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.round(numeric * SALE_DECIMAL_SCALE)
    : null;
}

function compatibility(
  source: Record<string, unknown>,
  keys: Set<string>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(source)
      .filter(([key]) => !keys.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, stableValue(value)]),
  );
}

export interface CanonicalCreditPayment {
  id: string;
  operationId: string | null;
  batchId: string | null;
  batchOperationId: string | null;
  batchSize: number | null;
  voidOperationId: string | null;
  saleId: string;
  clientId: string;
  establishment: string | null;
  emissionPoint: string | null;
  establishmentName: string | null;
  userId: string;
  userName: string;
  amountMicros: number | null;
  paymentMethod: string;
  note: string | null;
  paymentDate: string;
  voidedAt: string | null;
  voidedByUserId: string | null;
  voidedByUserName: string | null;
  voidReason: string | null;
  compatibility: Record<string, unknown>;
}

export interface CanonicalCreditAdjustment {
  id: string;
  operationId: string | null;
  reverseOperationId: string | null;
  adjustmentType: string;
  creditNoteId: string;
  saleId: string;
  clientId: string;
  amountMicros: number | null;
  status: string;
  appliedAt: string | null;
  reversedAt: string | null;
  userId: string;
  reason: string | null;
  compatibility: Record<string, unknown>;
}

export function canonicalCreditPayment(
  payment: CreditPayment,
): CanonicalCreditPayment {
  const source = payment as unknown as Record<string, unknown>;
  return {
    id: String(source.id ?? ""),
    operationId: text(source.operationId),
    batchId: text(source.batchId),
    batchOperationId: text(source.batchOperationId),
    batchSize: integer(source.batchSize),
    voidOperationId: text(source.voidOperationId),
    saleId: String(source.saleId ?? ""),
    clientId: String(source.clientId ?? ""),
    establishment: text(source.establishment),
    emissionPoint: text(source.emissionPoint),
    establishmentName: text(source.establishmentName),
    userId: String(source.userId ?? ""),
    userName: String(source.userName ?? ""),
    amountMicros: moneyMicros(source.amount),
    paymentMethod: String(source.paymentMethod ?? ""),
    note: text(source.note),
    paymentDate: String(source.createdAt ?? ""),
    voidedAt: text(source.voidedAt),
    voidedByUserId: text(source.voidedByUserId),
    voidedByUserName: text(source.voidedByUserName),
    voidReason: text(source.voidReason),
    compatibility: compatibility(source, PAYMENT_KEYS),
  };
}

export function canonicalCreditAdjustment(
  adjustment: CreditAdjustment,
): CanonicalCreditAdjustment {
  const source = adjustment as unknown as Record<string, unknown>;
  return {
    id: String(source.id ?? ""),
    operationId: text(source.operationId),
    reverseOperationId: text(source.reverseOperationId),
    adjustmentType: String(source.type ?? ""),
    creditNoteId: String(source.sourceCreditNoteId ?? ""),
    saleId: String(source.sourceSaleId ?? ""),
    clientId: String(source.clientId ?? ""),
    amountMicros: moneyMicros(source.amount),
    status: String(source.state ?? "UNKNOWN"),
    appliedAt: text(source.appliedAt),
    reversedAt: text(source.reversedAt),
    userId: String(source.userId ?? ""),
    reason: text(source.reason),
    compatibility: compatibility(source, ADJUSTMENT_KEYS),
  };
}

async function hash(value: unknown): Promise<string> {
  const { CryptoDigestAlgorithm, digestStringAsync } =
    await import("expo-crypto");
  return digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    JSON.stringify(value),
  );
}

export function hashCreditPayment(payment: CreditPayment): Promise<string> {
  return hash(canonicalCreditPayment(payment));
}

export function hashCreditAdjustment(
  adjustment: CreditAdjustment,
): Promise<string> {
  return hash(canonicalCreditAdjustment(adjustment));
}
