import { calculateLineSubtotal, calculateTotalDiscount } from "../services/sri";
import { AppData, Sale } from "../types";
import { accountingValue, saleCostValue, saleProfitValue } from "./accounting";
import { formatShortDate, parseInputDate } from "./format";
import { isSriPending, isSriRejected, isTicketOffline } from "./invoiceStatus";
import { isCreditNoteSale, isEffectiveReportSale, isInvoiceSale, isTaxableSale } from "./sales";

const monthLabels = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre"
];

export function buildSalesReport(data: AppData, periodType: string, year: string, month: string, semester: string, startDate: string, endDate: string, reportType = "tax", documentFilter = "all") {
  const range = getReportRange(periodType, Number(year), Number(month), Number(semester), startDate, endDate);
  const periodSales = data.sales
    .filter((sale) => {
      const createdAt = new Date(sale.createdAt);
      return createdAt >= range.start && createdAt <= range.end;
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const sales = periodSales.filter((sale) => {
    if (reportType === "tax") return isTaxableSale(sale);
    if (documentFilter === "factura") return isInvoiceSale(sale);
    if (documentFilter === "nota_credito") return isCreditNoteSale(sale);
    if (documentFilter === "nota_venta") return sale.documentType === "nota_venta";
    if (documentFilter === "proforma") return sale.documentType === "proforma";
    return true;
  });
  const taxableSales = sales.filter((sale) => isEffectiveReportSale(sale, reportType));
  const periodTaxDocuments = periodSales.filter(isTaxableSale);
  const periodInvoices = periodTaxDocuments.filter(isInvoiceSale);
  const periodCreditNotes = periodTaxDocuments.filter(isCreditNoteSale);
  const subtotal15 = taxableSales.reduce((sum, sale) => sum + accountingValue(sale, subtotalByRate(sale, 0.15)), 0);
  const subtotal0 = taxableSales.reduce((sum, sale) => sum + accountingValue(sale, subtotalByRate(sale, 0)), 0);
  const iva15 = taxableSales.reduce((sum, sale) => sum + accountingValue(sale, sale.tax), 0);
  const discount = taxableSales.reduce((sum, sale) => sum + accountingValue(sale, calculateTotalDiscount(sale.items)), 0);
  const subtotal = taxableSales.reduce((sum, sale) => sum + accountingValue(sale, sale.subtotal), 0);
  const total = taxableSales.reduce((sum, sale) => sum + accountingValue(sale, sale.total), 0);
  const cost = taxableSales.reduce((sum, sale) => sum + accountingValue(sale, saleCostValue(sale, data.products)), 0);
  const profit = taxableSales.reduce((sum, sale) => sum + saleProfitValue(sale, data.products), 0);
  const byPayment = taxableSales.reduce<Record<string, number>>((summary, sale) => {
    const key = sale.paymentMethod || "20";
    summary[key] = (summary[key] || 0) + accountingValue(sale, sale.total);
    return summary;
  }, {});
  const retentions = (data.receivedRetentions || []).filter((retention) => {
    const receivedAt = new Date(retention.receivedAt);
    return receivedAt >= range.start && receivedAt <= range.end;
  });
  const retentionIva = retentions.filter((retention) => retention.taxType === "IVA").reduce((sum, retention) => sum + retention.amount, 0);
  const retentionRenta = retentions.filter((retention) => retention.taxType === "RENTA").reduce((sum, retention) => sum + retention.amount, 0);
  const retentionTotal = retentionIva + retentionRenta;
  const iva104 = buildIva104Summary(periodInvoices, periodCreditNotes, retentionIva);

  return {
    label: range.label,
    reportType,
    documentFilter,
    sales,
    taxableSales,
    effectiveCount: taxableSales.length,
    authorizedCount: periodSales.filter(isTaxableSale).length,
    creditNoteCount: periodSales.filter((sale) => sale.documentType === "nota_credito" && sale.status === "AUTORIZADA").length,
    internalCount: periodSales.filter((sale) => sale.documentType === "nota_venta" && isTicketOffline(sale.status)).length,
    proformaCount: periodSales.filter((sale) => sale.documentType === "proforma" && sale.status === "PROFORMA").length,
    voidedCount: periodSales.filter((sale) => sale.status === "ANULADA").length,
    rejectedCount: periodSales.filter((sale) => isSriRejected(sale.status)).length,
    pendingCount: periodSales.filter((sale) => isSriPending(sale.status)).length,
    subtotal15,
    subtotal0,
    iva15,
    discount,
    subtotal,
    cost,
    profit,
    total,
    retentions,
    retentionIva,
    retentionRenta,
    retentionTotal,
    netCollected: total - retentionTotal,
    iva104,
    byPayment
  };
}

export function subtotalByRate(sale: Sale, rate: number) {
  return sale.items.filter((item) => item.ivaRate === rate).reduce((sum, item) => sum + calculateLineSubtotal(item), 0);
}

function getReportRange(periodType: string, year: number, month: number, semester: number, startDate: string, endDate: string) {
  if (periodType === "custom") {
    const start = parseInputDate(startDate, "start") || new Date(year, 0, 1, 0, 0, 0, 0);
    const end = parseInputDate(endDate, "end") || new Date(year, 11, 31, 23, 59, 59, 999);
    return {
      label: `Desde ${formatShortDate(start.toISOString())} hasta ${formatShortDate(end.toISOString())}`,
      start,
      end
    };
  }

  if (periodType === "annual") {
    return {
      label: `Anual ${year}`,
      start: new Date(year, 0, 1, 0, 0, 0, 0),
      end: new Date(year, 11, 31, 23, 59, 59, 999)
    };
  }

  if (periodType === "semester") {
    const startMonth = semester === 2 ? 6 : 0;
    const endMonth = semester === 2 ? 11 : 5;
    return {
      label: `${semester === 2 ? "Julio - Diciembre" : "Enero - Junio"} ${year}`,
      start: new Date(year, startMonth, 1, 0, 0, 0, 0),
      end: new Date(year, endMonth + 1, 0, 23, 59, 59, 999)
    };
  }

  const monthIndex = Math.max(0, Math.min(11, month - 1));
  const monthLabel = monthLabels[monthIndex] || "Enero";
  return {
    label: `${monthLabel} ${year}`,
    start: new Date(year, monthIndex, 1, 0, 0, 0, 0),
    end: new Date(year, monthIndex + 1, 0, 23, 59, 59, 999)
  };
}

function subtotalByPositiveRate(sale: Sale) {
  return sale.items.filter((item) => item.ivaRate > 0).reduce((sum, item) => sum + calculateLineSubtotal(item), 0);
}

function buildIva104Summary(invoices: Sale[], creditNotes: Sale[], retentionIva: number) {
  const salesVatGross = invoices.reduce((sum, sale) => sum + subtotalByPositiveRate(sale), 0);
  const salesZeroGross = invoices.reduce((sum, sale) => sum + subtotalByRate(sale, 0), 0);
  const creditVat = creditNotes.reduce((sum, sale) => sum + subtotalByPositiveRate(sale), 0);
  const creditZero = creditNotes.reduce((sum, sale) => sum + subtotalByRate(sale, 0), 0);
  const salesVatNet = Math.max(0, salesVatGross - creditVat);
  const salesZeroNet = Math.max(0, salesZeroGross - creditZero);
  const ivaGeneratedGross = invoices.reduce((sum, sale) => sum + sale.tax, 0);
  const ivaCreditNotes = creditNotes.reduce((sum, sale) => sum + sale.tax, 0);
  const ivaGeneratedNet = Math.max(0, ivaGeneratedGross - ivaCreditNotes);
  const totalGross = invoices.reduce((sum, sale) => sum + sale.total, 0);
  const totalCreditNotes = creditNotes.reduce((sum, sale) => sum + sale.total, 0);
  const totalNet = Math.max(0, totalGross - totalCreditNotes);
  const estimatedIvaPayable = Math.max(0, ivaGeneratedNet - retentionIva);

  return {
    salesVatGross,
    salesVatNet,
    salesZeroGross,
    salesZeroNet,
    creditVat,
    creditZero,
    ivaGeneratedGross,
    ivaCreditNotes,
    ivaGeneratedNet,
    retentionIva,
    estimatedIvaPayable,
    totalGross,
    totalCreditNotes,
    totalNet
  };
}
