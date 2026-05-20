import { Sale } from "../types";

export function saleStatusReducesStock(status: Sale["status"]) {
  return status === "AUTORIZADA" || status === "RECIBIDA" || status === "FIRMADA" || status === "INTERNA";
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
  return sale.status === "AUTORIZADA" || sale.status === "INTERNA";
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
