import { AppData } from "../types";
import { scopedReportData } from "./documents";
import { parseInputDate } from "./format";
import { buildSalesReport } from "./reports";

export function buildCashClosingSummary(data: AppData, closingDate: string) {
  const start = parseInputDate(closingDate, "start") || new Date();
  const end = parseInputDate(closingDate, "end") || new Date();
  const report = buildSalesReport(scopedReportData(data), "custom", String(start.getFullYear()), String(start.getMonth() + 1), "1", closingDate, closingDate, "operational", "all");

  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    documentCount: report.effectiveCount,
    total: report.total,
    cashExpected: report.byPayment["01"] || 0,
    byPayment: report.byPayment
  };
}
