import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
import { SalesFilters, SalesStatusFilter } from "./SalesFilters";
import { CollapsibleSection, Empty, Input, Section } from "./common";
import type { AccentCardTone } from "./ThemedAccentCard";
import { useAppTheme } from "../theme/AppTheme";

function documentAccentTone(status: string): AccentCardTone {
  if (status === "AUTORIZADA") return "success";
  if (status === "DEVUELTA" || status === "ERROR_SRI") return "danger";
  if (status === "PROFORMA") return "warning";
  if (["FIRMADA", "ENVIADA", "ENVIADA_SRI", "PENDIENTE_SRI", "EN_REVISION_SRI", "TICKET_OFFLINE"].includes(status)) return "info";
  return "primary";
}

type SalesDocumentsSectionProps = {
  cancelDocument: (sale: Sale) => void;
  convertProforma: (sale: Sale, target: DocumentType) => void;
  createCreditNoteRide: (sale: Sale, client: AppData["clients"][number], source?: Sale) => void;
  createProforma: (sale: Sale, client: AppData["clients"][number]) => void;
  createRide: (sale: Sale, client: AppData["clients"][number]) => void;
  createTicket: (sale: Sale, client: AppData["clients"][number]) => void;
  data: AppData;
  historySales: Sale[];
  historicalClientNames: Record<string, string>;
  historicalIds: Set<string>;
  canLoadOlder: boolean;
  loadingOlder: boolean;
  localEnvironmentSimulationAvailable: boolean;
  readOnlySimulation: boolean;
  onToggleEnvironmentSimulation: () => void;
  onLoadOlder: () => void;
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
  sendingEmailSaleId: string;
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
  historicalClientNames,
  historicalIds,
  canLoadOlder,
  loadingOlder,
  localEnvironmentSimulationAvailable,
  readOnlySimulation,
  onToggleEnvironmentSimulation,
  onLoadOlder,
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
  sendingEmailSaleId,
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
  const { theme } = useAppTheme();
  const canOpenTechnicalDetail = !readOnlySimulation && canAccessDeveloperTools(user);

  return (
    <Section title={`Documentos - ${data.issuer.environment === "1" ? "Ambiente de pruebas" : "Ambiente de producción"}`}>
      {localEnvironmentSimulationAvailable ? (
        <View style={[simulationStyles.banner, { backgroundColor: theme.colors.warningSoft, borderColor: theme.colors.warning }]}>
          <View style={simulationStyles.textArea}>
            <Text style={[simulationStyles.title, { color: theme.colors.warning }]}>SIMULACIÓN LOCAL · SOLO LECTURA</Text>
            <Text style={[simulationStyles.detail, { color: theme.colors.textMuted }]}>Cambia únicamente la vista para comprobar el aislamiento. No modifica el ambiente fiscal ni envía documentos al SRI.</Text>
          </View>
          <Pressable onPress={onToggleEnvironmentSimulation} style={[simulationStyles.button, { backgroundColor: theme.colors.primary }]}>
            <Text style={[simulationStyles.buttonText, { color: theme.colors.onPrimary }]}>Ver {data.issuer.environment === "1" ? "PRODUCCIÓN" : "PRUEBAS"}</Text>
          </Pressable>
        </View>
      ) : null}
      <DismissibleNotice message={notice} tone="success" title="Factura enviada" onDismiss={() => setNotice("")} />
      <Input label="Buscar documento" value={invoiceSearch} onChangeText={setInvoiceSearch} placeholder="Cliente, cedula, secuencial o clave" autoCapitalize="none" />
      <CollapsibleSection
        title="Filtros y resumen"
        embedded
        headerAccessory={<SalesStatusFilter status={statusFilter} onStatusChange={setStatusFilter} compact />}
      >
        <InvoiceStatsGrid stats={invoiceStats} />
        <SalesFilters
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onToday={onToday}
          onMonth={onMonth}
          onClearDates={onClearDates}
        />
      </CollapsibleSection>
      {historySales.length === 0 ? <Empty text={`No hay documentos en el ambiente de ${data.issuer.environment === "1" ? "pruebas" : "producción"}.`} /> : null}
      {historySales.length > 0 && filteredSales.length === 0 ? <Empty text="No hay documentos con ese filtro." /> : null}
      {visibleSales.map((sale) => {
        const client = data.clients.find((item) => item.id === sale.clientId);
        const clientDisplayName = client?.name || historicalClientNames[sale.id] || "Cliente";
        const canonicalSale = readOnlySimulation ? undefined : data.sales.find((item) => item.id === sale.id);
        const isHistoricalOnly = historicalIds.has(sale.id) && !canonicalSale;
        const actionableSale = canonicalSale ?? sale;
        const documentContext = `${formatShortDate(sale.createdAt)} | ${documentTypeLabel(sale)} | ${displayInvoiceStatus(sale.status)}`;
        const creditContext = sale.paymentCondition === "credito" ? ` | Credito pendiente $${money(sale.creditBalance ?? sale.total)}` : "";
        const technicalContext = ` | ${sale.authorizationNumber || sale.accessKey || "Interno"}${sriStatusHelpText(sale) ? ` | ${sriStatusHelpText(sale)}` : sale.sriMessage ? ` | ${shortText(sale.sriMessage, 90)}` : ""}`;
        return (
          <ListItem
            key={sale.id}
            title={clientDisplayName}
            titleReference={documentNumber(sale, data.issuer)}
            meta={`${documentContext} | $${money(sale.total)}${creditContext}${technicalContext}`}
            cardMeta={`${documentContext}${creditContext}${technicalContext}`}
            trailingValue={`$${money(sale.total)}`}
            badge={sale.status}
            accentTone={documentAccentTone(sale.status)}
            onOpen={canOpenTechnicalDetail && !isHistoricalOnly ? () => {
              if (!client) return;
              void loadSaleDetail(sale.id).then((detail) => {
                if (detail) onXml(formatSaleDetail(detail, client, data.issuer));
              });
            } : undefined}
            secondaryLabel={!isHistoricalOnly && (isInvoiceSale(sale) || isCreditNoteSale(sale)) && sale.status === "AUTORIZADA" ? "Ver RIDE" : !isHistoricalOnly && sale.documentType === "nota_venta" && isTicketOffline(sale.status) ? "Ver nota" : !isHistoricalOnly && sale.documentType === "proforma" && sale.status === "PROFORMA" ? "Ver proforma" : undefined}
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
            emailLabel={!isHistoricalOnly && (isInvoiceSale(sale) || isCreditNoteSale(sale)) && sale.status === "AUTORIZADA" ? (sendingEmailSaleId === sale.id ? "Enviando..." : "Email") : undefined}
            onEmail={() => client && canonicalSale && emailSale(canonicalSale, client)}
            whatsappLabel={!isHistoricalOnly && isInvoiceSale(sale) && sale.status === "AUTORIZADA" ? "WhatsApp" : undefined}
            onWhatsapp={() => client && canonicalSale && whatsappSale(canonicalSale, client)}
            supportLabel={!readOnlySimulation && (isInvoiceSale(sale) || isCreditNoteSale(sale)) && sale.status !== "AUTORIZADA" ? "Ver detalle SRI" : undefined}
            onSupport={() => client && onXml(formatSaleDetail(actionableSale, client, data.issuer))}
            creditNoteLabel={canManageFiscalAdjustments(user.role) && client && canonicalSale && canIssueCreditNoteForSale(data.sales, canonicalSale, client) ? "Nota credito" : undefined}
            onCreditNote={() => client && canonicalSale && openCreditNoteForm(canonicalSale)}
            retentionLabel={!isHistoricalOnly && canManageFiscalAdjustments(user.role) && isInvoiceSale(sale) && sale.status === "AUTORIZADA" ? "Retencion" : undefined}
            onRetention={() => canonicalSale && openRetentionForm(canonicalSale)}
            editLabel={!readOnlySimulation && canIssueFromInternalDocuments(user.role) && canEditSale(sale) ? "Editar" : undefined}
            onEdit={() => canonicalSale && editSale(canonicalSale)}
            retryLabel={!isHistoricalOnly && canRetryDocuments(user.role) && isInvoiceSale(sale) && sale.status === "AUTORIZADA" && sale.inventoryState === "RECONCILIATION_PENDING"
              ? (retryingSaleId === sale.id ? "Reconciliando..." : "Reconciliar inventario")
              : !isHistoricalOnly && canRetryDocuments(user.role) && (isInvoiceSale(sale) || isCreditNoteSale(sale)) && canRetrySriStatus(sale.status)
                ? (retryingSaleId === sale.id ? "Reintentando..." : `Reintentar SRI ${getRetryInfo(sale).today}/${MAX_DAILY_RETRIES}`)
                : undefined}
            onRetry={() => client && canonicalSale && retrySale(canonicalSale, client)}
            cancelLabel={!isHistoricalOnly && canVoidDocuments(user.role) && sale.status !== "AUTORIZADA" && sale.status !== "ANULADA" && sale.status !== "CONVERTIDA" ? "Anular" : undefined}
            onCancel={() => canonicalSale && cancelDocument(canonicalSale)}
          />
        );
      })}
      <PaginationControls page={salePage} pageSize={salePageSize} totalItems={filteredSales.length} onPageChange={setSalePage} hasMoreItems={canLoadOlder} loadingMore={loadingOlder} onRequestMore={onLoadOlder} />
    </Section>
  );
}

const simulationStyles = StyleSheet.create({
  banner: { alignItems: "center", borderRadius: 12, borderWidth: 1, flexDirection: "row", gap: 10, padding: 11 },
  textArea: { flex: 1 },
  title: { fontSize: 11, fontWeight: "900" },
  detail: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  button: { borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9 },
  buttonText: { fontSize: 11, fontWeight: "900" }
});
