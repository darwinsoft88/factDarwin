import React from "react";
import { LIST_BATCH_SIZE } from "../constants/app";
import { money } from "../services/sri";
import { AppData, DocumentType, Sale, User } from "../types";
import { canAccessSensitiveSupport, canIssueFromInternalDocuments, canManageFiscalAdjustments, canRetryDocuments, canVoidDocuments } from "../utils/appAccess";
import { formatSaleDetail } from "../utils/documentDetails";
import { getRetryInfo, MAX_DAILY_RETRIES } from "../utils/documents";
import { formatShortDate, shortText } from "../utils/format";
import { canRetrySriStatus, displayInvoiceStatus, isTicketOffline } from "../utils/invoiceStatus";
import { canEditSale, canIssueCreditNoteForSale, documentTypeLabel, isCreditNoteSale, isInvoiceSale } from "../utils/sales";
import { DismissibleNotice } from "./DismissibleNotice";
import { InvoiceStatsGrid } from "./InvoiceStatsGrid";
import { ListItem } from "./ListItem";
import { SalesFilters } from "./SalesFilters";
import { Empty, LoadMoreButton, Section } from "./common";

type SalesDocumentsSectionProps = {
  cancelDocument: (sale: Sale) => void;
  convertProforma: (sale: Sale, target: DocumentType) => void;
  createCreditNoteRide: (sale: Sale, client: AppData["clients"][number], source?: Sale) => void;
  createProforma: (sale: Sale, client: AppData["clients"][number]) => void;
  createRide: (sale: Sale, client: AppData["clients"][number]) => void;
  createTicket: (sale: Sale, client: AppData["clients"][number]) => void;
  data: AppData;
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
  setVisibleSaleCount: React.Dispatch<React.SetStateAction<number>>;
  startDate: string;
  statusFilter: string;
  user: User;
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
  setVisibleSaleCount,
  startDate,
  statusFilter,
  user,
  visibleSales,
  whatsappSale
}: SalesDocumentsSectionProps) {
  return (
    <Section title="Facturas">
      <DismissibleNotice message={notice} tone="success" title="Factura enviada" onDismiss={() => setNotice("")} />
      <InvoiceStatsGrid stats={invoiceStats} />
      <SalesFilters
        search={invoiceSearch}
        startDate={startDate}
        endDate={endDate}
        status={statusFilter}
        onSearchChange={setInvoiceSearch}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onToday={onToday}
        onMonth={onMonth}
        onClearDates={onClearDates}
        onStatusChange={setStatusFilter}
      />
      {data.sales.length === 0 ? <Empty text="Aun no hay ventas." /> : null}
      {data.sales.length > 0 && filteredSales.length === 0 ? <Empty text="No hay documentos con ese filtro." /> : null}
      {visibleSales.map((sale) => {
        const client = data.clients.find((item) => item.id === sale.clientId);
        return (
          <ListItem
            key={sale.id}
            title={`${sale.sequence} - ${client?.name ?? "Cliente"}`}
            meta={`${formatShortDate(sale.createdAt)} | ${documentTypeLabel(sale)} | ${displayInvoiceStatus(sale.status)} | $${money(sale.total)} | ${sale.authorizationNumber || sale.accessKey || "Interno"}${sale.sriMessage ? ` | ${shortText(sale.sriMessage, 90)}` : ""}`}
            badge={sale.status}
            onOpen={canAccessSensitiveSupport(user.role) ? () => client && onXml(formatSaleDetail(sale, client, data.issuer)) : undefined}
            secondaryLabel={(isInvoiceSale(sale) || isCreditNoteSale(sale)) && sale.status === "AUTORIZADA" ? "Ver RIDE" : sale.documentType === "nota_venta" && isTicketOffline(sale.status) ? "Ver nota" : sale.documentType === "proforma" && sale.status === "PROFORMA" ? "Ver proforma" : undefined}
            onSecondary={() => {
              if (!client) return;
              if (isCreditNoteSale(sale)) return createCreditNoteRide(sale, client, data.sales.find((item) => item.id === sale.sourceSaleId));
              return isInvoiceSale(sale) ? createRide(sale, client) : sale.documentType === "proforma" ? createProforma(sale, client) : createTicket(sale, client);
            }}
            invoiceLabel={canIssueFromInternalDocuments(user.role) && sale.documentType === "nota_venta" && isTicketOffline(sale.status) ? "Facturar" : undefined}
            onInvoice={() => invoiceFromTicket(sale)}
            ticketLabel={canIssueFromInternalDocuments(user.role) && sale.documentType === "proforma" && sale.status === "PROFORMA" ? "Convertir a nota interna" : undefined}
            onTicket={() => convertProforma(sale, "nota_venta")}
            proformaInvoiceLabel={canIssueFromInternalDocuments(user.role) && sale.documentType === "proforma" && sale.status === "PROFORMA" ? "Convertir a factura" : undefined}
            onProformaInvoice={() => convertProforma(sale, "factura")}
            emailLabel={(isInvoiceSale(sale) || isCreditNoteSale(sale)) && sale.status === "AUTORIZADA" ? "Email" : undefined}
            onEmail={() => client && emailSale(sale, client)}
            whatsappLabel={isInvoiceSale(sale) && sale.status === "AUTORIZADA" ? "WhatsApp" : undefined}
            onWhatsapp={() => client && whatsappSale(sale, client)}
            supportLabel={canAccessSensitiveSupport(user.role) && isInvoiceSale(sale) && sale.status !== "AUTORIZADA" ? "Soporte" : undefined}
            onSupport={() => client && onXml(formatSaleDetail(sale, client, data.issuer))}
            creditNoteLabel={canManageFiscalAdjustments(user.role) && client && canIssueCreditNoteForSale(data.sales, sale, client) ? "Nota credito" : undefined}
            onCreditNote={() => client && openCreditNoteForm(sale)}
            retentionLabel={canManageFiscalAdjustments(user.role) && isInvoiceSale(sale) && sale.status === "AUTORIZADA" ? "Retencion" : undefined}
            onRetention={() => openRetentionForm(sale)}
            editLabel={canIssueFromInternalDocuments(user.role) && canEditSale(sale) ? "Editar" : undefined}
            onEdit={() => editSale(sale)}
            retryLabel={canRetryDocuments(user.role) && (isInvoiceSale(sale) || isCreditNoteSale(sale)) && canRetrySriStatus(sale.status) ? (retryingSaleId === sale.id ? "..." : `Reintentar ${getRetryInfo(sale).today}/${MAX_DAILY_RETRIES}`) : undefined}
            onRetry={() => client && retrySale(sale, client)}
            cancelLabel={canVoidDocuments(user.role) && sale.status !== "AUTORIZADA" && sale.status !== "ANULADA" ? "Anular" : undefined}
            onCancel={() => cancelDocument(sale)}
          />
        );
      })}
      {visibleSales.length < filteredSales.length ? <LoadMoreButton label="Cargar mas documentos" onPress={() => setVisibleSaleCount((count) => count + LIST_BATCH_SIZE)} /> : null}
    </Section>
  );
}
