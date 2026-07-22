import { authorizeInvoice } from "../services/backend";
import { buildCreditNoteXml, buildInvoiceXml } from "../sri";
import type { AppDataMutation } from "../database/storage";
import { AppData, Sale, User } from "../types";
import { appendAudit } from "./audit";
import { resolveInvoiceStatus } from "./documents";
import { issuerForSale } from "./establishments";
import { reverseSaleInventoryOnce, SaleInventoryError } from "./inventory";
import { isCreditNoteSale, isInvoiceSale, resolveSaleInventoryState, uniquePendingOfficialInvoices } from "./sales";
import { isDocumentCorrectionIssue, isStaleSriPendingDocument, isTransientSriIssue, shouldAutoRetrySriDocument, staleSriPendingMessage } from "./sriRetryPolicy";
import { userFriendlyActionError } from "./sriMessages";

type DurableAppDataMutation = (
  mutation: AppDataMutation,
  options?: { skipAutoBackup?: boolean; syncState?: "pending" }
) => Promise<AppData>;

type AutoRetrySriDocumentsParams = {
  backendToken: string;
  initialData: AppData;
  getCurrentData: () => AppData;
  maxDocuments?: number;
  persistMutation: DurableAppDataMutation;
  user: User;
};

export type AutoRetrySriDocumentsResult = {
  attempted: number;
  processed: number;
  authorized: number;
  failed: number;
  expired: number;
};

type RetryTransitionResult = {
  authorized: boolean;
  changed: boolean;
  failed: boolean;
};

const durableMutationOptions = { skipAutoBackup: true, syncState: "pending" as const };
const definitiveFailureStatuses = new Set<Sale["status"]>(["DEVUELTA", "ERROR_SRI", "ANULADA"]);

export function pendingAutoRetrySriDocuments(data: AppData, maxDocuments = 3) {
  const now = new Date();
  const candidates = data.sales
    .filter((sale) => shouldAutoRetrySriDocument(sale, now))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return uniquePendingOfficialInvoices(candidates)
    .slice(0, maxDocuments);
}

function retryFingerprint(sale: Sale): string {
  return JSON.stringify({
    accessKey: sale.accessKey,
    clientId: sale.clientId,
    documentType: sale.documentType,
    inventoryOperationId: sale.inventoryOperationId,
    inventoryState: sale.inventoryState,
    items: sale.items,
    retryHistory: sale.retryHistory,
    sequence: sale.sequence,
    sourceSaleId: sale.sourceSaleId,
    status: sale.status
  });
}

function isDefinitiveFailure(sale: Sale): boolean {
  if (!definitiveFailureStatuses.has(sale.status)) return false;
  if (sale.status !== "ERROR_SRI") return true;
  const message = sale.sriMessage || "";
  return !isTransientSriIssue(message) || isDocumentCorrectionIssue(message);
}

function inventoryConsistencyError(sale: Sale): SaleInventoryError {
  const operationId = sale.inventoryOperationId || sale.id;
  const state = resolveSaleInventoryState(sale);
  return new SaleInventoryError(
    state === "UNKNOWN"
      ? "SALE_INVENTORY_LEGACY_RECONCILIATION_REQUIRED"
      : "SALE_INVENTORY_OPERATION_MISMATCH",
    sale.id,
    operationId,
    "APPLY"
  );
}

function isTicketDerivedInvoice(data: AppData, sale: Sale) {
  if (!sale.sourceSaleId) return false;
  return data.sales.some((item) => item.id === sale.sourceSaleId && item.documentType === "nota_venta");
}

function convertedSourceSale(source: Sale, invoice: Sale, convertedAt: string): Sale {
  if (source.convertedToSaleId === invoice.id && source.status === "CONVERTIDA") return source;
  return {
    ...source,
    status: "CONVERTIDA",
    voidReason: `Convertida a factura ${invoice.sequence}`,
    voidedAt: source.voidedAt || convertedAt,
    convertedAt: source.convertedAt || convertedAt,
    convertedToSaleId: invoice.id,
    convertedToSequence: invoice.sequence,
    sriMessage: `Convertida a factura ${invoice.sequence}`
  };
}

function applyStaleSriPendingTransition(
  current: AppData,
  user: User,
  now: Date,
  allowedIds?: ReadonlySet<string>
) {
  let expired = 0;
  let failed = 0;
  const expiredAt = now.toISOString();
  const staleDocuments = uniquePendingOfficialInvoices(
    current.sales.filter((sale) => (!allowedIds || allowedIds.has(sale.id)) && isStaleSriPendingDocument(sale, now))
  );
  if (staleDocuments.length === 0) return { data: current, expired, failed, changed: false };

  let products = current.products;
  let movements = current.inventoryMovements || [];
  const updatedSales = new Map<string, Sale>();

  for (const currentSale of staleDocuments) {
    const ticketDerived = isInvoiceSale(currentSale) && isTicketDerivedInvoice(current, currentSale);
    let expiredSale = currentSale;

    if (isInvoiceSale(currentSale) && !ticketDerived) {
      const inventoryState = resolveSaleInventoryState(currentSale);
      if (inventoryState === "UNKNOWN") {
        failed += 1;
        continue;
      }
      if (inventoryState === "APPLIED") {
        try {
          const reversed = reverseSaleInventoryOnce({
            products,
            movements,
            sale: currentSale,
            operationId: currentSale.inventoryOperationId || currentSale.id,
            userId: user.id,
            createdAt: expiredAt,
            reason: "Anulacion automatica SRI fuera de fecha"
          });
          products = reversed.products;
          movements = reversed.movements;
          expiredSale = reversed.sale;
        } catch (error) {
          if (error instanceof SaleInventoryError) {
            failed += 1;
            continue;
          }
          throw error;
        }
      }
    }

    updatedSales.set(currentSale.id, {
      ...expiredSale,
      status: "ANULADA",
      voidedAt: expiredSale.voidedAt || expiredAt,
      voidReason: expiredSale.voidReason || "Anulada automaticamente: fuera del dia permitido para envio al SRI.",
      sriMessage: staleSriPendingMessage(expiredSale)
    });
    expired += 1;
  }

  if (updatedSales.size === 0) return { data: current, expired, failed, changed: false };
  const sales = current.sales.map((sale) => updatedSales.get(sale.id) || sale);
  const data = appendAudit(
      { ...current, products, inventoryMovements: movements, sales },
      user,
      "SRI_PENDING_EXPIRED",
      "sale",
      staleDocuments.find((sale) => updatedSales.has(sale.id))?.id || "",
      `${updatedSales.size} documento(s) SRI fuera de fecha anulados`,
      { count: updatedSales.size, sequences: staleDocuments.filter((sale) => updatedSales.has(sale.id)).map((sale) => sale.sequence) }
  );
  return { data, expired, failed, changed: true };
}

export function expireStaleSriPendingDocuments(data: AppData, user: User, now = new Date()) {
  return applyStaleSriPendingTransition(data, user, now);
}

async function persistExpiredSriPendingDocuments(
  initialData: AppData,
  persistMutation: DurableAppDataMutation,
  user: User
) {
  const now = new Date();
  const initialStaleIds = new Set(
    uniquePendingOfficialInvoices(initialData.sales.filter((sale) => isStaleSriPendingDocument(sale, now)))
      .map((sale) => sale.id)
  );
  if (initialStaleIds.size === 0) return { expired: 0, failed: 0, changed: false };

  let result = { expired: 0, failed: 0, changed: false };
  await persistMutation((current) => {
    const transition = applyStaleSriPendingTransition(current, user, now, initialStaleIds);
    result = { expired: transition.expired, failed: transition.failed, changed: transition.changed };
    return transition.data;
  }, durableMutationOptions);

  return result;
}

async function persistRemoteFailure(
  saleId: string,
  requestFingerprint: string,
  message: string,
  retryAt: string,
  persistMutation: DurableAppDataMutation,
  user: User
) {
  let changed = false;
  await persistMutation((current) => {
    const currentSale = current.sales.find((sale) => sale.id === saleId);
    if (!currentSale || retryFingerprint(currentSale) !== requestFingerprint || !shouldAutoRetrySriDocument(currentSale)) return current;
    const updatedSale: Sale = {
      ...currentSale,
      sriMessage: message,
      retryHistory: [...(currentSale.retryHistory || []), retryAt]
    };
    changed = true;
    return appendAudit(
      { ...current, sales: current.sales.map((sale) => sale.id === saleId ? updatedSale : sale) },
      user,
      isCreditNoteSale(currentSale) ? "CREDIT_NOTE_AUTO_RETRY_FAILED" : "INVOICE_AUTO_RETRY_FAILED",
      "sale",
      saleId,
      `Reintento automatico fallido ${currentSale.sequence}`,
      { error: message }
    );
  }, durableMutationOptions);
  return changed;
}

async function persistSriResult(
  saleId: string,
  requestFingerprint: string,
  sriResult: Awaited<ReturnType<typeof authorizeInvoice>>,
  retryAt: string,
  persistMutation: DurableAppDataMutation,
  user: User
): Promise<RetryTransitionResult> {
  let transition: RetryTransitionResult = { authorized: false, changed: false, failed: false };

  await persistMutation((current) => {
    const currentSale = current.sales.find((sale) => sale.id === saleId);
    if (!currentSale || retryFingerprint(currentSale) !== requestFingerprint || !shouldAutoRetrySriDocument(currentSale)) return current;

    let updatedSale: Sale = {
      ...currentSale,
      accessKey: sriResult.accessKey || currentSale.accessKey,
      authorizationNumber: sriResult.authorizationNumber,
      authorizationDate: sriResult.authorizationDate,
      sriEnvironment: sriResult.sriEnvironment,
      sriMessage: sriResult.sriMessage,
      signedXml: sriResult.signedXml,
      authorizedXml: sriResult.authorizedXml,
      status: resolveInvoiceStatus(sriResult),
      retryHistory: [...(currentSale.retryHistory || []), retryAt]
    };
    let products = current.products;
    let movements = current.inventoryMovements || [];
    const sourceSale = updatedSale.sourceSaleId
      ? current.sales.find((sale) => sale.id === updatedSale.sourceSaleId)
      : undefined;
    const ticketDerived = isInvoiceSale(updatedSale) && sourceSale?.documentType === "nota_venta";

    if (isInvoiceSale(updatedSale) && !ticketDerived) {
      const inventoryState = resolveSaleInventoryState(currentSale);
      if (updatedSale.status === "AUTORIZADA" || !isDefinitiveFailure(updatedSale)) {
        if (inventoryState !== "APPLIED") throw inventoryConsistencyError(currentSale);
      } else if (inventoryState === "UNKNOWN") {
        throw inventoryConsistencyError(currentSale);
      } else if (inventoryState === "APPLIED") {
        const reversed = reverseSaleInventoryOnce({
          products,
          movements,
          sale: updatedSale,
          operationId: currentSale.inventoryOperationId || currentSale.id,
          userId: user.id,
          createdAt: retryAt,
          reason: `Reverso por estado ${updatedSale.status}`
        });
        products = reversed.products;
        movements = reversed.movements;
        updatedSale = reversed.sale;
      }
    } else if (ticketDerived) {
      updatedSale = { ...updatedSale, inventoryState: "NOT_APPLIED", inventoryOperationId: undefined };
    }

    let sales = current.sales.map((sale) => sale.id === saleId ? updatedSale : sale);
    if (updatedSale.status === "AUTORIZADA" && sourceSale && (sourceSale.documentType === "nota_venta" || sourceSale.documentType === "proforma")) {
      if (sourceSale.status === "CONVERTIDA" && sourceSale.convertedToSaleId && sourceSale.convertedToSaleId !== updatedSale.id) {
        throw new Error("El documento de origen ya fue convertido a otro comprobante.");
      }
      if (sourceSale.documentType === "nota_venta" && resolveSaleInventoryState(sourceSale) !== "APPLIED") {
        throw inventoryConsistencyError(sourceSale);
      }
      const converted = convertedSourceSale(sourceSale, updatedSale, retryAt);
      sales = sales.map((sale) => sale.id === converted.id ? converted : sale);
    }

    transition = {
      authorized: updatedSale.status === "AUTORIZADA",
      changed: true,
      failed: updatedSale.status !== "AUTORIZADA"
    };
    return appendAudit(
      { ...current, products, inventoryMovements: movements, sales },
      user,
      isCreditNoteSale(currentSale) ? "CREDIT_NOTE_AUTO_RETRIED" : "INVOICE_AUTO_RETRIED",
      "sale",
      saleId,
      `Reintento automatico ${currentSale.sequence}: ${updatedSale.status}`,
      { status: updatedSale.status, accessKey: updatedSale.accessKey }
    );
  }, durableMutationOptions);

  return transition;
}

export async function autoRetrySriDocuments({
  backendToken,
  initialData,
  getCurrentData,
  maxDocuments = 3,
  persistMutation,
  user
}: AutoRetrySriDocumentsParams): Promise<AutoRetrySriDocumentsResult> {
  let attempted = 0;
  let processed = 0;
  let authorized = 0;
  let failed = 0;

  const expiredResult = await persistExpiredSriPendingDocuments(initialData, persistMutation, user);
  if (expiredResult.changed) processed += expiredResult.expired;
  failed += expiredResult.failed;

  const candidateIds = pendingAutoRetrySriDocuments(initialData, maxDocuments).map((sale) => sale.id);
  for (const saleId of candidateIds) {
    const latest = getCurrentData();
    const sale = latest.sales.find((item) => item.id === saleId);
    if (!sale || !shouldAutoRetrySriDocument(sale)) continue;
    const requestFingerprint = retryFingerprint(sale);
    const retryAt = new Date().toISOString();
    if (isInvoiceSale(sale)) {
      const sourceSale = sale.sourceSaleId
        ? latest.sales.find((item) => item.id === sale.sourceSaleId)
        : undefined;
      const ticketDerived = sourceSale?.documentType === "nota_venta";
      const invoiceInventoryState = resolveSaleInventoryState(sale);
      const ticketInventoryState = sourceSale ? resolveSaleInventoryState(sourceSale) : undefined;
      if (
        (ticketDerived && (invoiceInventoryState !== "NOT_APPLIED" || ticketInventoryState !== "APPLIED")) ||
        (!ticketDerived && invoiceInventoryState !== "APPLIED")
      ) {
        failed += 1;
        continue;
      }
    }
    const client = latest.clients.find((item) => item.id === sale.clientId);
    if (!client) {
      const changed = await persistRemoteFailure(saleId, requestFingerprint, "No se encontro el cliente del documento.", retryAt, persistMutation, user);
      if (changed) processed += 1;
      failed += 1;
      continue;
    }
    let unsignedXml: string;
    try {
      const saleIssuer = issuerForSale(latest.issuer, sale);
      unsignedXml = isCreditNoteSale(sale)
        ? buildCreditNoteXml(sale, client, saleIssuer)
        : buildInvoiceXml(sale, client, saleIssuer);
    } catch (error) {
      const message = userFriendlyActionError(error, "authorize-invoice");
      const changed = await persistRemoteFailure(saleId, requestFingerprint, message, retryAt, persistMutation, user);
      if (changed) processed += 1;
      failed += 1;
      continue;
    }
    attempted += 1;

    let sriResult: Awaited<ReturnType<typeof authorizeInvoice>>;
    try {
      sriResult = await authorizeInvoice(latest.backendUrl, unsignedXml, backendToken);
    } catch (error) {
      const message = userFriendlyActionError(error, "authorize-invoice");
      try {
        if (await persistRemoteFailure(saleId, requestFingerprint, message, retryAt, persistMutation, user)) processed += 1;
      } finally {
        failed += 1;
      }
      continue;
    }

    try {
      const transition = await persistSriResult(saleId, requestFingerprint, sriResult, retryAt, persistMutation, user);
      if (!transition.changed) continue;
      processed += 1;
      if (transition.authorized) authorized += 1;
      if (transition.failed) failed += 1;
    } catch (error) {
      if (error instanceof SaleInventoryError) {
        failed += 1;
        continue;
      }
      throw error;
    }
  }

  return { attempted, processed, authorized, failed, expired: expiredResult.expired };
}
