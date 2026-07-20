import { AppData } from "../types";
import { activeScopeId, scopedReportData } from "./documents";
import { parseInputDate } from "./format";
import { buildSalesReport } from "./reports";
import { roundMoney } from "./numbers";

export function buildCashClosingSummary(data: AppData, closingDate: string) {
  const start = parseInputDate(closingDate, "start") || new Date();
  const end = parseInputDate(closingDate, "end") || new Date();
  const scopedData = scopedReportData(data);
  const report = buildSalesReport(scopedData, "custom", String(start.getFullYear()), String(start.getMonth() + 1), "1", closingDate, closingDate, "operational", "all");
  const scopeId = activeScopeId(data);
  const scopedSaleIds = new Set((scopedData.sales || []).map((sale) => sale.id));
  const creditPayments = (data.creditPayments || []).filter((payment) => {
    const createdAt = new Date(payment.createdAt);
    const paymentScopeId = payment.establishment && payment.emissionPoint ? `${payment.establishment}-${payment.emissionPoint}` : "";
    const inScope = paymentScopeId ? paymentScopeId === scopeId : scopedSaleIds.has(payment.saleId);
    return !payment.voidedAt && inScope && createdAt >= start && createdAt <= end;
  });
  const creditByPayment = creditPayments.reduce<Record<string, number>>((summary, payment) => {
    const key = payment.paymentMethod || "01";
    summary[key] = roundMoney((summary[key] || 0) + payment.amount);
    return summary;
  }, {});
  const creditGenerated = roundMoney(report.byPayment.CREDITO || 0);
  const byPayment = Object.entries(report.byPayment).reduce<Record<string, number>>((summary, [key, value]) => {
    if (key !== "CREDITO") summary[key] = roundMoney(value);
    return summary;
  }, {});
  Object.entries(creditByPayment).forEach(([key, value]) => {
    byPayment[key] = roundMoney((byPayment[key] || 0) + value);
  });
  const creditCollected = roundMoney(creditPayments.reduce((sum, payment) => sum + payment.amount, 0));

  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    documentCount: report.effectiveCount + creditPayments.length,
    total: roundMoney(report.total),
    collectedTotal: roundMoney(Object.values(byPayment).reduce((sum, value) => sum + value, 0)),
    creditGenerated,
    creditCollected,
    creditPaymentCount: creditPayments.length,
    cashExpected: byPayment["01"] || 0,
    byPayment
  };
}
