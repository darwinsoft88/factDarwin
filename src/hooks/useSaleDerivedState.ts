import { useMemo } from "react";
import { calculateTotalDiscount, calculateTotals } from "../sri";
import { AppData, Product, Sale, SaleItem } from "../types";
import { productMinStock } from "../utils/accounting";
import { isInventoryProduct } from "../utils/catalogItems";
import { parseDecimal } from "../utils/numbers";
import { buildCreditNoteItemsFromQuantities } from "../utils/sales";

type UseSaleDerivedStateParams = {
  creditNoteQuantities: Record<string, string>;
  creditNoteSourceId: string;
  editingSaleId: string;
  items: SaleItem[];
  quantity: string;
  retentionSaleId: string;
  selectedProduct?: Product;
  sourceProformaId: string;
  sourceTicketId: string;
  data: AppData;
};

export function useSaleDerivedState({
  creditNoteQuantities,
  creditNoteSourceId,
  data,
  editingSaleId,
  items,
  quantity,
  retentionSaleId,
  selectedProduct,
  sourceProformaId,
  sourceTicketId
}: UseSaleDerivedStateParams) {
  const totals = useMemo(() => calculateTotals(items), [items]);
  const saleSummaryTotals = useMemo(() => ({
    ...calculateTotals(items),
    discount: calculateTotalDiscount(items)
  }), [items]);
  const editingSale = useMemo(() => data.sales.find((sale) => sale.id === editingSaleId), [data.sales, editingSaleId]);
  const sourceTicket = useMemo(() => data.sales.find((sale) => sale.id === sourceTicketId), [data.sales, sourceTicketId]);
  const sourceProforma = useMemo(() => data.sales.find((sale) => sale.id === sourceProformaId), [data.sales, sourceProformaId]);
  const creditNoteSource = useMemo(() => data.sales.find((sale) => sale.id === creditNoteSourceId), [creditNoteSourceId, data.sales]);
  const creditNoteClient = useMemo(() => data.clients.find((client) => client.id === creditNoteSource?.clientId), [creditNoteSource, data.clients]);
  const retentionSale = useMemo(() => data.sales.find((sale) => sale.id === retentionSaleId), [data.sales, retentionSaleId]);
  const retentionClient = useMemo(() => data.clients.find((client) => client.id === retentionSale?.clientId), [retentionSale, data.clients]);
  const creditNotePreviewItems = useMemo(() => {
    if (!creditNoteSource) return [] as SaleItem[];
    return buildCreditNoteItemsFromQuantities(creditNoteSource as Sale, data.sales, creditNoteQuantities);
  }, [creditNoteQuantities, creditNoteSource, data.sales]);
  const creditNotePreviewTotals = useMemo(() => calculateTotals(creditNotePreviewItems), [creditNotePreviewItems]);
  const selectedProductProjectedStock = selectedProduct && isInventoryProduct(selectedProduct) ? selectedProduct.stock - Math.max(0, parseDecimal(quantity) || 0) : 0;
  const selectedProductLowStock = Boolean(selectedProduct && isInventoryProduct(selectedProduct) && selectedProductProjectedStock <= productMinStock(selectedProduct));

  return {
    creditNoteClient,
    creditNotePreviewTotals,
    creditNoteSource,
    editingSale,
    retentionClient,
    retentionSale,
    saleSummaryTotals,
    selectedProductLowStock,
    selectedProductProjectedStock,
    sourceProforma,
    sourceTicket,
    totals
  };
}
