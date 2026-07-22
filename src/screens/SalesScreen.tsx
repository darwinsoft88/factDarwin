import React, { useEffect } from "react";
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
import type { PersistMutation } from "../hooks/useSyncAndBackup";
import { useSaleLineEditor } from "../hooks/useSaleLineEditor";
import { useSaleFormState } from "../hooks/useSaleFormState";
import { useSalesDocumentList } from "../hooks/useSalesDocumentList";
import { useSalesDocumentFilters, useSalesDocumentPagination } from "../hooks/useSalesDocumentFilters";
import { useQuickSaleClientEditor } from "../hooks/useQuickSaleClientEditor";
import { useCreditNoteFormState } from "../hooks/useCreditNoteFormState";
import { useReceivedRetentionActions } from "../hooks/useReceivedRetentionActions";
import { useReceivedRetentionFormState } from "../hooks/useReceivedRetentionFormState";
import { money, nextSequence } from "../sri";
import { activeEstablishment } from "../utils/establishments";
import { nextInternalSequence, nextProformaSequence } from "../utils/sales";
import { AppData, DocumentType, Sale, User } from "../types";

type SalesScreenMode = "sale" | "documents";

export function SalesScreen({
  data,
  user,
  backendToken,
  persist,
  persistMutation,
  onXml,
  mode = "sale"
}: {
  data: AppData;
  user: User;
  backendToken: string;
  persist: (data: AppData) => Promise<void>;
  persistMutation: PersistMutation;
  onXml: (xml: string) => void;
  mode?: SalesScreenMode;
}) {
  const {
    clientId,
    clientSearch,
    discountMode,
    documentType,
    editingSaleId,
    grossDiscount,
    issueNotice,
    issuing,
    items,
    notice,
    paymentMethod,
    salePayments,
    paymentCondition,
    creditDueDate,
    processingMessage,
    productId,
    productSearch,
    quantity,
    remoteClientResults,
    remoteProductResults,
    resetSaleInputs,
    retryingSaleId,
    saleScannerVisible,
    selectedRemoteClient,
    sourceProformaId,
    sourceTicketId,
    unitGrossPrice,
    visibleClientCount,
    visibleProductCount,
    setClientId,
    setClientSearch,
    setDiscountMode,
    setDocumentType,
    setEditingSaleId,
    setGrossDiscount,
    additionalInfo,
    additionalInfoVisible,
    setIssueNotice,
    setIssuing,
    setItems,
    setAdditionalInfo,
    setAdditionalInfoVisible,
    setNotice,
    setPaymentMethod,
    setSalePayments,
    setPaymentCondition,
    setCreditDueDate,
    setProcessingMessage,
    setProductId,
    setProductSearch,
    setQuantity,
    setRemoteClientResults,
    setRemoteProductResults,
    setRetryingSaleId,
    setSaleScannerVisible,
    setSelectedRemoteClient,
    setSourceProformaId,
    setSourceTicketId,
    setUnitGrossPrice,
    setVisibleClientCount,
    setVisibleProductCount
  } = useSaleFormState(data);
  const {
    creditNoteQuantities,
    creditNoteReason,
    creditNoteSourceId,
    issuingCreditNote,
    setCreditNoteQuantities,
    setCreditNoteReason,
    setCreditNoteSourceId,
    setIssuingCreditNote
  } = useCreditNoteFormState();
  const {
    retentionAmount,
    retentionAuthorizationNumber,
    retentionBase,
    retentionDocumentNumber,
    retentionNotes,
    retentionPercentage,
    retentionReceivedAt,
    retentionSaleId,
    retentionTaxType,
    setRetentionAmount,
    setRetentionAuthorizationNumber,
    setRetentionBase,
    setRetentionDocumentNumber,
    setRetentionNotes,
    setRetentionPercentage,
    setRetentionReceivedAt,
    setRetentionSaleId,
    setRetentionTaxType
  } = useReceivedRetentionFormState();

  const {
    clientsForSale,
    filteredClientCount,
    filteredClientsForSale,
    filteredProductCount,
    filteredProductsForSale,
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
    sourceTicket,
    userRole: user.role
  });

  const {
    lookingUpQuickClient,
    lookupQuickClientIdentification,
    openQuickClientCreator,
    openQuickClientEditor,
    quickClientForm,
    quickClientMode,
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
  }, [productId, selectedProduct, setDiscountMode, setGrossDiscount, setUnitGrossPrice]);

  const {
    addProductById,
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
    unitGrossPrice,
    userRole: user.role
  });
  const nextDocumentLabel = saleNextDocumentLabel(data, documentType, editingSale, sourceTicket, sourceProforma);

  const {
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
  } = useSalesDocumentFilters();

  const {
    filteredSales,
    invoiceStats
  } = useSalesDocumentList({
    data,
    invoiceSearch,
    saleEndDate,
    saleStartDate,
    statusFilter
  });
  const {
    salePagination,
    setSalePage,
    visibleSales
  } = useSalesDocumentPagination({
    filteredSales,
    invoiceSearch,
    saleEndDate,
    saleStartDate,
    statusFilter
  });

  const { issue } = useSaleIssueFlow({
    backendToken,
    clientId,
    data,
    documentType,
    editingSale,
    items,
    additionalInfo,
    paymentMethod,
    salePayments,
    paymentCondition,
    creditDueDate,
    persist,
    persistMutation,
    resetSaleInputs,
    selectedClient,
    setDocumentType,
    setEditingSaleId,
    setIssueNotice,
    setIssuing,
    setItems,
    setAdditionalInfo,
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
    persistMutation,
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
    persistMutation,
    setClientId,
    setDocumentType,
    setEditingSaleId,
    setIssueNotice,
    setItems,
    setAdditionalInfo,
    setNotice,
    setPaymentMethod,
    setSalePayments,
    setPaymentCondition,
    setCreditDueDate,
    setProcessingMessage,
    setRetryingSaleId,
    setSourceProformaId,
    setSourceTicketId,
    user
  });
  return (
    <View style={styles.stack}>
      {mode === "sale" ? (
        <SaleFormSection
          addProductById={addProductById}
          addProductSearchSubmit={addProductSearchSubmit}
          additionalInfo={additionalInfo}
          adjustSaleLineQuantity={adjustSaleLineQuantity}
          cancelEdit={cancelEdit}
          clientId={clientId}
          clientSearch={clientSearch}
          documentType={documentType}
          editingSale={editingSale}
          filteredClientCount={filteredClientCount}
          filteredProductCount={filteredProductCount}
          filteredProductsForSale={filteredProductsForSale}
          issue={issue}
          issueNotice={issueNotice}
          issuing={issuing}
          items={items}
          onOpenScanner={() => setSaleScannerVisible(true)}
          openLineEditor={openLineEditor}
          openQuickClientCreator={openQuickClientCreator}
          openQuickClientEditor={openQuickClientEditor}
          nextDocumentLabel={nextDocumentLabel}
          paymentCondition={paymentCondition}
          creditDueDate={creditDueDate}
          paymentMethod={paymentMethod}
          salePayments={salePayments}
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
          setAdditionalInfoVisible={setAdditionalInfoVisible}
          setPaymentCondition={setPaymentCondition}
          setCreditDueDate={setCreditDueDate}
          setPaymentMethod={setPaymentMethod}
          setSalePayments={setSalePayments}
          setProductSearch={setProductSearch}
          setVisibleClientCount={setVisibleClientCount}
          setVisibleProductCount={setVisibleProductCount}
          sourceProforma={sourceProforma}
          sourceTicket={sourceTicket}
          visibleClientsForSale={visibleClientsForSale}
          visibleProductsForSale={visibleProductsForSale}
        />
      ) : (
        <>
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
            startDate={saleStartDate}
            statusFilter={statusFilter}
            user={user}
            salePage={salePagination.currentPage}
            salePageSize={LIST_BATCH_SIZE}
            setSalePage={setSalePage}
            visibleSales={visibleSales}
            whatsappSale={whatsappSale}
          />

          <ReceivedRetentionsSection data={data} user={user} onXml={onXml} />
        </>
      )}

      <SalesModals
        additionalInfo={additionalInfo}
        additionalInfoVisible={additionalInfoVisible}
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
        lookingUpQuickClient={lookingUpQuickClient}
        lookupQuickClientIdentification={() => { void lookupQuickClientIdentification(); }}
        processingMessage={processingMessage}
        quickClientForm={quickClientForm}
        quickClientMode={quickClientMode}
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
        setAdditionalInfo={setAdditionalInfo}
        setAdditionalInfoVisible={setAdditionalInfoVisible}
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

function saleNextDocumentLabel(data: AppData, documentType: DocumentType, editingSale?: Sale, sourceTicket?: Sale, sourceProforma?: Sale) {
  if (editingSale) return saleDisplayNumber(editingSale, data);

  const establishment = activeEstablishment(data.issuer);
  const scopeId = establishment.id;
  const legacyScopeId = `${data.issuer.establishment || "001"}-${data.issuer.emissionPoint || "001"}`;
  const effectiveType = sourceTicket ? "factura" : sourceProforma ? documentType : documentType;

  if (effectiveType === "nota_venta") {
    return nextInternalSequence(data.sales || [], scopeId, legacyScopeId);
  }

  if (effectiveType === "proforma") {
    return nextProformaSequence(data.sales || [], scopeId, legacyScopeId);
  }

  const sequence = effectiveType === "nota_credito"
    ? nextSequence(establishment.creditNoteSequential || data.issuer.creditNoteSequential || 1)
    : nextSequence(establishment.sequential || data.issuer.sequential || 1);

  return `${establishment.establishment}-${establishment.emissionPoint}-${sequence}`;
}

function saleDisplayNumber(sale: Sale, data: AppData) {
  const establishment = sale.establishment || data.issuer.establishment;
  const emissionPoint = sale.emissionPoint || data.issuer.emissionPoint;
  if (sale.documentType === "factura" || sale.documentType === "nota_credito") {
    return `${establishment}-${emissionPoint}-${sale.sequence}`;
  }
  return sale.sequence;
}

const styles = StyleSheet.create({
  stack: {
    gap: 12
  }
});
