import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ReceivedRetentionsSection } from "../components/ReceivedRetentionsSection";
import { SaleFormSection } from "../components/SaleFormSection";
import { SalesDocumentsSection } from "../components/SalesDocumentsSection";
import { SalesModals } from "../components/SalesModals";
import { LIST_BATCH_SIZE } from "../constants/app";
import { useSaleCartActions } from "../hooks/useSaleCartActions";
import { useSaleCatalogSearch } from "../hooks/useSaleCatalogSearch";
import { useCreditNoteActions } from "../hooks/useCreditNoteActions";
import { useSaleDerivedState } from "../hooks/useSaleDerivedState";
import { useSaleDocumentActions } from "../hooks/useSaleDocumentActions";
import { useSaleDocumentWorkflowActions } from "../hooks/useSaleDocumentWorkflowActions";
import { useSaleIssueFlow } from "../hooks/useSaleIssueFlow";
import { useSaleLineEditor } from "../hooks/useSaleLineEditor";
import { useSalesDocumentList } from "../hooks/useSalesDocumentList";
import { useQuickSaleClientEditor } from "../hooks/useQuickSaleClientEditor";
import { useReceivedRetentionActions } from "../hooks/useReceivedRetentionActions";
import { money } from "../services/sri";
import { AppData, Client, DocumentType, PaymentMethod, Product, RetentionTaxType, SaleItem, User } from "../types";
import { toInputDate } from "../utils/format";

export function SalesScreen({ data, user, backendToken, persist, onXml }: { data: AppData; user: User; backendToken: string; persist: (data: AppData) => Promise<void>; onXml: (xml: string) => void }) {
  const [clientId, setClientId] = useState(data.clients[0]?.id ?? "");
  const [productId, setProductId] = useState(data.products[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [unitGrossPrice, setUnitGrossPrice] = useState(data.products[0] ? money(data.products[0].price) : "");
  const [grossDiscount, setGrossDiscount] = useState("0");
  const [discountMode, setDiscountMode] = useState<"amount" | "percent">("amount");
  const [documentType, setDocumentType] = useState<DocumentType>("factura");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("01");
  const [items, setItems] = useState<SaleItem[]>([]);
  const [editingSaleId, setEditingSaleId] = useState("");
  const [sourceTicketId, setSourceTicketId] = useState("");
  const [sourceProformaId, setSourceProformaId] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [retryingSaleId, setRetryingSaleId] = useState("");
  const [notice, setNotice] = useState("");
  const [issueNotice, setIssueNotice] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [saleScannerVisible, setSaleScannerVisible] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("TODAS");
  const [saleStartDate, setSaleStartDate] = useState("");
  const [saleEndDate, setSaleEndDate] = useState("");
  const [visibleClientCount, setVisibleClientCount] = useState(LIST_BATCH_SIZE);
  const [visibleProductCount, setVisibleProductCount] = useState(LIST_BATCH_SIZE);
  const [visibleSaleCount, setVisibleSaleCount] = useState(LIST_BATCH_SIZE);
  const [remoteClientResults, setRemoteClientResults] = useState<{ items: Client[]; total: number } | null>(null);
  const [remoteProductResults, setRemoteProductResults] = useState<{ items: Product[]; total: number } | null>(null);
  const [selectedRemoteClient, setSelectedRemoteClient] = useState<Client | null>(null);
  const [creditNoteSourceId, setCreditNoteSourceId] = useState("");
  const [creditNoteReason, setCreditNoteReason] = useState("Devolucion parcial");
  const [creditNoteQuantities, setCreditNoteQuantities] = useState<Record<string, string>>({});
  const [issuingCreditNote, setIssuingCreditNote] = useState(false);
  const [processingMessage, setProcessingMessage] = useState("");
  const [retentionSaleId, setRetentionSaleId] = useState("");
  const [retentionTaxType, setRetentionTaxType] = useState<RetentionTaxType>("IVA");
  const [retentionBase, setRetentionBase] = useState("");
  const [retentionPercentage, setRetentionPercentage] = useState("");
  const [retentionAmount, setRetentionAmount] = useState("");
  const [retentionDocumentNumber, setRetentionDocumentNumber] = useState("");
  const [retentionAuthorizationNumber, setRetentionAuthorizationNumber] = useState("");
  const [retentionReceivedAt, setRetentionReceivedAt] = useState(toInputDate(new Date()));
  const [retentionNotes, setRetentionNotes] = useState("");

  const {
    clientsForSale,
    filteredClientCount,
    filteredClientsForSale,
    filteredProductCount,
    selectedClient,
    selectedProduct,
    visibleClientsForSale,
    visibleProductsForSale
  } = useSaleCatalogSearch({
    backendToken,
    clientId,
    clientSearch,
    data,
    productId,
    productSearch,
    remoteClientResults,
    remoteProductResults,
    selectedRemoteClient,
    setClientId,
    setProductId,
    setRemoteClientResults,
    setRemoteProductResults,
    setSelectedRemoteClient,
    setVisibleClientCount,
    setVisibleProductCount,
    visibleClientCount,
    visibleProductCount
  });

  const {
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
  } = useSaleDerivedState({
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
  });

  const {
    adjustSaleLineQuantity,
    closeLineEditor,
    editingLineIndex,
    lineEditForm,
    openLineEditor,
    saveLineEdit,
    setLineEditForm
  } = useSaleLineEditor({
    data,
    documentType,
    editingSale,
    items,
    setIssueNotice,
    setItems,
    sourceProforma,
    sourceTicket
  });

  const {
    openQuickClientEditor,
    quickClientForm,
    quickClientVisible,
    saveQuickClient,
    setQuickClientForm,
    setQuickClientVisible
  } = useQuickSaleClientEditor({
    backendToken,
    data,
    persist,
    selectedClient,
    setClientId,
    setIssueNotice,
    setRemoteClientResults,
    setSelectedRemoteClient,
    user
  });

  useEffect(() => {
    setUnitGrossPrice(selectedProduct ? money(selectedProduct.price) : "");
    setGrossDiscount("0");
    setDiscountMode("amount");
  }, [productId, selectedProduct]);

  const {
    addItem,
    addProductSearchSubmit,
    addScannedCodeToSale,
    selectClientForSale,
    selectProductForSale
  } = useSaleCartActions({
    clientsForSale,
    data,
    discountMode,
    documentType,
    editingSale,
    filteredClientsForSale,
    grossDiscount,
    items,
    productId,
    productSearch,
    quantity,
    selectedProduct,
    setClientId,
    setDiscountMode,
    setGrossDiscount,
    setIssueNotice,
    setItems,
    setProductId,
    setProductSearch,
    setQuantity,
    setSelectedRemoteClient,
    setUnitGrossPrice,
    sourceProforma,
    sourceTicket,
    unitGrossPrice
  });

  const {
    filteredSales,
    invoiceStats,
    visibleSales
  } = useSalesDocumentList({
    data,
    invoiceSearch,
    saleEndDate,
    saleStartDate,
    setVisibleSaleCount,
    statusFilter,
    visibleSaleCount
  });

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

  const { issue } = useSaleIssueFlow({
    backendToken,
    clientId,
    data,
    documentType,
    editingSale,
    items,
    paymentMethod,
    persist,
    selectedClient,
    setDocumentType,
    setEditingSaleId,
    setIssueNotice,
    setIssuing,
    setItems,
    setProcessingMessage,
    setSourceProformaId,
    setSourceTicketId,
    sourceProforma,
    sourceTicket,
    totals,
    user
  });
  const {
    createCreditNoteRide,
    createProforma,
    createRide,
    createTicket,
    emailSale,
    sendSaleEmail,
    whatsappSale
  } = useSaleDocumentActions({
    backendToken,
    data,
    persist,
    setNotice,
    setProcessingMessage,
    user
  });

  const {
    closeRetentionForm,
    openRetentionForm,
    saveReceivedRetention
  } = useReceivedRetentionActions({
    backendToken,
    data,
    persist,
    retentionAmount,
    retentionAuthorizationNumber,
    retentionBase,
    retentionClient,
    retentionDocumentNumber,
    retentionNotes,
    retentionPercentage,
    retentionReceivedAt,
    retentionSale,
    retentionTaxType,
    setRetentionAmount,
    setRetentionAuthorizationNumber,
    setRetentionBase,
    setRetentionDocumentNumber,
    setRetentionNotes,
    setRetentionPercentage,
    setRetentionReceivedAt,
    setRetentionSaleId,
    setRetentionTaxType,
    user
  });

  const {
    closeCreditNoteForm,
    fillCreditNoteTotal,
    issueCreditNote,
    openCreditNoteForm
  } = useCreditNoteActions({
    backendToken,
    creditNoteClient,
    creditNoteQuantities,
    creditNoteReason,
    creditNoteSource,
    data,
    issuingCreditNote,
    persist,
    sendSaleEmail,
    setCreditNoteQuantities,
    setCreditNoteReason,
    setCreditNoteSourceId,
    setIssuingCreditNote,
    setProcessingMessage,
    setRetryingSaleId,
    user
  });

  const {
    cancelEdit,
    convertProforma,
    editSale,
    invoiceFromTicket,
    retrySale,
    voidSale
  } = useSaleDocumentWorkflowActions({
    backendToken,
    data,
    persist,
    setClientId,
    setDocumentType,
    setEditingSaleId,
    setIssueNotice,
    setItems,
    setNotice,
    setPaymentMethod,
    setProcessingMessage,
    setRetryingSaleId,
    setSourceProformaId,
    setSourceTicketId,
    user
  });
  return (
    <View style={styles.stack}>
      <SaleFormSection
        addItem={addItem}
        addProductSearchSubmit={addProductSearchSubmit}
        adjustSaleLineQuantity={adjustSaleLineQuantity}
        cancelEdit={cancelEdit}
        clientId={clientId}
        clientSearch={clientSearch}
        documentType={documentType}
        editingSale={editingSale}
        filteredClientCount={filteredClientCount}
        filteredProductCount={filteredProductCount}
        issue={issue}
        issueNotice={issueNotice}
        issuing={issuing}
        items={items}
        onOpenScanner={() => setSaleScannerVisible(true)}
        openLineEditor={openLineEditor}
        openQuickClientEditor={openQuickClientEditor}
        paymentMethod={paymentMethod}
        productId={productId}
        productSearch={productSearch}
        projectedStock={selectedProductProjectedStock}
        saleSummaryTotals={saleSummaryTotals}
        selectClientForSale={selectClientForSale}
        selectProductForSale={selectProductForSale}
        selectedClient={selectedClient}
        selectedProduct={selectedProduct}
        selectedProductLowStock={selectedProductLowStock}
        setClientSearch={setClientSearch}
        setDocumentType={setDocumentType}
        setIssueNotice={setIssueNotice}
        setItems={setItems}
        setPaymentMethod={setPaymentMethod}
        setProductSearch={setProductSearch}
        setVisibleClientCount={setVisibleClientCount}
        setVisibleProductCount={setVisibleProductCount}
        sourceProforma={sourceProforma}
        sourceTicket={sourceTicket}
        visibleClientsForSale={visibleClientsForSale}
        visibleProductsForSale={visibleProductsForSale}
      />

      <SalesDocumentsSection
        cancelDocument={voidSale}
        convertProforma={convertProforma}
        createCreditNoteRide={createCreditNoteRide}
        createProforma={createProforma}
        createRide={createRide}
        createTicket={createTicket}
        data={data}
        editSale={editSale}
        emailSale={emailSale}
        endDate={saleEndDate}
        filteredSales={filteredSales}
        invoiceFromTicket={invoiceFromTicket}
        invoiceSearch={invoiceSearch}
        invoiceStats={invoiceStats}
        notice={notice}
        onClearDates={clearSalesDateRange}
        onMonth={setSalesDateRangeMonth}
        onToday={setSalesDateRangeToday}
        onXml={onXml}
        openCreditNoteForm={openCreditNoteForm}
        openRetentionForm={openRetentionForm}
        retrySale={retrySale}
        retryingSaleId={retryingSaleId}
        setEndDate={setSaleEndDate}
        setInvoiceSearch={setInvoiceSearch}
        setNotice={setNotice}
        setStartDate={setSaleStartDate}
        setStatusFilter={setStatusFilter}
        setVisibleSaleCount={setVisibleSaleCount}
        startDate={saleStartDate}
        statusFilter={statusFilter}
        user={user}
        visibleSales={visibleSales}
        whatsappSale={whatsappSale}
      />

      <ReceivedRetentionsSection data={data} user={user} onXml={onXml} />

      <SalesModals
        addScannedCodeToSale={addScannedCodeToSale}
        closeCreditNoteForm={closeCreditNoteForm}
        closeLineEditor={closeLineEditor}
        closeRetentionForm={closeRetentionForm}
        creditNotePreviewTotals={creditNotePreviewTotals}
        creditNoteQuantities={creditNoteQuantities}
        creditNoteReason={creditNoteReason}
        creditNoteSource={creditNoteSource}
        data={data}
        editingLineIndex={editingLineIndex}
        fillCreditNoteTotal={fillCreditNoteTotal}
        issueCreditNote={issueCreditNote}
        issuingCreditNote={issuingCreditNote}
        items={items}
        lineEditForm={lineEditForm}
        processingMessage={processingMessage}
        quickClientForm={quickClientForm}
        quickClientVisible={quickClientVisible}
        retentionAmount={retentionAmount}
        retentionAuthorizationNumber={retentionAuthorizationNumber}
        retentionBase={retentionBase}
        retentionClient={retentionClient}
        retentionDocumentNumber={retentionDocumentNumber}
        retentionNotes={retentionNotes}
        retentionPercentage={retentionPercentage}
        retentionReceivedAt={retentionReceivedAt}
        retentionSale={retentionSale}
        retentionTaxType={retentionTaxType}
        saleScannerVisible={saleScannerVisible}
        saveLineEdit={saveLineEdit}
        saveQuickClient={saveQuickClient}
        saveReceivedRetention={saveReceivedRetention}
        setCreditNoteQuantities={setCreditNoteQuantities}
        setCreditNoteReason={setCreditNoteReason}
        setLineEditForm={setLineEditForm}
        setProductSearch={setProductSearch}
        setQuickClientForm={setQuickClientForm}
        setQuickClientVisible={setQuickClientVisible}
        setRetentionAmount={setRetentionAmount}
        setRetentionAuthorizationNumber={setRetentionAuthorizationNumber}
        setRetentionBase={setRetentionBase}
        setRetentionDocumentNumber={setRetentionDocumentNumber}
        setRetentionNotes={setRetentionNotes}
        setRetentionPercentage={setRetentionPercentage}
        setRetentionReceivedAt={setRetentionReceivedAt}
        setRetentionTaxType={setRetentionTaxType}
        setSaleScannerVisible={setSaleScannerVisible}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12
  }
});
