import React from "react";
import { money } from "../sri";
import { AppData, DocumentType, Sale, User } from "../types";
import { canAccessDeveloperTools, canIssueFromInternalDocuments, canManageFiscalAdjustments, canRetryDocuments, canVoidDocuments } from "../utils/appAccess";
import { formatSaleDetail } from "../utils/documentDetails";
import { documentNumber, getRetryInfo, MAX_DAILY_RETRIES } from "../utils/documents";
import { formatShortDate, shortText } from "../utils/format";
import { canRetrySriStatus, displayInvoiceStatus, isTicketOffline } from "../utils/invoiceStatus";
import { canEditSale, canIssueCreditNoteForSale, documentTypeLabel, isCreditNoteSale, isInvoiceSale } from "../utils/sales";
import { sriStatusHelpText } from "../utils/sriRetryPolicy";
import { DismissibleNotice } from "./DismissibleNotice";
import { InvoiceStatsGrid } from "./InvoiceStatsGrid";
import { ListItem } from "./ListItem";
import { PaginationControls } from "./PaginationControls";
import { SalesFilters } from "./SalesFilters";
import { CollapsibleSection, Empty, Input, Section } from "./common";

type SalesDocumentsSectionProps = {
  cancelDocument: (sale: Sale) => void;
  convertProforma: (sale: Sale, target: DocumentType) => void;
  createCreditNoteRide: (sale: Sale, client: AppData["clients"][number], source?: Sale) => void;
  createProforma: (sale: Sale, client: AppData["clients"][number]) => void;
  createRide: (sale: Sale, client: AppData["clients"][number]) => void;
  createTicket: (sale: Sale, client: AppData["clients"][number]) => void;
  data: AppData;
  historySales: Sale[];
  loadSaleDetail: (saleId: string) => Promise<Sale | null>;
  editSale: (sale: Sale) => void;
  emailSale: (sale: Sale, client: AppData["clients"][number]) => void;
  endDate: string;
  filteredSales: Sale[];
  invoiceFromTicket: (sale: Sale) => void;
  invoiceSearch: string;
  invoiceStats: Parameters<typeof InvoiceStatsGrid>[0]["stats"];
  notice: string;
  onXml: (xml: string) => void;
  openCreditNoteForm: (sale: Sale) => void;
  openRetentionForm: (sale: Sale) => void;
  retrySale: (sale: Sale, client: AppData["clients"][number]) => void;
  retryingSaleId: string;
  setEndDate: React.Dispatch<React.SetStateAction<string>>;
  setInvoiceSearch: React.Dispatch<React.SetStateAction<string>>;
  setNotice: React.Dispatch<React.SetStateAction<string>>;
  setStartDate: React.Dispatch<React.SetStateAction<string>>;
  setStatusFilter: React.Dispatch<React.SetStateAction<string>>;
  setSalePage: React.Dispatch<React.SetStateAction<number>>;
  startDate: string;
  statusFilter: string;
  user: User;
  salePage: number;
  salePageSize: number;
  visibleSales: Sale[];
  whatsappSale: (sale: Sale, client: AppData["clients"][number]) => void;
  onClearDates: () => void;
  onMonth: () => void;
  onToday: () => void;
};

export function SalesDocumentsSection({
  cancelDocument,
  convertProforma,
  createCreditNoteRide,
  createProforma,
  createRide,
  createTicket,
  data,
  historySales,
  loadSaleDetail,
  editSale,
  emailSale,
  endDate,
  filteredSales,
  invoiceFromTicket,
  invoiceSearch,
  invoiceStats,
  notice,
  onClearDates,
  onMonth,
  onToday,
  onXml,
  openCreditNoteForm,
  openRetentionForm,
  retrySale,
  retryingSaleId,
  setEndDate,
  setInvoiceSearch,
  setNotice,
  setStartDate,
  setStatusFilter,
  setSalePage,
  startDate,
  statusFilter,
  user,
  salePage,
  salePageSize,
  visibleSales,
  whatsappSale
}: SalesDocumentsSectionProps) {
  const canOpenTechnicalDetail = canAccessDeveloperTools(user);

  return (
    <Section title="Documentos">
      <DismissibleNotice message={notice} tone="success" title="Factura enviada" onDismiss={() => setNotice("")} />
      <Input label="Buscar documento" value={invoiceSearch} onChangeText={setInvoiceSearch} placeholder="Cliente, cedula, secuencial o clave" autoCapitalize="none" />
      <CollapsibleSection title="Filtros y resumen" embedded>
        <InvoiceStatsGrid stats={invoiceStats} />
        <SalesFilters
          startDate={startDate}
          endDate={endDate}
          status={statusFilter}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onToday={onToday}
          onMonth={onMonth}
          onClearDates={onClearDates}
          onStatusChange={setStatusFilter}
        />
      </CollapsibleSection>
      {historySales.length === 0 ? <Empty text="Aun no hay ventas." /> : null}
      {historySales.length > 0 && filteredSales.length === 0 ? <Empty text="No hay documentos con ese filtro." /> : null}
      {visibleSales.map((sale) => {
        const client = data.clients.find((item) => item.id === sale.clientId);
        const canonicalSale = data.sales.find((item) => item.id === sale.id);
        const actionableSale = canonicalSale ?? sale;
        return (
          <ListItem
            key={sale.id}
            title={`${documentNumber(sale, data.issuer)} - ${client?.name ?? "Cliente"}`}
            meta={`${formatShortDate(sale.createdAt)} | ${documentTypeLabel(sale)} | ${displayInvoiceStatus(sale.status)} | $${money(sale.total)}${sale.paymentCondition === "credito" ? ` | Credito pendiente $${money(sale.creditBalance ?? sale.total)}` : ""} | ${sale.authorizationNumber || sale.accessKey || "Interno"}${sriStatusHelpText(sale) ? ` | ${sriStatusHelpText(sale)}` : sale.sriMessage ? ` | ${shortText(sale.sriMessage, 90)}` : ""}`}
            badge={sale.status}
            onOpen={canOpenTechnicalDetail ? () => {
              if (!client) return;
              void loadSaleDetail(sale.id).then((detail) => {
                if (detail) onXml(formatSaleDetail(detail, client, data.issuer));
              });
            } : undefined}
            secondaryLabel={(isInvoiceSale(sale) || isCreditNoteSale(sale)) && sale.status === "AUTORIZADA" ? "Ver RIDE" : sale.documentType === "nota_venta" && isTicketOffline(sale.status) ? "Ver nota" : sale.documentType === "proforma" && sale.status === "PROFORMA" ? "Ver proforma" : undefined}
            onSecondary={() => {
              if (!client) return;
              if (!canonicalSale) return;
              if (isCreditNoteSale(canonicalSale)) return createCreditNoteRide(canonicalSale, client, data.sales.find((item) => item.id === canonicalSale.sourceSaleId));
              return isInvoiceSale(canonicalSale) ? createRide(canonicalSale, client) : canonicalSale.documentType === "proforma" ? createProforma(canonicalSale, client) : createTicket(canonicalSale, client);
            }}
            invoiceLabel={canIssueFromInternalDocuments(user.role) && sale.documentType === "nota_venta" && isTicketOffline(sale.status) ? "Facturar" : undefined}
            onInvoice={() => canonicalSale && invoiceFromTicket(canonicalSale)}
            ticketLabel={canIssueFromInternalDocuments(user.role) && sale.documentType === "proforma" && sale.status === "PROFORMA" ? "Convertir a nota interna" : undefined}
            onTicket={() => canonicalSale && convertProforma(canonicalSale, "nota_venta")}
            proformaInvoiceLabel={canIssueFromInternalDocuments(user.role) && sale.documentType === "proforma" && sale.status === "PROFORMA" ? "Convertir a factura" : undefined}
            onProformaInvoice={() => canonicalSale && convertProforma(canonicalSale, "factura")}
            emailLabel={(isInvoiceSale(sale) || isCreditNoteSale(sale)) && sale.status === "AUTORIZADA" ? "Email" : undefined}
            onEmail={() => client && canonicalSale && emailSale(canonicalSale, client)}
            whatsappLabel={isInvoiceSale(sale) && sale.status === "AUTORIZADA" ? "WhatsApp" : undefined}
            onWhatsapp={() => client && canonicalSale && whatsappSale(canonicalSale, client)}
            supportLabel={canOpenTechnicalDetail && isInvoiceSale(sale) && sale.status !== "AUTORIZADA" ? "Soporte" : undefined}
            onSupport={() => client && onXml(formatSaleDetail(actionableSale, client, data.issuer))}
            creditNoteLabel={canManageFiscalAdjustments(user.role) && client && canonicalSale && canIssueCreditNoteForSale(data.sales, canonicalSale, client) ? "Nota credito" : undefined}
            onCreditNote={() => client && canonicalSale && openCreditNoteForm(canonicalSale)}
            retentionLabel={canManageFiscalAdjustments(user.role) && isInvoiceSale(sale) && sale.status === "AUTORIZADA" ? "Retencion" : undefined}
            onRetention={() => canonicalSale && openRetentionForm(canonicalSale)}
            editLabel={canIssueFromInternalDocuments(user.role) && canEditSale(sale) ? "Editar" : undefined}
            onEdit={() => canonicalSale && editSale(canonicalSale)}
            retryLabel={canRetryDocuments(user.role) && (isInvoiceSale(sale) || isCreditNoteSale(sale)) && canRetrySriStatus(sale.status) ? (retryingSaleId === sale.id ? "Reintentando..." : `Reintentar SRI ${getRetryInfo(sale).today}/${MAX_DAILY_RETRIES}`) : undefined}
            onRetry={() => client && canonicalSale && retrySale(canonicalSale, client)}
            cancelLabel={canVoidDocuments(user.role) && sale.status !== "AUTORIZADA" && sale.status !== "ANULADA" && sale.status !== "CONVERTIDA" ? "Anular" : undefined}
            onCancel={() => canonicalSale && cancelDocument(canonicalSale)}
          />
        );
      })}
      <PaginationControls page={salePage} pageSize={salePageSize} totalItems={filteredSales.length} onPageChange={setSalePage} />
    </Section>
  );
}
