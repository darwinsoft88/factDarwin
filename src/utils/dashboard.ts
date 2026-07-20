import { AppData } from "../types";
import { accountingValue, productMinStock, saleProfitValue } from "./accounting";
import { isInventoryProduct } from "./catalogItems";
import { scopedReportData } from "./documents";
import { isSriPending, isSriRejected, isTicketOffline } from "./invoiceStatus";
import { isCreditNoteSale, isInvoiceSale } from "./sales";

export function buildDashboard(data: AppData) {
  const scoped = scopedReportData(data);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const effectiveSales = scoped.sales.filter((sale) => (sale.documentType === "nota_venta" && isTicketOffline(sale.status)) || ((isInvoiceSale(sale) || isCreditNoteSale(sale)) && sale.status === "AUTORIZADA"));
  const todaySales = effectiveSales.filter((sale) => isDateInRange(sale.createdAt, todayStart, todayEnd));
  const monthSales = effectiveSales.filter((sale) => isDateInRange(sale.createdAt, monthStart, monthEnd));
  const pending = scoped.sales.filter((sale) => isInvoiceSale(sale) && isSriPending(sale.status));
  const rejected = scoped.sales.filter((sale) => isInvoiceSale(sale) && isSriRejected(sale.status));
  const lowStock = data.products.filter((product) => isInventoryProduct(product) && product.stock <= productMinStock(product)).sort((a, b) => a.stock - b.stock);
  const recentSales = [...scoped.sales].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);

  return {
    todayCount: todaySales.length,
    todayTotal: todaySales.reduce((sum, sale) => sum + accountingValue(sale, sale.total), 0),
    monthCount: monthSales.length,
    monthTotal: monthSales.reduce((sum, sale) => sum + accountingValue(sale, sale.total), 0),
    monthTax: monthSales.reduce((sum, sale) => sum + accountingValue(sale, sale.tax), 0),
    monthProfit: monthSales.reduce((sum, sale) => sum + saleProfitValue(sale, data.products), 0),
    pendingCount: pending.length,
    rejectedCount: rejected.length,
    lowStock,
    recentSales
  };
}

function isDateInRange(value: string, start: Date, end: Date) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date >= start && date <= end;
}
