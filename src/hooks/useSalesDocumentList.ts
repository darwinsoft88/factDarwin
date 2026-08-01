import { useMemo } from "react";
import { AppData } from "../types";
import { compareSalesNewestFirst, saleInActiveScope } from "../utils/documents";
import { parseInputDate } from "../utils/format";
import { isSriRejected, isTicketOffline } from "../utils/invoiceStatus";
import { documentTypeLabel, isConvertedSale, isCreditNoteSale, isInvoiceSale } from "../utils/sales";

type UseSalesDocumentListParams = {
  data: AppData;
  sales?: AppData["sales"];
  invoiceSearch: string;
  saleEndDate: string;
  saleStartDate: string;
  statusFilter: string;
};

export function useSalesDocumentList({
  data,
  sales = data.sales,
  invoiceSearch,
  saleEndDate,
  saleStartDate,
  statusFilter
}: UseSalesDocumentListParams) {
  const scopedSales = useMemo(
    () => sales.filter((sale) => saleInActiveScope(sale, data)),
    [data, sales],
  );
  const filteredSales = useMemo(() => {
    const search = invoiceSearch.trim().toLowerCase();
    const startBoundary = saleStartDate.trim() ? parseInputDate(saleStartDate, "start") : null;
    const endBoundary = saleEndDate.trim() ? parseInputDate(saleEndDate, "end") : null;

    return scopedSales.filter((sale) => {
      const client = data.clients.find((item) => item.id === sale.clientId);
      const matchesStatus =
        statusFilter === "TODAS" ||
        sale.status === statusFilter ||
        (statusFilter === "CONVERTIDA" && isConvertedSale(sale)) ||
        (statusFilter === "FIRMADA" && sale.status === "PENDIENTE_SRI") ||
        (statusFilter === "ENVIADA" && sale.status === "ENVIADA_SRI") ||
        (statusFilter === "NOTA_CREDITO" && isCreditNoteSale(sale));
      const saleDate = new Date(sale.createdAt);
      const matchesStartDate = !saleStartDate.trim() || (startBoundary && !Number.isNaN(saleDate.getTime()) && saleDate >= startBoundary);
      const matchesEndDate = !saleEndDate.trim() || (endBoundary && !Number.isNaN(saleDate.getTime()) && saleDate <= endBoundary);
      const documentLabel = documentTypeLabel(sale);
      const matchesSearch =
        !search ||
        sale.sequence.toLowerCase().includes(search) ||
        sale.accessKey.toLowerCase().includes(search) ||
        sale.authorizationNumber?.toLowerCase().includes(search) ||
        documentLabel.toLowerCase().includes(search) ||
        client?.name.toLowerCase().includes(search) ||
        client?.identification.toLowerCase().includes(search);

      const hiddenConvertedInNormalView = statusFilter === "TODAS" && !search && isConvertedSale(sale);
      return !hiddenConvertedInNormalView && matchesStatus && matchesStartDate && matchesEndDate && matchesSearch;
    }).sort(compareSalesNewestFirst);
  }, [data.clients, invoiceSearch, saleEndDate, saleStartDate, scopedSales, statusFilter]);
  const invoiceStats = useMemo(() => {
    const authorized = scopedSales.filter((sale) => isInvoiceSale(sale) && sale.status === "AUTORIZADA");
    const rejected = scopedSales.filter((sale) => isSriRejected(sale.status));
    const internal = scopedSales.filter((sale) => sale.documentType === "nota_venta" && isTicketOffline(sale.status));
    const creditNotes = scopedSales.filter((sale) => sale.documentType === "nota_credito" && sale.status === "AUTORIZADA");
    const proformas = scopedSales.filter((sale) => sale.documentType === "proforma" && sale.status === "PROFORMA");
    const totalAuthorized = authorized.reduce((sum, sale) => sum + sale.total, 0) - creditNotes.reduce((sum, sale) => sum + sale.total, 0);
    const retentionTotal = (data.receivedRetentions || []).reduce((sum, retention) => sum + retention.amount, 0);

    return {
      count: scopedSales.length,
      authorized: authorized.length,
      internal: internal.length,
      creditNotes: creditNotes.length,
      proformas: proformas.length,
      rejected: rejected.length,
      totalAuthorized,
      retentionTotal
    };
  }, [data.receivedRetentions, scopedSales]);

  return {
    filteredSales,
    invoiceStats
  };
}
