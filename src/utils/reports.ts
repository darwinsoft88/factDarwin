import { calculateLineSubtotal, calculateLineTax, calculateLineTotal, calculateTotalDiscount } from "../sri";
import { AppData, Sale } from "../types";
import { accountingValue, saleCostValue } from "./accounting";
import { isInventoryProduct, isServiceItem } from "./catalogItems";
import { formatShortDate, parseInputDate } from "./format";
import { buildReportDocumentCounts, saleMatchesReportFilter } from "./reportClassification";
import { normalizePartialSalePayments, salePaymentTotal, salePaymentsForDisplay } from "./salePayments";
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

export type ReportItemFilter = "all" | "products" | "services";

export function reportItemFilterLabel(value: string) {
  if (value === "products") return "Productos";
  if (value === "services") return "Servicios";
  return "Todos";
}

export function buildSalesReport(data: AppData, periodType: string, year: string, month: string, semester: string, startDate: string, endDate: string, reportType = "tax", documentFilter = "all", itemFilter: ReportItemFilter = "all") {
  const range = getReportRange(periodType, Number(year), Number(month), Number(semester), startDate, endDate);
  const periodSales = data.sales
    .filter((sale) => {
      const createdAt = new Date(sale.createdAt);
      return createdAt >= range.start && createdAt <= range.end;
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const sales = periodSales.filter((sale) => saleMatchesReportFilter(sale, reportType, documentFilter) && saleMatchesItemFilter(sale, itemFilter));
  const taxableSales = sales.filter((sale) => isEffectiveReportSale(sale, reportType));
  const periodTaxDocuments = periodSales.filter((sale) => isTaxableSale(sale) && saleMatchesItemFilter(sale, itemFilter));
  const periodInvoices = periodTaxDocuments.filter(isInvoiceSale);
  const periodCreditNotes = periodTaxDocuments.filter(isCreditNoteSale);
  const counts = buildReportDocumentCounts(periodSales);
  const subtotal15 = taxableSales.reduce((sum, sale) => sum + accountingValue(sale, subtotalByRate(sale, 0.15, itemFilter)), 0);
  const subtotal0 = taxableSales.reduce((sum, sale) => sum + accountingValue(sale, subtotalByRate(sale, 0, itemFilter)), 0);
  const iva15 = taxableSales.reduce((sum, sale) => sum + accountingValue(sale, saleTaxForItemFilter(sale, itemFilter)), 0);
  const discount = taxableSales.reduce((sum, sale) => sum + accountingValue(sale, saleDiscountForItemFilter(sale, itemFilter)), 0);
  const subtotal = taxableSales.reduce((sum, sale) => sum + accountingValue(sale, saleSubtotalForItemFilter(sale, itemFilter)), 0);
  const total = taxableSales.reduce((sum, sale) => sum + accountingValue(sale, saleTotalForItemFilter(sale, itemFilter)), 0);
  const cost = taxableSales.reduce((sum, sale) => sum + accountingValue(sale, saleCostForItemFilter(sale, data.products, itemFilter)), 0);
  const profit = taxableSales.reduce((sum, sale) => sum + saleProfitForItemFilter(sale, data.products, itemFilter), 0);
  const byPayment = taxableSales.reduce<Record<string, number>>((summary, sale) => {
    const filteredTotal = saleTotalForItemFilter(sale, itemFilter);
    const sourceTotal = sale.total || filteredTotal;
    const addPaymentTotal = (key: string, amount: number) => {
      if (amount <= 0) return;
      const proportionalTotal = itemFilter === "all" || sourceTotal <= 0 ? amount : (amount * filteredTotal) / sourceTotal;
      summary[key] = (summary[key] || 0) + accountingValue(sale, proportionalTotal);
    };

    if (sale.paymentCondition === "credito") {
      const collectedPayments = normalizePartialSalePayments(sale.payments, sale.paymentMethod || "20");
      const collectedTotal = salePaymentTotal(collectedPayments);
      collectedPayments.forEach((payment) => addPaymentTotal(payment.paymentMethod || sale.paymentMethod || "20", payment.amount));
      const pendingCredit = Number.isFinite(Number(sale.creditBalance))
        ? Number(sale.creditBalance)
        : Math.max(0, sourceTotal - collectedTotal);
      addPaymentTotal("CREDITO", pendingCredit);
      return summary;
    }

    salePaymentsForDisplay(sale).forEach((payment) => addPaymentTotal(payment.paymentMethod || sale.paymentMethod || "20", payment.amount));
    return summary;
  }, {});
  const retentions = (data.receivedRetentions || []).filter((retention) => {
    const receivedAt = new Date(retention.receivedAt);
    return receivedAt >= range.start && receivedAt <= range.end;
  });
  const retentionIva = retentions.filter((retention) => retention.taxType === "IVA").reduce((sum, retention) => sum + retention.amount, 0);
  const retentionRenta = retentions.filter((retention) => retention.taxType === "RENTA").reduce((sum, retention) => sum + retention.amount, 0);
  const retentionTotal = retentionIva + retentionRenta;
  const iva104 = buildIva104Summary(periodInvoices, periodCreditNotes, retentionIva, itemFilter);

  return {
    label: range.label,
    reportType,
    documentFilter,
    itemFilter,
    sales,
    taxableSales,
    effectiveCount: taxableSales.length,
    ...counts,
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

export function subtotalByRate(sale: Sale, rate: number, itemFilter: ReportItemFilter = "all") {
  return saleItemsForReportFilter(sale, itemFilter).filter((item) => item.ivaRate === rate).reduce((sum, item) => sum + calculateLineSubtotal(item), 0);
}

export function saleItemsForReportFilter(sale: Sale, itemFilter: ReportItemFilter = "all") {
  if (itemFilter === "products") return sale.items.filter(isInventoryProduct);
  if (itemFilter === "services") return sale.items.filter(isServiceItem);
  return sale.items;
}

export function saleSubtotalForItemFilter(sale: Sale, itemFilter: ReportItemFilter = "all") {
  if (itemFilter === "all") return sale.subtotal;
  return saleItemsForReportFilter(sale, itemFilter).reduce((sum, item) => sum + calculateLineSubtotal(item), 0);
}

export function saleDiscountForItemFilter(sale: Sale, itemFilter: ReportItemFilter = "all") {
  if (itemFilter === "all") return calculateTotalDiscount(sale.items);
  return calculateTotalDiscount(saleItemsForReportFilter(sale, itemFilter));
}

export function saleTaxForItemFilter(sale: Sale, itemFilter: ReportItemFilter = "all") {
  if (itemFilter === "all") return sale.tax;
  return saleItemsForReportFilter(sale, itemFilter).reduce((sum, item) => sum + calculateLineTax(item), 0);
}

export function saleTotalForItemFilter(sale: Sale, itemFilter: ReportItemFilter = "all") {
  if (itemFilter === "all") return sale.total;
  return saleItemsForReportFilter(sale, itemFilter).reduce((sum, item) => sum + calculateLineTotal(item), 0);
}

export function saleCostForItemFilter(sale: Sale, products: AppData["products"], itemFilter: ReportItemFilter = "all") {
  if (itemFilter === "services") return 0;
  if (itemFilter === "all") return saleCostValue(sale, products);
  return saleCostValue({ ...sale, items: saleItemsForReportFilter(sale, itemFilter) }, products);
}

export function saleProfitForItemFilter(sale: Sale, products: AppData["products"], itemFilter: ReportItemFilter = "all") {
  return accountingValue(sale, saleSubtotalForItemFilter(sale, itemFilter)) - accountingValue(sale, saleCostForItemFilter(sale, products, itemFilter));
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

function saleMatchesItemFilter(sale: Sale, itemFilter: ReportItemFilter) {
  if (itemFilter === "all") return true;
  return saleItemsForReportFilter(sale, itemFilter).length > 0;
}

function subtotalByPositiveRate(sale: Sale, itemFilter: ReportItemFilter) {
  return saleItemsForReportFilter(sale, itemFilter).filter((item) => item.ivaRate > 0).reduce((sum, item) => sum + calculateLineSubtotal(item), 0);
}

function buildIva104Summary(invoices: Sale[], creditNotes: Sale[], retentionIva: number, itemFilter: ReportItemFilter) {
  const salesVatGross = invoices.reduce((sum, sale) => sum + subtotalByPositiveRate(sale, itemFilter), 0);
  const salesZeroGross = invoices.reduce((sum, sale) => sum + subtotalByRate(sale, 0, itemFilter), 0);
  const creditVat = creditNotes.reduce((sum, sale) => sum + subtotalByPositiveRate(sale, itemFilter), 0);
  const creditZero = creditNotes.reduce((sum, sale) => sum + subtotalByRate(sale, 0, itemFilter), 0);
  const salesVatNet = Math.max(0, salesVatGross - creditVat);
  const salesZeroNet = Math.max(0, salesZeroGross - creditZero);
  const ivaGeneratedGross = invoices.reduce((sum, sale) => sum + saleTaxForItemFilter(sale, itemFilter), 0);
  const ivaCreditNotes = creditNotes.reduce((sum, sale) => sum + saleTaxForItemFilter(sale, itemFilter), 0);
  const ivaGeneratedNet = Math.max(0, ivaGeneratedGross - ivaCreditNotes);
  const totalGross = invoices.reduce((sum, sale) => sum + saleTotalForItemFilter(sale, itemFilter), 0);
  const totalCreditNotes = creditNotes.reduce((sum, sale) => sum + saleTotalForItemFilter(sale, itemFilter), 0);
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
