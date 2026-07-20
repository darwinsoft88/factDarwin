import { useEffect, useState } from "react";
import { LIST_BATCH_SIZE } from "../constants/app";
import { Sale } from "../types";
import { toInputDate } from "../utils/format";
import { paginateItems } from "../utils/pagination";

export function useSalesDocumentFilters() {
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("TODAS");
  const [saleStartDate, setSaleStartDate] = useState("");
  const [saleEndDate, setSaleEndDate] = useState("");

  const setSalesDateRangeToday = () => {
    const today = toInputDate(new Date());
    setSaleStartDate(today);
    setSaleEndDate(today);
  };

  const setSalesDateRangeMonth = () => {
    const now = new Date();
    setSaleStartDate(toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)));
    setSaleEndDate(toInputDate(now));
  };

  const clearSalesDateRange = () => {
    setSaleStartDate("");
    setSaleEndDate("");
  };

  return {
    clearSalesDateRange,
    invoiceSearch,
    saleEndDate,
    saleStartDate,
    setInvoiceSearch,
    setSaleEndDate,
    setSalesDateRangeMonth,
    setSalesDateRangeToday,
    setSaleStartDate,
    setStatusFilter,
    statusFilter
  };
}

export function useSalesDocumentPagination({
  filteredSales,
  invoiceSearch,
  saleEndDate,
  saleStartDate,
  statusFilter
}: {
  filteredSales: Sale[];
  invoiceSearch: string;
  saleEndDate: string;
  saleStartDate: string;
  statusFilter: string;
}) {
  const [salePage, setSalePage] = useState(1);
  const salePagination = paginateItems(filteredSales, salePage, LIST_BATCH_SIZE);

  useEffect(() => {
    setSalePage(1);
  }, [invoiceSearch, saleEndDate, saleStartDate, statusFilter]);

  return {
    salePage,
    salePagination,
    setSalePage,
    visibleSales: salePagination.items
  };
}
