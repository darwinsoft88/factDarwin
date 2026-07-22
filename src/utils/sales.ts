import { Client, Sale, SaleInventoryState, SaleItem } from "../types";
import { dateKey } from "./format";
import { isTicketOffline } from "./invoiceStatus";
import { parseDecimal, roundMoney } from "./numbers";

const duplicatePendingStatuses = new Set<Sale["status"]>(["BORRADOR", "FIRMADA", "PENDIENTE_SRI", "ENVIADA", "ENVIADA_SRI"]);

export function saleShouldReduceStock(status: Sale["status"]) {
  return status === "AUTORIZADA" || status === "ENVIADA" || status === "FIRMADA" || status === "ENVIADA_SRI" || status === "PENDIENTE_SRI" || status === "TICKET_OFFLINE";
}

/** @deprecated Use saleShouldReduceStock() for commercial intent. */
export function saleStatusReducesStock(status: Sale["status"]) {
  return saleShouldReduceStock(status);
}

export function saleNeedsStockDiscount(status: Sale["status"]) {
  return !saleShouldReduceStock(status);
}

export function resolveSaleInventoryState(sale: Sale): SaleInventoryState {
  if (sale.inventoryState) return sale.inventoryState;
  if (sale.documentType === "proforma" || sale.status === "PROFORMA" || sale.status === "BORRADOR") return "NOT_APPLIED";
  return "UNKNOWN";
}

export function canEditSale(sale: Sale) {
  if (isInvoiceSale(sale) && ["FIRMADA", "PENDIENTE_SRI", "ENVIADA", "ENVIADA_SRI"].includes(sale.status)) return false;
  return !isCreditNoteSale(sale) && sale.status !== "AUTORIZADA" && sale.status !== "ANULADA" && !isConvertedSale(sale);
}

export function isInvoiceSale(sale: Sale) {
  return (sale.documentType || "factura") === "factura";
}

export function isPendingOfficialInvoice(sale: Sale) {
  return isInvoiceSale(sale) && duplicatePendingStatuses.has(sale.status);
}

export function findPotentialDuplicatePendingInvoice(sales: Sale[], draft: Pick<Sale, "id" | "clientId" | "createdAt" | "establishment" | "emissionPoint" | "paymentMethod" | "subtotal" | "tax" | "total" | "items" | "sourceSaleId">) {
  const draftSignature = saleDuplicateSignature(draft);

  return sales.find((sale) => {
    if (sale.id === draft.id) return false;
    if (!isPendingOfficialInvoice(sale)) return false;
    if (sale.sourceSaleId && draft.sourceSaleId && sale.sourceSaleId === draft.sourceSaleId) return true;
    if (dateKey(new Date(sale.createdAt)) !== dateKey(new Date(draft.createdAt))) return false;
    return saleDuplicateSignature(sale) === draftSignature;
  });
}

export function uniquePendingOfficialInvoices(sales: Sale[]) {
  const seen = new Set<string>();
  return sales.filter((sale) => {
    if (!isPendingOfficialInvoice(sale)) return true;
    const signature = sale.sourceSaleId ? `source:${sale.sourceSaleId}` : saleDuplicateSignature(sale);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

export function isCreditNoteSale(sale: Sale) {
  return sale.documentType === "nota_credito";
}

export function documentTypeLabel(sale: Sale) {
  if (isCreditNoteSale(sale)) return "Nota credito";
  if (isInvoiceSale(sale)) return "Factura SRI";
  if (sale.documentType === "proforma") return "Proforma";
  return "Nota de venta";
}

export function isConvertedSale(sale: Sale) {
  return sale.status === "CONVERTIDA" || (sale.status === "ANULADA" && Boolean(sale.voidReason?.toLowerCase().includes("convertida a")));
}

export function isTaxableSale(sale: Sale) {
  return (isInvoiceSale(sale) || isCreditNoteSale(sale)) && sale.status === "AUTORIZADA";
}

export function isEffectiveReportSale(sale: Sale, reportType: string) {
  if (reportType === "tax") return isTaxableSale(sale);
  return sale.status === "AUTORIZADA" || isTicketOffline(sale.status);
}

export function getCreditLineKey(item: SaleItem, index: number) {
  return item.sourceLineKey || `${item.productId || item.code}-${index}`;
}

export function formatQuantity(value: number) {
  return Number(value.toFixed(6)).toString();
}

export function calculateGrossUnitPrice(item: SaleItem) {
  return roundMoney(item.unitPrice * (1 + item.ivaRate));
}

export function calculateLineGrossDiscount(item: SaleItem) {
  return roundMoney(item.discount * (1 + item.ivaRate));
}

export function getCreditLineAvailable(sales: Sale[], sourceSale: Sale, sourceItem: SaleItem, sourceIndex: number) {
  return Math.max(0, sourceItem.quantity - getCreditedQuantityForLine(sales, sourceSale.id, sourceItem, sourceIndex));
}

export function hasCreditNoteBalance(sales: Sale[], sourceSale: Sale) {
  return sourceSale.items.some((item, index) => getCreditLineAvailable(sales, sourceSale, item, index) > 0.000001);
}

export function buildCreditNoteItem(sourceItem: SaleItem, quantity: number, sourceLineKey: string): SaleItem {
  const ratio = sourceItem.quantity > 0 ? quantity / sourceItem.quantity : 0;
  return {
    ...sourceItem,
    quantity: Number(quantity.toFixed(6)),
    discount: Number((sourceItem.discount * ratio).toFixed(2)),
    sourceLineKey
  };
}

export function buildCreditNoteItemsFromQuantities(sourceSale: Sale, sales: Sale[], quantities: Record<string, string>) {
  return sourceSale.items.flatMap((item, index) => {
    const lineKey = getCreditLineKey(item, index);
    const quantity = Math.max(0, parseDecimal(quantities[lineKey] || "0") || 0);
    const available = getCreditLineAvailable(sales, sourceSale, item, index);
    if (quantity <= 0 || quantity > available + 0.000001) return [];
    return [buildCreditNoteItem(item, quantity, lineKey)];
  });
}

export function validateCreditNoteQuantities(sourceSale: Sale, sales: Sale[], quantities: Record<string, string>) {
  const errors: string[] = [];
  sourceSale.items.forEach((item, index) => {
    const lineKey = getCreditLineKey(item, index);
    const raw = quantities[lineKey] || "0";
    const quantity = parseDecimal(raw);
    const available = getCreditLineAvailable(sales, sourceSale, item, index);
    if (raw.trim() && (!Number.isFinite(quantity) || quantity < 0)) {
      errors.push(`${item.name}: cantidad invalida.`);
    }
    if (Number.isFinite(quantity) && quantity > available + 0.000001) {
      errors.push(`${item.name}: maximo disponible ${formatQuantity(available)}.`);
    }
  });
  return errors;
}

export function isFinalConsumerClient(client: Client) {
  const identification = client.identification.trim();
  return client.identificationType === "07" || identification === "9999999999999";
}

export function canIssueCreditNoteForSale(sales: Sale[], sale: Sale, client: Client) {
  return isInvoiceSale(sale) &&
    sale.status === "AUTORIZADA" &&
    !isFinalConsumerClient(client) &&
    hasCreditNoteBalance(sales, sale);
}

export function nextInternalSequence(sales: Sale[], scopeId: string, legacyScopeId: string) {
  const next = sales
    .filter((sale) => sale.documentType === "nota_venta" && internalDocumentScopeId(sale, legacyScopeId) === scopeId)
    .map((sale) => Number((sale.sequence.match(/NV-(\d+)/) || [])[1] || 0))
    .reduce((max, value) => Math.max(max, value), 0) + 1;

  return `NV-${String(next).padStart(9, "0")}`;
}

export function nextProformaSequence(sales: Sale[], scopeId: string, legacyScopeId: string) {
  const next = sales
    .filter((sale) => sale.documentType === "proforma" && internalDocumentScopeId(sale, legacyScopeId) === scopeId)
    .map((sale) => Number((sale.sequence.match(/PRO-(\d+)/) || [])[1] || 0))
    .reduce((max, value) => Math.max(max, value), 0) + 1;

  return `PRO-${String(next).padStart(9, "0")}`;
}

export function internalDocumentScopeId(sale: Sale, legacyScopeId: string) {
  return sale.establishment && sale.emissionPoint ? `${sale.establishment}-${sale.emissionPoint}` : legacyScopeId;
}

function sameCreditLine(sourceItem: SaleItem, creditItem: SaleItem) {
  return sourceItem.productId === creditItem.productId &&
    sourceItem.code === creditItem.code &&
    sourceItem.name === creditItem.name &&
    Math.abs(sourceItem.unitPrice - creditItem.unitPrice) < 0.000001 &&
    Math.abs(sourceItem.ivaRate - creditItem.ivaRate) < 0.000001;
}

function saleDuplicateSignature(sale: Pick<Sale, "clientId" | "establishment" | "emissionPoint" | "paymentMethod" | "subtotal" | "tax" | "total" | "items">) {
  const scope = `${sale.establishment || ""}-${sale.emissionPoint || ""}`;
  const totals = `${roundMoney(sale.subtotal).toFixed(2)}|${roundMoney(sale.tax).toFixed(2)}|${roundMoney(sale.total).toFixed(2)}`;
  const lines = sale.items.map(lineDuplicateSignature).sort().join(";");
  return [sale.clientId, scope, sale.paymentMethod || "01", totals, lines].join("::");
}

function lineDuplicateSignature(item: SaleItem) {
  return [
    item.productId,
    item.code,
    item.name.trim().toLowerCase(),
    Number(item.quantity.toFixed(6)).toFixed(6),
    Number(item.unitPrice.toFixed(6)).toFixed(6),
    roundMoney(item.discount || 0).toFixed(2),
    Number(item.ivaRate.toFixed(6)).toFixed(6)
  ].join("|");
}

function getCreditedQuantityForLine(sales: Sale[], sourceSaleId: string, sourceItem: SaleItem, sourceIndex: number) {
  const lineKey = getCreditLineKey(sourceItem, sourceIndex);
  return sales
    .filter((sale) => sale.documentType === "nota_credito" && sale.sourceSaleId === sourceSaleId && sale.status === "AUTORIZADA")
    .flatMap((sale) => sale.items)
    .filter((item) => item.sourceLineKey ? item.sourceLineKey === lineKey : sameCreditLine(sourceItem, item))
    .reduce((sum, item) => sum + item.quantity, 0);
}
