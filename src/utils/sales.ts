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
