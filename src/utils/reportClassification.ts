import { Sale } from "../types";
import { isSriPending, isSriRejected, isTicketOffline } from "./invoiceStatus";
import { isConvertedSale, isCreditNoteSale, isInvoiceSale, isTaxableSale } from "./sales";

export type ReportType = "tax" | "operational" | string;
export type ReportDocumentFilter = "all" | "factura" | "nota_credito" | "nota_venta" | "proforma" | string;

export function saleMatchesReportFilter(sale: Sale, reportType: ReportType, documentFilter: ReportDocumentFilter) {
  if (reportType === "tax") return isTaxableSale(sale);
  if (documentFilter === "factura") return isInvoiceSale(sale);
  if (documentFilter === "nota_credito") return isCreditNoteSale(sale);
  if (documentFilter === "nota_venta") return sale.documentType === "nota_venta";
  if (documentFilter === "proforma") return sale.documentType === "proforma";
  return true;
}

export function buildReportDocumentCounts(periodSales: Sale[]) {
  return {
    authorizedCount: periodSales.filter(isTaxableSale).length,
    creditNoteCount: periodSales.filter((sale) => sale.documentType === "nota_credito" && sale.status === "AUTORIZADA").length,
    internalCount: periodSales.filter((sale) => sale.documentType === "nota_venta" && isTicketOffline(sale.status)).length,
    proformaCount: periodSales.filter((sale) => sale.documentType === "proforma" && sale.status === "PROFORMA").length,
    convertedCount: periodSales.filter(isConvertedSale).length,
    voidedCount: periodSales.filter((sale) => sale.status === "ANULADA").length,
    rejectedCount: periodSales.filter((sale) => isSriRejected(sale.status)).length,
    pendingCount: periodSales.filter((sale) => isSriPending(sale.status)).length
  };
}
