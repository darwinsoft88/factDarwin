import React from "react";
import { StyleSheet, View } from "react-native";
import { LIST_BATCH_SIZE } from "../constants/app";
import { Client, DocumentType, PaymentMethod, Product, Sale, SaleItem } from "../types";
import { documentTypeLabel } from "../utils/sales";
import { DismissibleNotice } from "./DismissibleNotice";
import { DocumentTypeSelector } from "./DocumentTypeSelector";
import { PaymentMethodPicker } from "./PaymentMethodPicker";
import { SaleClientPicker } from "./SaleClientPicker";
import { SaleEditNotice } from "./SaleEditNotice";
import { SaleItemsList } from "./SaleItemsList";
import { SaleProductControls } from "./SaleProductControls";
import { SaleProductPicker } from "./SaleProductPicker";
import { SaleSubmitButton } from "./SaleSubmitButton";
import { SaleTotalsBox } from "./SaleTotalsBox";
import { Section } from "./common";

type SaleFormSectionProps = {
  addItem: () => void;
  addProductSearchSubmit: () => void;
  adjustSaleLineQuantity: (index: number, delta: number) => void;
  cancelEdit: () => void;
  clientId: string;
  clientSearch: string;
  documentType: DocumentType;
  editingSale?: Sale;
  filteredClientCount: number;
  filteredProductCount: number;
  issue: () => void;
  issueNotice: string;
  issuing: boolean;
  items: SaleItem[];
  onOpenScanner: () => void;
  openLineEditor: (index: number) => void;
  openQuickClientEditor: () => void;
  paymentMethod: PaymentMethod;
  productId: string;
  productSearch: string;
  projectedStock: number;
  saleSummaryTotals: { subtotal: number; discount: number; tax: number; total: number };
  selectClientForSale: (nextClientId: string, nextClient?: Client) => void;
  selectProductForSale: (nextProductId: string) => void;
  selectedClient?: Client;
  selectedProduct?: Product;
  selectedProductLowStock: boolean;
  setClientSearch: React.Dispatch<React.SetStateAction<string>>;
  setDocumentType: React.Dispatch<React.SetStateAction<DocumentType>>;
  setIssueNotice: React.Dispatch<React.SetStateAction<string>>;
  setItems: React.Dispatch<React.SetStateAction<SaleItem[]>>;
  setPaymentMethod: React.Dispatch<React.SetStateAction<PaymentMethod>>;
  setProductSearch: React.Dispatch<React.SetStateAction<string>>;
  setVisibleClientCount: React.Dispatch<React.SetStateAction<number>>;
  setVisibleProductCount: React.Dispatch<React.SetStateAction<number>>;
  sourceProforma?: Sale;
  sourceTicket?: Sale;
  visibleClientsForSale: Client[];
  visibleProductsForSale: Product[];
};

export function SaleFormSection({
  addItem,
  addProductSearchSubmit,
  adjustSaleLineQuantity,
  cancelEdit,
  clientId,
  clientSearch,
  documentType,
  editingSale,
  filteredClientCount,
  filteredProductCount,
  issue,
  issueNotice,
  issuing,
  items,
  onOpenScanner,
  openLineEditor,
  openQuickClientEditor,
  paymentMethod,
  productId,
  productSearch,
  projectedStock,
  saleSummaryTotals,
  selectClientForSale,
  selectProductForSale,
  selectedClient,
  selectedProduct,
  selectedProductLowStock,
  setClientSearch,
  setDocumentType,
  setIssueNotice,
  setItems,
  setPaymentMethod,
  setProductSearch,
  setVisibleClientCount,
  setVisibleProductCount,
  sourceProforma,
  sourceTicket,
  visibleClientsForSale,
  visibleProductsForSale
}: SaleFormSectionProps) {
  return (
    <Section title={sourceTicket ? `Facturando ticket ${sourceTicket.sequence}` : sourceProforma ? `Convirtiendo proforma ${sourceProforma.sequence}` : editingSale ? `Corrigiendo ${documentTypeLabel(editingSale)} ${editingSale.sequence}` : "Nueva venta"}>
      <SaleEditNotice sourceTicket={sourceTicket} sourceProforma={sourceProforma} editingSale={editingSale} onCancel={cancelEdit} />
      <View style={styles.saleGroupCompact}>
        <DocumentTypeSelector
          value={documentType}
          editingSale={editingSale}
          sourceTicket={sourceTicket}
          sourceProforma={sourceProforma}
          onChange={setDocumentType}
        />
      </View>
      <View style={styles.saleGroup}>
        <SaleClientPicker
          search={clientSearch}
          selectedClientId={clientId}
          visibleClients={visibleClientsForSale}
          filteredClientCount={filteredClientCount}
          selectedClient={selectedClient}
          canLoadMore={visibleClientsForSale.length < filteredClientCount}
          onSearchChange={setClientSearch}
          onClientChange={selectClientForSale}
          onLoadMore={() => setVisibleClientCount((count) => count + LIST_BATCH_SIZE)}
          onEditClient={openQuickClientEditor}
        />
      </View>

      <View style={styles.saleGroup}>
        <SaleProductPicker
          search={productSearch}
          selectedProductId={productId}
          visibleProducts={visibleProductsForSale}
          filteredProductCount={filteredProductCount}
          selectedProduct={selectedProduct}
          canLoadMore={visibleProductsForSale.length < filteredProductCount}
          onSearchChange={setProductSearch}
          onProductChange={selectProductForSale}
          onSearchSubmit={addProductSearchSubmit}
          onOpenScanner={onOpenScanner}
          onLoadMore={() => setVisibleProductCount((count) => count + LIST_BATCH_SIZE)}
          onAddSelected={addItem}
        />
        <SaleProductControls
          product={selectedProduct}
          lowStock={selectedProductLowStock}
          projectedStock={projectedStock}
        />
      </View>

      <SaleItemsList
        items={items}
        onAdjustQuantity={adjustSaleLineQuantity}
        onEdit={openLineEditor}
        onDelete={(index) => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}
      />
      <View style={styles.saleGroupCompact}>
        <PaymentMethodPicker value={paymentMethod} onChange={setPaymentMethod} />
      </View>
      <SaleTotalsBox
        key={`${items.length}-${saleSummaryTotals.subtotal}-${saleSummaryTotals.discount}-${saleSummaryTotals.tax}-${saleSummaryTotals.total}`}
        subtotal={saleSummaryTotals.subtotal}
        discount={saleSummaryTotals.discount}
        tax={saleSummaryTotals.tax}
        total={saleSummaryTotals.total}
      />
      <DismissibleNotice message={issueNotice} onDismiss={() => setIssueNotice("")} />
      <SaleSubmitButton issuing={issuing} documentType={documentType} editingSale={editingSale} sourceTicket={sourceTicket} sourceProforma={sourceProforma} onSubmit={issue} />
    </Section>
  );
}

const styles = StyleSheet.create({
  saleGroup: {
    borderWidth: 1,
    borderColor: "#e2e7f0",
    borderRadius: 8,
    padding: 12,
    gap: 10,
    backgroundColor: "#fbfdff"
  },
  saleGroupCompact: {
    borderWidth: 1,
    borderColor: "#e2e7f0",
    borderRadius: 8,
    padding: 10,
    gap: 8,
    backgroundColor: "#ffffff"
  }
});
