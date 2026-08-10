import type { Sale } from "../types";
import type { HistoricalDocumentSummary } from "../services/backendApi/documentHistory";
import { compareSalesNewestFirst } from "./documents";

export type CombinedDocumentHistory = {
  sales: Sale[];
  historicalClientNames: Record<string, string>;
  historicalIds: Set<string>;
};

export type HistoricalDocumentsState = {
  contextKey: string;
  items: HistoricalDocumentSummary[];
  nextCursor: string | null;
  hasMore: boolean;
  requested: boolean;
  suspended: boolean;
};

export function initialHistoricalDocumentsState(contextKey = ""): HistoricalDocumentsState {
  return { contextKey, items: [], nextCursor: null, hasMore: true, requested: false, suspended: false };
}

export function historicalStateAfterPage(
  current: HistoricalDocumentsState,
  incoming: HistoricalDocumentSummary[],
  nextCursor: string | null,
  hasMore: boolean,
): HistoricalDocumentsState {
  return {
    contextKey: current.contextKey,
    items: appendHistoricalPage(current.items, incoming),
    nextCursor,
    hasMore,
    requested: true,
    suspended: false,
  };
}

export function historicalStateAfterFailure(current: HistoricalDocumentsState): HistoricalDocumentsState {
  return { ...current, items: [...current.items], suspended: true };
}

export function combineDocumentHistory(
  snapshotSales: Sale[],
  historicalItems: HistoricalDocumentSummary[],
  deletedSaleIds: readonly string[] = [],
): CombinedDocumentHistory {
  const deleted = new Set(deletedSaleIds);
  const snapshotIds = new Set(snapshotSales.map((sale) => sale.id));
  const historicalById = new Map<string, HistoricalDocumentSummary>();
  for (const item of historicalItems) {
    if (!deleted.has(item.documentId) && !snapshotIds.has(item.documentId) && !historicalById.has(item.documentId)) {
      historicalById.set(item.documentId, item);
    }
  }
  const historicalSales = [...historicalById.values()].map(historicalSummaryToSale);
  return {
    sales: [...snapshotSales, ...historicalSales].sort(compareSalesNewestFirst),
    historicalClientNames: Object.fromEntries([...historicalById.values()].map((item) => [item.documentId, item.clientDisplayName])),
    historicalIds: new Set(historicalById.keys()),
  };
}

export function appendHistoricalPage(
  current: HistoricalDocumentSummary[],
  incoming: HistoricalDocumentSummary[],
): HistoricalDocumentSummary[] {
  const byId = new Map(current.map((item) => [item.documentId, item]));
  for (const item of incoming) {
    if (!byId.has(item.documentId)) byId.set(item.documentId, item);
  }
  return [...byId.values()];
}

export function pageContainingFirstAppendedItem(currentItemCount: number, pageSize: number): number {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  return Math.floor(Math.max(0, currentItemCount) / safePageSize) + 1;
}

function historicalSummaryToSale(item: HistoricalDocumentSummary): Sale {
  return {
    id: item.documentId,
    documentType: "factura",
    establishment: item.establishment,
    emissionPoint: item.emissionPoint,
    clientId: item.clientId,
    userId: "",
    createdAt: item.createdAt,
    sequence: item.sequential,
    accessKey: "",
    authorizationNumber: item.authorizationNumberMasked,
    inventoryState: inventoryState(item.inventoryStatus),
    subtotal: micros(item.totalMicros),
    tax: 0,
    total: micros(item.totalMicros),
    paymentMethod: "01",
    paymentCondition: item.paymentCondition,
    creditBalance: item.creditBalanceMicros === undefined ? undefined : micros(item.creditBalanceMicros),
    status: "AUTORIZADA",
    items: [],
  };
}

function micros(value: string): number {
  return Number(value) / 1_000_000;
}

function inventoryState(value: string | undefined): Sale["inventoryState"] {
  return ["UNKNOWN", "NOT_APPLIED", "APPLIED", "REVERSED", "RECONCILIATION_PENDING"].includes(String(value))
    ? value as Sale["inventoryState"]
    : undefined;
}
