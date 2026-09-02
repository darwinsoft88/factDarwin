import { initialData } from "../database";
import { AppData, CreditAdjustment, CreditPayment, Issuer, IssuerEstablishment, Sale } from "../types";
import { sanitizeAppData } from "../validation";
import { isInventoryProduct } from "./catalogItems";
import { reconcileCreditBalancesFromPayments } from "./credit";
import { normalizedEstablishments } from "./establishments";

export function mergeAppDataSnapshots(remoteData: AppData, localData: AppData): AppData {
  const sameSequenceScope = sameIssuerSequenceScope(remoteData.issuer, localData.issuer);
  const merged = {
    ...remoteData,
    ...localData,
    issuer: {
      ...remoteData.issuer,
      ...localData.issuer,
      environment: canonicalIssuerEnvironment(remoteData.issuer, localData.issuer).environment,
      environmentVersion: canonicalIssuerEnvironment(remoteData.issuer, localData.issuer).environmentVersion,
      establishments: mergeIssuerEstablishments(remoteData.issuer, localData.issuer),
      establishmentsUpdatedAt: newerTimestamp(remoteData.issuer?.establishmentsUpdatedAt, localData.issuer?.establishmentsUpdatedAt),
      sequential: mergeIssuerSequence(remoteData.issuer?.sequential, localData.issuer?.sequential, sameSequenceScope),
      remissionSequential: mergeIssuerSequence(remoteData.issuer?.remissionSequential, localData.issuer?.remissionSequential, sameSequenceScope),
      creditNoteSequential: mergeIssuerSequence(remoteData.issuer?.creditNoteSequential, localData.issuer?.creditNoteSequential, sameSequenceScope)
    },
    users: mergeById(remoteData.users || [], localData.users || []),
    clients: mergeByLatestUpdatedAt(remoteData.clients || [], localData.clients || []),
    products: mergeByLatestUpdatedAt(remoteData.products || [], localData.products || []),
    sales: mergeSalesWithRemoteAuthority(remoteData.sales || [], localData.sales || [], localData),
    creditPayments: mergeCreditPaymentsWithinBalances(remoteData.sales || [], localData.sales || [], remoteData.creditPayments || [], localData.creditPayments || []),
    creditAdjustments: mergeCreditAdjustments(
      remoteData.creditAdjustments || [],
      localData.creditAdjustments || [],
      pendingCreditAdjustmentIds(localData)
    ),
    guides: prependUniqueById(remoteData.guides || [], localData.guides || []),
    receivedRetentions: prependUniqueById(remoteData.receivedRetentions || [], localData.receivedRetentions || []),
    cashClosings: prependUniqueById(remoteData.cashClosings || [], localData.cashClosings || []),
    inventoryMovements: prependUniqueById(remoteData.inventoryMovements || [], localData.inventoryMovements || []),
    auditLogs: prependUniqueById(remoteData.auditLogs || [], localData.auditLogs || []),
    backendUrl: localData.backendUrl || remoteData.backendUrl,
    autoBackupEnabled: localData.autoBackupEnabled,
    autoBackupLastAt: localData.autoBackupLastAt || remoteData.autoBackupLastAt || "",
    autoBackupLastError: localData.autoBackupLastError || "",
    pendingSync: localData.pendingSync || [],
    deletedIds: mergeDeletedIds(remoteData.deletedIds, localData.deletedIds),
    historyPolicy: remoteData.historyPolicy || localData.historyPolicy,
    license: remoteData.license || localData.license
  };
  return sanitizeAppData(reconcileProductStockFromMovements(reconcileCreditBalancesFromPayments(merged)));
}

function canonicalIssuerEnvironment(remoteIssuer: Issuer, localIssuer: Issuer) {
  const remoteVersion = normalizedEnvironmentVersion(remoteIssuer.environmentVersion);
  const localVersion = normalizedEnvironmentVersion(localIssuer.environmentVersion);
  if (remoteVersion >= localVersion) return { environment: remoteIssuer.environment, environmentVersion: remoteVersion };
  return { environment: localIssuer.environment, environmentVersion: localVersion };
}

function normalizedEnvironmentVersion(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : 1;
}

export type CreditAdjustmentMergeErrorCode =
  | "CREDIT_ADJUSTMENT_IDENTITY_CONFLICT"
  | "CREDIT_ADJUSTMENT_OPERATION_CONFLICT"
  | "CREDIT_ADJUSTMENT_REVERSE_OPERATION_CONFLICT"
  | "INVALID_CREDIT_ADJUSTMENT_SNAPSHOT";

export class CreditAdjustmentMergeError extends Error {
  readonly code: CreditAdjustmentMergeErrorCode;

  constructor(code: CreditAdjustmentMergeErrorCode) {
    super("Los ajustes de cartera no se pueden mezclar de forma segura.");
    this.name = "CreditAdjustmentMergeError";
    this.code = code;
  }
}

function pendingCreditAdjustmentIds(data: AppData) {
  const ids = new Set<string>();
  (data.pendingSync || []).forEach((pending) => {
    const patch = pending.patch;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) return;
    const adjustments = (patch as { creditAdjustments?: unknown }).creditAdjustments;
    if (!Array.isArray(adjustments)) return;
    adjustments.forEach((adjustment) => {
      if (adjustment && typeof adjustment === "object" && !Array.isArray(adjustment) && typeof (adjustment as { id?: unknown }).id === "string") {
        ids.add((adjustment as { id: string }).id);
      }
    });
  });
  return ids;
}

function validAdjustmentIdentity(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200 && value === value.trim();
}

function adjustmentIdentity(adjustment: CreditAdjustment, field: "operationId" | "reverseOperationId") {
  if (!Object.prototype.hasOwnProperty.call(adjustment, field)) return undefined;
  const value = adjustment[field];
  if (!validAdjustmentIdentity(value)) throw new CreditAdjustmentMergeError("INVALID_CREDIT_ADJUSTMENT_SNAPSHOT");
  return value;
}

function assertAdjustment(adjustment: CreditAdjustment) {
  if (!adjustment || typeof adjustment !== "object" || Array.isArray(adjustment) || !validAdjustmentIdentity(adjustment.id)) {
    throw new CreditAdjustmentMergeError("INVALID_CREDIT_ADJUSTMENT_SNAPSHOT");
  }
  adjustmentIdentity(adjustment, "operationId");
  adjustmentIdentity(adjustment, "reverseOperationId");
}

const MATERIAL_ADJUSTMENT_FIELDS = ["type", "sourceCreditNoteId", "sourceSaleId", "clientId", "amount"] as const;

function mergeSameAdjustment(remote: CreditAdjustment, local: CreditAdjustment, localPending: boolean) {
  const remoteOperationId = adjustmentIdentity(remote, "operationId");
  const localOperationId = adjustmentIdentity(local, "operationId");
  if (remoteOperationId && localOperationId && remoteOperationId !== localOperationId) {
    throw new CreditAdjustmentMergeError("CREDIT_ADJUSTMENT_OPERATION_CONFLICT");
  }
  const remoteReverseOperationId = adjustmentIdentity(remote, "reverseOperationId");
  const localReverseOperationId = adjustmentIdentity(local, "reverseOperationId");
  if (remoteReverseOperationId && localReverseOperationId && remoteReverseOperationId !== localReverseOperationId) {
    throw new CreditAdjustmentMergeError("CREDIT_ADJUSTMENT_REVERSE_OPERATION_CONFLICT");
  }
  MATERIAL_ADJUSTMENT_FIELDS.forEach((field) => {
    const remoteValue = remote[field];
    const localValue = local[field];
    if (remoteValue !== undefined && localValue !== undefined && remoteValue !== localValue) {
      throw new CreditAdjustmentMergeError("INVALID_CREDIT_ADJUSTMENT_SNAPSHOT");
    }
  });

  const reversed = remote.state === "REVERSED" ? remote : local.state === "REVERSED" ? local : undefined;
  const remoteCompleteness = Object.values(remote).filter((value) => value !== undefined).length;
  const localCompleteness = Object.values(local).filter((value) => value !== undefined).length;
  const preferred = reversed || (localPending || localCompleteness >= remoteCompleteness ? local : remote);
  const other = preferred === local ? remote : local;
  const merged = { ...other } as CreditAdjustment & Record<string, unknown>;
  Object.entries(preferred as CreditAdjustment & Record<string, unknown>).forEach(([key, value]) => {
    if (value !== undefined) merged[key] = value;
  });
  if (remoteOperationId || localOperationId) merged.operationId = localOperationId || remoteOperationId;
  if (remoteReverseOperationId || localReverseOperationId) merged.reverseOperationId = localReverseOperationId || remoteReverseOperationId;
  if (reversed) {
    merged.state = "REVERSED";
    for (const field of ["reversedAt", "reversalReason", "reverseOperationId"] as const) {
      const value = (reversed as CreditAdjustment & Record<string, unknown>)[field];
      if (value !== undefined) (merged as Record<string, unknown>)[field] = value;
    }
  }
  return merged as CreditAdjustment;
}

export function mergeCreditAdjustments(remoteItems: CreditAdjustment[], localItems: CreditAdjustment[], localPendingIds = new Set<string>()) {
  const orderedIds: string[] = [];
  const byId = new Map<string, CreditAdjustment>();
  [...remoteItems, ...localItems].forEach((adjustment) => {
    assertAdjustment(adjustment);
    if (!byId.has(adjustment.id)) orderedIds.push(adjustment.id);
    const existing = byId.get(adjustment.id);
    byId.set(adjustment.id, existing ? mergeSameAdjustment(existing, adjustment, localPendingIds.has(adjustment.id)) : adjustment);
  });

  const operationIds = new Map<string, string>();
  const reverseOperationIds = new Map<string, string>();
  byId.forEach((adjustment, id) => {
    for (const [field, identities] of [["operationId", operationIds], ["reverseOperationId", reverseOperationIds]] as const) {
      const identity = adjustmentIdentity(adjustment, field);
      if (!identity) continue;
      const existingId = identities.get(identity);
      if (existingId && existingId !== id) throw new CreditAdjustmentMergeError("CREDIT_ADJUSTMENT_IDENTITY_CONFLICT");
      identities.set(identity, id);
    }
  });

  const indexed = orderedIds.map((id, index) => ({ adjustment: byId.get(id)!, index }));
  return indexed.sort((left, right) => {
    const leftTime = new Date((left.adjustment as CreditAdjustment & { createdAt?: string }).createdAt || "").getTime();
    const rightTime = new Date((right.adjustment as CreditAdjustment & { createdAt?: string }).createdAt || "").getTime();
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return leftTime - rightTime;
    return left.index - right.index || left.adjustment.id.localeCompare(right.adjustment.id);
  }).map(({ adjustment }) => adjustment);
}

export function addedEstablishmentIds(previousIssuer: Issuer, nextIssuer: Issuer) {
  const previousIds = new Set(normalizedEstablishments(previousIssuer).map((item) => item.id));
  return normalizedEstablishments(nextIssuer)
    .map((item) => item.id)
    .filter((id) => !previousIds.has(id));
}

function mergeDeletedIds(remoteDeleted?: AppData["deletedIds"], localDeleted?: AppData["deletedIds"]) {
  return {
    clients: Array.from(new Set([...(remoteDeleted?.clients || []), ...(localDeleted?.clients || [])])),
    products: Array.from(new Set([...(remoteDeleted?.products || []), ...(localDeleted?.products || [])])),
    users: Array.from(new Set([...(remoteDeleted?.users || []), ...(localDeleted?.users || [])])),
    sales: Array.from(new Set([...(remoteDeleted?.sales || []), ...(localDeleted?.sales || [])])),
    guides: Array.from(new Set([...(remoteDeleted?.guides || []), ...(localDeleted?.guides || [])])),
    inventoryMovements: Array.from(new Set([...(remoteDeleted?.inventoryMovements || []), ...(localDeleted?.inventoryMovements || [])]))
  };
}

function sameIssuerSequenceScope(remoteIssuer?: Partial<Issuer>, localIssuer?: Partial<Issuer>) {
  return String(remoteIssuer?.environment || "1") === String(localIssuer?.environment || "1")
    && String(remoteIssuer?.establishment || "") === String(localIssuer?.establishment || "")
    && String(remoteIssuer?.emissionPoint || "") === String(localIssuer?.emissionPoint || "");
}

function mergeIssuerSequence(remoteValue: unknown, localValue: unknown, sameSequenceScope: boolean) {
  const localSequence = Number(localValue || 1);
  if (!sameSequenceScope) return localSequence;
  return Math.max(Number(remoteValue || 1), localSequence);
}

function mergeIssuerEstablishments(remoteIssuer?: Issuer, localIssuer?: Issuer) {
  const localIssuerTime = timestampOf(localIssuer?.establishmentsUpdatedAt);
  const remoteIssuerTime = timestampOf(remoteIssuer?.establishmentsUpdatedAt);
  if (localIssuerTime !== remoteIssuerTime) {
    return normalizedEstablishments((localIssuerTime > remoteIssuerTime ? localIssuer : remoteIssuer) || initialData.issuer);
  }
  const byId = new Map<string, IssuerEstablishment>();
  normalizedEstablishments(remoteIssuer || initialData.issuer).forEach((item) => byId.set(item.id, item));
  normalizedEstablishments(localIssuer || initialData.issuer).forEach((item) => {
    const previous = byId.get(item.id);
    if (!previous) {
      byId.set(item.id, item);
      return;
    }
    const localTime = timestampOf(item.updatedAt);
    const remoteTime = timestampOf(previous.updatedAt);
    const localWinsStatus = localTime >= remoteTime;
    byId.set(item.id, {
      ...previous,
      ...item,
      active: localWinsStatus ? item.active !== false : previous.active !== false,
      updatedAt: localTime >= remoteTime ? item.updatedAt : previous.updatedAt,
      sequential: Math.max(previous.sequential || 1, item.sequential || 1),
      remissionSequential: Math.max(previous.remissionSequential || 1, item.remissionSequential || 1),
      creditNoteSequential: Math.max(previous.creditNoteSequential || 1, item.creditNoteSequential || 1)
    });
  });
  return Array.from(byId.values());
}

function newerTimestamp(first?: string, second?: string) {
  return timestampOf(second) >= timestampOf(first) ? second || first || "" : first || second || "";
}

function mergeById<T extends { id: string }>(remoteItems: T[], localItems: T[]) {
  const byId = new Map<string, T>();
  remoteItems.forEach((item) => byId.set(item.id, item));
  localItems.forEach((item) => byId.set(item.id, item));
  return Array.from(byId.values());
}

function mergeByLatestUpdatedAt<T extends { id: string; updatedAt?: string }>(remoteItems: T[], localItems: T[]) {
  const byId = new Map<string, T>();
  remoteItems.forEach((item) => byId.set(item.id, item));
  localItems.forEach((item) => {
    const previous = byId.get(item.id);
    if (!previous || timestampOf(item.updatedAt) >= timestampOf(previous.updatedAt)) {
      byId.set(item.id, item);
    }
  });
  return Array.from(byId.values());
}

function prependUniqueById<T extends { id: string }>(remoteItems: T[], localItems: T[]) {
  const seen = new Set<string>();
  const result: T[] = [];
  [...localItems, ...remoteItems].forEach((item) => {
    if (!item?.id || seen.has(item.id)) return;
    seen.add(item.id);
    result.push(item);
  });
  return result;
}

function mergeSalesWithRemoteAuthority(remoteSales: Sale[], localSales: Sale[], localData: AppData) {
  const remoteById = new Map(remoteSales.filter((sale) => sale?.id).map((sale) => [sale.id, sale]));
  const protectedLocalIds = pendingSaleIds(localData);
  const seen = new Set<string>();
  const result: Sale[] = [];

  localSales.forEach((localSale) => {
    if (!localSale?.id || seen.has(localSale.id)) return;
    const remoteSale = remoteById.get(localSale.id);
    result.push(preferredSale(remoteSale, localSale, protectedLocalIds.has(localSale.id)));
    seen.add(localSale.id);
  });
  remoteSales.forEach((remoteSale) => {
    if (!remoteSale?.id || seen.has(remoteSale.id)) return;
    result.push(remoteSale);
    seen.add(remoteSale.id);
  });
  return result;
}

function preferredSale(remoteSale: Sale | undefined, localSale: Sale, localPending: boolean): Sale {
  if (!remoteSale) return localSale;

  // AUTORIZADA es un estado fiscal definitivo y no puede ser degradado
  // por una copia local pendiente o atrasada.
  if (remoteSale.status === "AUTORIZADA") return remoteSale;

  if (localSale.status === "AUTORIZADA") {
    return localSale;
  }

  if (localPending) return localSale;
  if (["ANULADA", "CONVERTIDA"].includes(localSale.status) && !["AUTORIZADA", "ANULADA", "CONVERTIDA"].includes(remoteSale.status)) {
    return localSale;
  }

  return remoteSale;
}

function pendingSaleIds(data: AppData) {
  const ids = new Set<string>();
  (data.pendingSync || []).forEach((pending) => {
    const patch = pending.patch;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) return;
    const sales = (patch as { sales?: unknown }).sales;
    if (!Array.isArray(sales)) return;
    sales.forEach((sale) => {
      if (sale && typeof sale === "object" && !Array.isArray(sale) && typeof (sale as { id?: unknown }).id === "string") {
        ids.add((sale as { id: string }).id);
      }
    });
  });
  return ids;
}

function mergeCreditPaymentsWithinBalances(
  remoteSales: Sale[],
  localSales: Sale[],
  remotePayments: CreditPayment[],
  localPayments: CreditPayment[]
) {
  const salesById = new Map<string, Sale>();
  [...localSales, ...remoteSales].forEach((sale) => {
    if (sale?.id) salesById.set(sale.id, sale);
  });

  const seen = new Set<string>();
  const paidBySale = new Map<string, number>();
  const result: CreditPayment[] = [];
  const candidates = [...remotePayments, ...localPayments].sort((a, b) => {
    const remoteA = remotePayments.some((item) => item.id === a.id) ? 0 : 1;
    const remoteB = remotePayments.some((item) => item.id === b.id) ? 0 : 1;
    if (remoteA !== remoteB) return remoteA - remoteB;
    return timestampOf(a.createdAt) - timestampOf(b.createdAt);
  });

  candidates.forEach((payment) => {
    if (!payment?.id || seen.has(payment.id)) return;
    seen.add(payment.id);

    if (payment.voidedAt) {
      result.push(payment);
      return;
    }

    const sale = salesById.get(payment.saleId);
    if (!sale || sale.paymentCondition !== "credito") {
      result.push(payment);
      return;
    }

    const total = roundMoney(sale.total);
    const paid = paidBySale.get(payment.saleId) || 0;
    const amount = roundMoney(payment.amount);
    if (paid + amount > total + 0.009) return;

    paidBySale.set(payment.saleId, roundMoney(paid + amount));
    result.push(payment);
  });

  return result.sort((a, b) => timestampOf(b.createdAt) - timestampOf(a.createdAt));
}

function reconcileProductStockFromMovements(data: AppData): AppData {
  const movementsByProduct = new Map<string, AppData["inventoryMovements"]>();
  (data.inventoryMovements || []).forEach((movement) => {
    if (!movement.productId) return;
    const movements = movementsByProduct.get(movement.productId) || [];
    movements.push(movement);
    movementsByProduct.set(movement.productId, movements);
  });

  const products = (data.products || []).map((product) => {
    if (!isInventoryProduct(product)) {
      return { ...product, stock: 0, minStock: 0 };
    }
    const movements = movementsByProduct.get(product.id);
    if (!movements?.length) return product;

    const sorted = [...movements].sort((a, b) => {
      const dateDiff = timestampOf(a.createdAt) - timestampOf(b.createdAt);
      return dateDiff !== 0 ? dateDiff : a.id.localeCompare(b.id);
    });
    let stock = finiteNumber(sorted[0]?.stockBefore, product.stock);
    let updatedAt = product.updatedAt || "";
    sorted.forEach((movement) => {
      const quantity = Math.max(0, finiteNumber(movement.quantity, 0));
      if (movement.type === "entrada") stock += quantity;
      if (movement.type === "salida") stock -= quantity;
      if (movement.type === "ajuste") stock = finiteNumber(movement.stockAfter, stock);
      if (timestampOf(movement.createdAt) >= timestampOf(updatedAt)) updatedAt = movement.createdAt || updatedAt;
    });
    return { ...product, stock, updatedAt: updatedAt || product.updatedAt };
  });

  return { ...data, products };
}

function finiteNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundMoney(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function timestampOf(value?: string) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}
