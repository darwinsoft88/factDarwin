import { useEffect, useMemo, useState } from "react";
import { AppData } from "../types";
import { activeScopeId, scopedReportData } from "../utils/documents";
import { normalizedEstablishments } from "../utils/establishments";
import { toInputDate } from "../utils/format";
import { paginateItems } from "../utils/pagination";
import { buildSalesReport } from "../utils/reports";
import { LIST_BATCH_SIZE } from "../constants/app";

export function useReportsState(data: AppData) {
  const today = useMemo(() => new Date(), []);
  const currentYear = String(today.getFullYear());
  const establishmentOptions = useMemo(() => normalizedEstablishments(data.issuer), [data.issuer]);
  const [establishmentFilter, setEstablishmentFilter] = useState(activeScopeId(data));
  const reportData = useMemo(() => establishmentFilter === "all" ? data : scopedReportData(data, establishmentFilter), [data, establishmentFilter]);
  const availableYears = useMemo(() => Array.from(new Set([
    currentYear,
    ...reportData.sales.map((sale) => String(new Date(sale.createdAt).getFullYear())),
    ...(reportData.receivedRetentions || []).map((retention) => String(new Date(retention.receivedAt).getFullYear()))
  ])).sort((a, b) => Number(b) - Number(a)), [currentYear, reportData.receivedRetentions, reportData.sales]);

  const [periodType, setPeriodType] = useState("monthly");
  const [year, setYear] = useState(availableYears[0] || currentYear);
  const [month, setMonth] = useState(String(today.getMonth() + 1));
  const [semester, setSemester] = useState("1");
  const [startDate, setStartDate] = useState(toInputDate(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [endDate, setEndDate] = useState(toInputDate(today));
  const [reportType, setReportType] = useState("tax");
  const [documentFilter, setDocumentFilter] = useState("all");
  const [itemFilter, setItemFilter] = useState<"all" | "products" | "services">("all");
  const [reportSalePage, setReportSalePage] = useState(1);

  useEffect(() => {
    if (!availableYears.includes(year)) setYear(availableYears[0] || currentYear);
  }, [availableYears, currentYear, year]);

  const report = useMemo(() => buildSalesReport(reportData, periodType, year, month, semester, startDate, endDate, reportType, documentFilter, itemFilter), [reportData, periodType, year, month, semester, startDate, endDate, reportType, documentFilter, itemFilter]);
  const reportSalePagination = paginateItems(report.sales, reportSalePage, LIST_BATCH_SIZE);
  const visibleReportSales = reportSalePagination.items;

  useEffect(() => {
    setReportSalePage(1);
  }, [documentFilter, endDate, itemFilter, month, periodType, reportType, semester, startDate, year]);

  return {
    availableYears,
    documentFilter,
    endDate,
    establishmentFilter,
    establishmentOptions,
    itemFilter,
    month,
    periodType,
    report,
    reportData,
    reportType,
    semester,
    setDocumentFilter,
    setEndDate,
    setEstablishmentFilter,
    setItemFilter,
    setMonth,
    setPeriodType,
    setReportType,
    setReportSalePage,
    setSemester,
    setStartDate,
    setYear,
    startDate,
    reportSalePagination,
    visibleReportSales,
    year
  };
}
