import { authorizeInvoice } from "../services/backend";
import { buildCreditNoteXml, buildInvoiceXml } from "../sri";
import { AppData, InventoryMovement, Sale, User } from "../types";
import { appendAudit } from "./audit";
import { isInventoryProduct } from "./catalogItems";
import { resolveInvoiceStatus } from "./documents";
import { issuerForSale } from "./establishments";
import { generateId } from "./id";
import { isSriRejected, isTicketOffline } from "./invoiceStatus";
import { isCreditNoteSale, isInvoiceSale, saleNeedsStockDiscount, saleStatusReducesStock, uniquePendingOfficialInvoices } from "./sales";
import { isStaleSriPendingDocument, shouldAutoRetrySriDocument, staleSriPendingMessage } from "./sriRetryPolicy";
import { userFriendlyActionError } from "./sriMessages";

type AutoRetrySriParams = {
  backendToken: string;
  data: AppData;
  maxDocuments?: number;
  user: User;
};

export function pendingAutoRetrySriDocuments(data: AppData, maxDocuments = 3) {
  const now = new Date();
  const candidates = data.sales
    .filter((sale) => shouldAutoRetrySriDocument(sale, now))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return uniquePendingOfficialInvoices(candidates)
    .slice(0, maxDocuments);
}

export async function autoRetrySriDocuments({ backendToken, data, maxDocuments = 3, user }: AutoRetrySriParams) {
  const expiredResult = expireStaleSriPendingDocuments(data, user);
  let nextData = expiredResult.data;
  let processed = 0;
  let authorized = 0;
  let failed = 0;

  for (const sale of pendingAutoRetrySriDocuments(nextData, maxDocuments)) {
    processed += 1;
    const result = await autoRetryOneSriDocument(nextData, sale, backendToken, user);
    nextData = result.data;
    if (result.authorized) authorized += 1;
    if (result.failed) failed += 1;
  }

  return { data: nextData, processed, authorized, failed, expired: expiredResult.expired };
}

export function expireStaleSriPendingDocuments(data: AppData, user: User, now = new Date()) {
  const expiredAt = now.toISOString();
  const staleSales = uniquePendingOfficialInvoices(data.sales.filter((sale) => isStaleSriPendingDocument(sale, now)));
  if (staleSales.length === 0) return { data, expired: 0 };

  const staleIds = new Set(staleSales.map((sale) => sale.id));
  const stockMovements: InventoryMovement[] = [];
  const nextProducts = data.products.map((product) => {
    if (!isInventoryProduct(product)) return product;
    let quantityToRestore = 0;
    for (const sale of staleSales) {
      const sourceSale = sale.sourceSaleId ? data.sales.find((item) => item.id === sale.sourceSaleId) : undefined;
      const sourceTicketAlreadyDiscountedStock = sourceSale?.documentType === "nota_venta" && isTicketOffline(sourceSale.status);
      if (!isInvoiceSale(sale) || sourceTicketAlreadyDiscountedStock || !saleStatusReducesStock(sale.status)) continue;
      quantityToRestore += sale.items
        .filter((item) => isInventoryProduct(item) && item.productId === product.id)
        .reduce((sum, item) => sum + item.quantity, 0);
    }
    if (quantityToRestore <= 0) return product;
    const stockAfter = product.stock + quantityToRestore;
    stockMovements.push({
      id: generateId(),
      productId: product.id,
      productName: product.name,
      type: "entrada",
      quantity: quantityToRestore,
      stockBefore: product.stock,
      stockAfter,
      reason: "Anulacion automatica SRI fuera de fecha",
      reference: "SRI vencido",
      userId: user.id,
      createdAt: expiredAt
    });
    return { ...product, stock: stockAfter, updatedAt: expiredAt };
  });

  const nextData = appendAudit({
    ...data,
    products: nextProducts,
    inventoryMovements: [...stockMovements, ...(data.inventoryMovements || [])],
    sales: data.sales.map((item) => staleIds.has(item.id)
      ? {
          ...item,
          status: "ANULADA" as const,
          voidedAt: item.voidedAt || expiredAt,
          voidReason: item.voidReason || "Anulada automaticamente: fuera del dia permitido para envio al SRI.",
          sriMessage: staleSriPendingMessage(item)
        }
      : item)
  }, user, "SRI_PENDING_EXPIRED", "sale", staleSales[0]?.id || "", `${staleSales.length} documento(s) SRI fuera de fecha anulados`, {
    count: staleSales.length,
    sequences: staleSales.map((sale) => sale.sequence)
  });

  return { data: nextData, expired: staleSales.length };
}

async function autoRetryOneSriDocument(data: AppData, sale: Sale, backendToken: string, user: User) {
  const retryAt = new Date().toISOString();
  const client = data.clients.find((item) => item.id === sale.clientId);

  try {
    if (!client) throw new Error("No se encontro el cliente del documento.");
    const saleIssuer = issuerForSale(data.issuer, sale);
    const unsignedXml = isCreditNoteSale(sale) ? buildCreditNoteXml(sale, client, saleIssuer) : buildInvoiceXml(sale, client, saleIssuer);
    const sriResult = await authorizeInvoice(data.backendUrl, unsignedXml, backendToken);
    const updatedSale: Sale = {
      ...sale,
      accessKey: sriResult.accessKey || sale.accessKey,
      authorizationNumber: sriResult.authorizationNumber,
      authorizationDate: sriResult.authorizationDate,
      sriEnvironment: sriResult.sriEnvironment,
      sriMessage: sriResult.sriMessage,
      signedXml: sriResult.signedXml,
      authorizedXml: sriResult.authorizedXml,
      status: resolveInvoiceStatus(sriResult),
      retryHistory: [...(sale.retryHistory || []), retryAt]
    };

    const stockMovements: InventoryMovement[] = [];
    const sourceSale = sale.sourceSaleId ? data.sales.find((item) => item.id === sale.sourceSaleId) : undefined;
    const sourceTicketAlreadyDiscountedStock = sourceSale?.documentType === "nota_venta" && isTicketOffline(sourceSale.status);
    const shouldDiscountStock = isInvoiceSale(sale) && !sourceTicketAlreadyDiscountedStock && saleNeedsStockDiscount(sale.status) && !isSriRejected(updatedSale.status) && updatedSale.status !== "ANULADA";
    const nextProducts = shouldDiscountStock
      ? data.products.map((product) => {
          if (!isInventoryProduct(product)) return product;
          const soldQuantity = sale.items.filter((item) => isInventoryProduct(item) && item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
          if (soldQuantity <= 0) return product;
          const stockAfter = product.stock - soldQuantity;
          stockMovements.push({
            id: generateId(),
            productId: product.id,
            productName: product.name,
            type: "salida",
            quantity: soldQuantity,
            stockBefore: product.stock,
            stockAfter,
            reason: "Reintento automatico SRI autorizado",
            reference: sale.sequence,
            userId: user.id,
            createdAt: retryAt
          });
          return { ...product, stock: stockAfter, updatedAt: retryAt };
        })
      : data.products;

    const convertedAt = new Date().toISOString();
    const nextSales = data.sales.map((item) => {
      if (item.id === sale.id) return updatedSale;
      if (updatedSale.status === "AUTORIZADA" && sourceSale && item.id === sourceSale.id && (isTicketOffline(item.status) || item.status === "PROFORMA")) {
        return {
          ...item,
          status: "CONVERTIDA" as const,
          voidReason: `Convertida a factura ${updatedSale.sequence}`,
          voidedAt: convertedAt,
          convertedAt,
          convertedToSaleId: updatedSale.id,
          convertedToSequence: updatedSale.sequence,
          sriMessage: `Convertida a factura ${updatedSale.sequence}`
        };
      }
      return item;
    });

    const nextData = appendAudit({
      ...data,
      products: nextProducts,
      inventoryMovements: [...stockMovements, ...(data.inventoryMovements || [])],
      sales: nextSales
    }, user, isCreditNoteSale(sale) ? "CREDIT_NOTE_AUTO_RETRIED" : "INVOICE_AUTO_RETRIED", "sale", sale.id, `Reintento automatico ${sale.sequence}: ${updatedSale.status}`, { status: updatedSale.status, accessKey: updatedSale.accessKey });

    return { data: nextData, authorized: updatedSale.status === "AUTORIZADA", failed: updatedSale.status !== "AUTORIZADA" };
  } catch (error) {
    const message = userFriendlyActionError(error, "authorize-invoice");
    const nextData = appendAudit({
      ...data,
      sales: data.sales.map((item) => item.id === sale.id
        ? { ...item, sriMessage: message, retryHistory: [...(sale.retryHistory || []), retryAt] }
        : item)
    }, user, isCreditNoteSale(sale) ? "CREDIT_NOTE_AUTO_RETRY_FAILED" : "INVOICE_AUTO_RETRY_FAILED", "sale", sale.id, `Reintento automatico fallido ${sale.sequence}`, { error: message });
    return { data: nextData, authorized: false, failed: true };
  }
}
