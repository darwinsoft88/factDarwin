import { Client, Sale, SaleItem } from "../types";
import { isTicketOffline } from "./invoiceStatus";
import { parseDecimal, roundMoney } from "./numbers";

export function saleStatusReducesStock(status: Sale["status"]) {
  return status === "AUTORIZADA" || status === "ENVIADA" || status === "FIRMADA" || status === "ENVIADA_SRI" || status === "PENDIENTE_SRI" || isTicketOffline(status);
}

export function saleNeedsStockDiscount(status: Sale["status"]) {
  return !saleStatusReducesStock(status);
}

export function canEditSale(sale: Sale) {
  return !isCreditNoteSale(sale) && sale.status !== "AUTORIZADA" && sale.status !== "ANULADA";
}

export function isInvoiceSale(sale: Sale) {
  return (sale.documentType || "factura") === "factura";
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

function getCreditedQuantityForLine(sales: Sale[], sourceSaleId: string, sourceItem: SaleItem, sourceIndex: number) {
  const lineKey = getCreditLineKey(sourceItem, sourceIndex);
  return sales
    .filter((sale) => sale.documentType === "nota_credito" && sale.sourceSaleId === sourceSaleId && sale.status === "AUTORIZADA")
    .flatMap((sale) => sale.items)
    .filter((item) => item.sourceLineKey ? item.sourceLineKey === lineKey : sameCreditLine(sourceItem, item))
    .reduce((sum, item) => sum + item.quantity, 0);
}
