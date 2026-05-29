import React from "react";
import { money } from "../services/sri";
import { AppData, Client, RetentionTaxType, Sale, SaleItem } from "../types";
import { LineEditForm } from "../hooks/useSaleLineEditor";
import { BarcodeScannerModal } from "./BarcodeScannerModal";
import { CalendarDateInput } from "./CalendarDateInput";
import { CreditNoteModal } from "./CreditNoteModal";
import { ProcessingOverlay } from "./ProcessingOverlay";
import { QuickClientEditor } from "./QuickClientEditor";
import { QuickClientForm } from "../hooks/useQuickSaleClientEditor";
import { ReceivedRetentionModal } from "./ReceivedRetentionModal";
import { SaleLineEditor } from "./SaleLineEditor";

type SalesModalsProps = {
  addScannedCodeToSale: (code: string) => void;
  closeCreditNoteForm: () => void;
  closeLineEditor: () => void;
  closeRetentionForm: () => void;
  creditNotePreviewTotals: { subtotal: number; tax: number; total: number };
  creditNoteQuantities: Record<string, string>;
  creditNoteReason: string;
  creditNoteSource?: Sale;
  data: AppData;
  editingLineIndex: number | null;
  fillCreditNoteTotal: () => void;
  issueCreditNote: () => void;
  issuingCreditNote: boolean;
  items: SaleItem[];
  lineEditForm: LineEditForm;
  processingMessage: string;
  quickClientForm: QuickClientForm;
  quickClientVisible: boolean;
  retentionAmount: string;
  retentionAuthorizationNumber: string;
  retentionBase: string;
  retentionClient?: Client;
  retentionDocumentNumber: string;
  retentionNotes: string;
  retentionPercentage: string;
  retentionReceivedAt: string;
  retentionSale?: Sale;
  retentionTaxType: RetentionTaxType;
  saleScannerVisible: boolean;
  saveQuickClient: () => void;
  saveLineEdit: () => void;
  saveReceivedRetention: () => void;
  setCreditNoteQuantities: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setCreditNoteReason: React.Dispatch<React.SetStateAction<string>>;
  setLineEditForm: React.Dispatch<React.SetStateAction<LineEditForm>>;
  setProductSearch: React.Dispatch<React.SetStateAction<string>>;
  setQuickClientForm: React.Dispatch<React.SetStateAction<QuickClientForm>>;
  setQuickClientVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setRetentionAmount: React.Dispatch<React.SetStateAction<string>>;
  setRetentionAuthorizationNumber: React.Dispatch<React.SetStateAction<string>>;
  setRetentionBase: React.Dispatch<React.SetStateAction<string>>;
  setRetentionDocumentNumber: React.Dispatch<React.SetStateAction<string>>;
  setRetentionNotes: React.Dispatch<React.SetStateAction<string>>;
  setRetentionPercentage: React.Dispatch<React.SetStateAction<string>>;
  setRetentionReceivedAt: React.Dispatch<React.SetStateAction<string>>;
  setRetentionTaxType: React.Dispatch<React.SetStateAction<RetentionTaxType>>;
  setSaleScannerVisible: React.Dispatch<React.SetStateAction<boolean>>;
};

export function SalesModals({
  addScannedCodeToSale,
  closeCreditNoteForm,
  closeLineEditor,
  closeRetentionForm,
  creditNotePreviewTotals,
  creditNoteQuantities,
  creditNoteReason,
  creditNoteSource,
  data,
  editingLineIndex,
  fillCreditNoteTotal,
  issueCreditNote,
  issuingCreditNote,
  items,
  lineEditForm,
  processingMessage,
  quickClientForm,
  quickClientVisible,
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
  saleScannerVisible,
  saveLineEdit,
  saveQuickClient,
  saveReceivedRetention,
  setCreditNoteQuantities,
  setCreditNoteReason,
  setLineEditForm,
  setProductSearch,
  setQuickClientForm,
  setQuickClientVisible,
  setRetentionAmount,
  setRetentionAuthorizationNumber,
  setRetentionBase,
  setRetentionDocumentNumber,
  setRetentionNotes,
  setRetentionPercentage,
  setRetentionReceivedAt,
  setRetentionTaxType,
  setSaleScannerVisible
}: SalesModalsProps) {
  return (
    <>
      <CreditNoteModal
        source={creditNoteSource}
        issuer={data.issuer}
        sales={data.sales}
        reason={creditNoteReason}
        quantities={creditNoteQuantities}
        totals={creditNotePreviewTotals}
        issuing={issuingCreditNote}
        onReasonChange={setCreditNoteReason}
        onQuantityChange={(lineKey, value) => setCreditNoteQuantities((current) => ({ ...current, [lineKey]: value }))}
        onSelectAll={fillCreditNoteTotal}
        onClose={closeCreditNoteForm}
        onIssue={issueCreditNote}
      />

      <ReceivedRetentionModal
        sale={retentionSale}
        clientName={retentionClient?.name}
        issuer={data.issuer}
        taxType={retentionTaxType}
        documentNumberText={retentionDocumentNumber}
        authorizationNumber={retentionAuthorizationNumber}
        receivedAt={retentionReceivedAt}
        base={retentionBase}
        percentage={retentionPercentage}
        amount={retentionAmount}
        notes={retentionNotes}
        CalendarDateInputComponent={CalendarDateInput}
        onTaxTypeChange={(nextType) => {
          setRetentionTaxType(nextType);
          if (retentionSale) setRetentionBase(money(nextType === "IVA" ? retentionSale.tax : retentionSale.subtotal));
        }}
        onDocumentNumberChange={setRetentionDocumentNumber}
        onAuthorizationNumberChange={setRetentionAuthorizationNumber}
        onReceivedAtChange={setRetentionReceivedAt}
        onBaseChange={setRetentionBase}
        onPercentageChange={setRetentionPercentage}
        onAmountChange={setRetentionAmount}
        onNotesChange={setRetentionNotes}
        onClose={closeRetentionForm}
        onSave={saveReceivedRetention}
      />
      <QuickClientEditor
        visible={quickClientVisible}
        form={quickClientForm}
        onChange={setQuickClientForm}
        onSave={saveQuickClient}
        onClose={() => setQuickClientVisible(false)}
      />
      <SaleLineEditor
        visible={editingLineIndex !== null}
        item={editingLineIndex !== null ? items[editingLineIndex] : undefined}
        form={lineEditForm}
        onChange={setLineEditForm}
        onSave={saveLineEdit}
        onClose={closeLineEditor}
      />
      <BarcodeScannerModal
        visible={saleScannerVisible}
        title="Escanear producto"
        onClose={() => setSaleScannerVisible(false)}
        onScan={(code) => {
          setSaleScannerVisible(false);
          setProductSearch(code);
          addScannedCodeToSale(code);
        }}
      />
      <ProcessingOverlay visible={Boolean(processingMessage)} message={processingMessage} />
    </>
  );
}
