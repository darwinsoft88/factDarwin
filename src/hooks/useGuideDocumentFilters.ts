import { useEffect, useMemo, useState } from "react";
import { LIST_BATCH_SIZE } from "../constants/app";
import { AppData, Client, RemissionGuide, Sale } from "../types";
import { documentNumber, guideInActiveScope, saleInActiveScope } from "../utils/documents";
import { isTicketOffline } from "../utils/invoiceStatus";
import { paginateItems } from "../utils/pagination";
import { documentTypeLabel } from "../utils/sales";

export function useGuideDocumentFilters(data: AppData) {
  const scopedSales = useMemo(() => data.sales.filter((sale) => saleInActiveScope(sale, data)), [data]);
  const scopedGuides = useMemo(() => (data.guides || []).filter((guide) => guideInActiveScope(guide, data)), [data]);
  const movableDocuments = useMemo(
    () => scopedSales.filter((sale) => sale.status === "AUTORIZADA" || isTicketOffline(sale.status) || sale.status === "PROFORMA"),
    [scopedSales]
  );
  const [sourceSaleId, setSourceSaleId] = useState(movableDocuments[0]?.id || "");
  const [documentSearch, setDocumentSearch] = useState("");
  const [guideSearch, setGuideSearch] = useState("");
  const [guidePage, setGuidePage] = useState(1);
  const clientsById = useMemo(() => new Map(data.clients.map((item) => [item.id, item])), [data.clients]);

  const filteredMovableDocuments = useMemo(() => {
    const search = documentSearch.trim().toLowerCase();
    if (!search) return movableDocuments;

    return movableDocuments.filter((sale) => {
      const saleClient = clientsById.get(sale.clientId);
      return [
        documentTypeLabel(sale),
        sale.sequence,
        documentNumber(sale, data.issuer),
        sale.accessKey,
        sale.authorizationNumber || "",
        saleClient?.name || "",
        saleClient?.identification || ""
      ].some((value) => value.toLowerCase().includes(search));
    });
  }, [clientsById, data.issuer, documentSearch, movableDocuments]);

  const filteredGuides = useMemo(() => {
    const search = guideSearch.trim().toLowerCase();
    if (!search) return scopedGuides;
    return scopedGuides.filter((guide) => {
      const guideClient = clientsById.get(guide.clientId);
      const source = data.sales.find((sale) => sale.id === guide.sourceSaleId);
      return [
        guide.sequence,
        guide.accessKey,
        guide.authorizationNumber || "",
        guide.status,
        guide.plate,
        guide.route,
        guide.transporterName,
        guide.transporterIdentification,
        guideClient?.name || "",
        guideClient?.identification || "",
        source?.sequence || ""
      ].some((value) => value.toLowerCase().includes(search));
    });
  }, [clientsById, data.sales, guideSearch, scopedGuides]);
  const guidePagination = paginateItems(filteredGuides, guidePage, LIST_BATCH_SIZE);
  const visibleGuides = guidePagination.items;

  useEffect(() => {
    setGuidePage(1);
  }, [guideSearch]);

  useEffect(() => {
    if (sourceSaleId && movableDocuments.some((sale) => sale.id === sourceSaleId)) return;
    setSourceSaleId(movableDocuments[0]?.id || "");
  }, [movableDocuments, sourceSaleId]);

  useEffect(() => {
    if (filteredMovableDocuments.length === 0) return;
    if (filteredMovableDocuments.some((sale) => sale.id === sourceSaleId)) return;
    setSourceSaleId(filteredMovableDocuments[0]?.id || "");
  }, [filteredMovableDocuments, sourceSaleId]);

  const sourceSale = data.sales.find((sale) => sale.id === sourceSaleId);
  const client = sourceSale ? data.clients.find((item) => item.id === sourceSale.clientId) : undefined;

  return {
    client,
    clientsById: clientsById as Map<string, Client>,
    documentSearch,
    filteredGuides: filteredGuides as RemissionGuide[],
    filteredMovableDocuments: filteredMovableDocuments as Sale[],
    guidePagination,
    guideSearch,
    movableDocuments,
    setDocumentSearch,
    setGuidePage,
    setGuideSearch,
    setSourceSaleId,
    sourceSale,
    sourceSaleId,
    visibleGuides
  };
}
