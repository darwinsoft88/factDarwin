import { buildCreditNoteXml, buildInvoiceXml, calculateLineSubtotal, calculateLineTax, calculateLineTotal, money } from "../sri";
import { Client, Issuer, ReceivedRetention, Sale } from "../types";
import { documentNumber, getRetryInfo, MAX_DAILY_RETRIES } from "./documents";
import { formatShortDate } from "./format";
import { documentTypeLabel, isCreditNoteSale, isInvoiceSale } from "./sales";
import { formatAuditDate } from "./support";

export function formatSaleDetail(sale: Sale, client: Client, issuer: Issuer) {
  const retryInfo = getRetryInfo(sale);
  const isCreditNote = isCreditNoteSale(sale);
  return [
    isCreditNote ? "NOTA DE CREDITO" : isInvoiceSale(sale) ? "FACTURA" : sale.documentType === "proforma" ? "PROFORMA" : "NOTA DE VENTA",
    `Documento: ${documentTypeLabel(sale)}`,
    `Estado: ${sale.status}`,
    `Cliente: ${client.name}`,
    `Total: $${money(sale.total)}`,
    sale.paymentCondition === "credito" ? `Credito pendiente: $${money(sale.creditBalance ?? sale.total)}${sale.creditDueDate ? ` | vence ${sale.creditDueDate}` : ""}` : "Condicion de cobro: contado",
    isInvoiceSale(sale) || isCreditNote ? `Clave de acceso: ${sale.accessKey}` : `Secuencia interna: ${sale.sequence}`,
    isCreditNote && sale.supportDocumentNumber ? `Factura modificada: ${sale.supportDocumentNumber}` : "",
    isCreditNote && sale.creditReason ? `Motivo nota credito: ${sale.creditReason}` : "",
    sale.authorizationNumber ? `Numero autorizacion: ${sale.authorizationNumber}` : "",
    sale.authorizationDate ? `Fecha autorizacion: ${sale.authorizationDate}` : "",
    sale.sriEnvironment ? `Ambiente SRI: ${sale.sriEnvironment}` : "",
    `Reenvios hoy: ${retryInfo.today}/${MAX_DAILY_RETRIES}`,
    sale.voidReason ? `Motivo anulacion: ${sale.voidReason}` : "",
    sale.voidedAt ? `Fecha anulacion: ${sale.voidedAt}` : "",
    sale.sriMessage ? `Mensaje SRI: ${sale.sriMessage}` : "",
    sale.emailHistory?.[0] ? `Ultimo correo: ${formatEmailHistoryEntry(sale.emailHistory[0])}` : "",
    "",
    isInvoiceSale(sale) || isCreditNote ? (sale.authorizedXml ? "XML AUTORIZADO" : sale.signedXml ? "XML FIRMADO" : "XML GENERADO") : sale.documentType === "proforma" ? "DETALLE PROFORMA" : "DETALLE INTERNO",
    isCreditNote ? sale.authorizedXml || sale.signedXml || buildCreditNoteXml(sale, client, issuer) : isInvoiceSale(sale) ? sale.authorizedXml || sale.signedXml || buildInvoiceXml(sale, client, issuer) : formatInternalSaleDetail(sale)
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function formatReceivedRetentionDetail(retention: ReceivedRetention, sale: Sale | undefined, client: Client | undefined, issuer: Issuer) {
  return [
    "RETENCION RECIBIDA",
    `Impuesto: ${retention.taxType}`,
    `Comprobante: ${retention.documentNumber}`,
    retention.authorizationNumber ? `Autorizacion: ${retention.authorizationNumber}` : "",
    `Fecha recepcion: ${formatShortDate(retention.receivedAt)}`,
    `Cliente: ${client?.name || "Cliente"}`,
    sale ? `Factura relacionada: ${documentNumber(sale, issuer)}` : "",
    sale?.authorizationNumber ? `Autorizacion factura: ${sale.authorizationNumber}` : "",
    `Base: $${money(retention.base)}`,
    `Porcentaje: ${money(retention.percentage)}%`,
    `Valor retenido: $${money(retention.amount)}`,
    retention.notes ? `Notas: ${retention.notes}` : ""
  ].filter((line) => line !== "").join("\n");
}

function formatEmailHistoryEntry(entry: NonNullable<Sale["emailHistory"]>[number]) {
  const status = entry.status === "sent" ? "enviado" : "fallido";
  return `${status} a ${entry.to} el ${formatAuditDate(entry.sentAt)}${entry.error ? ` | ${entry.error}` : ""}`;
}

function formatInternalSaleDetail(sale: Sale) {
  const lines = sale.items.map((item) => `${item.quantity} x ${item.name} | Base $${money(calculateLineSubtotal(item))} | IVA $${money(calculateLineTax(item))} | Total $${money(calculateLineTotal(item))}`);

  return [
    `Subtotal: $${money(sale.subtotal)}`,
    `IVA referencial: $${money(sale.tax)}`,
    `Total: $${money(sale.total)}`,
    "",
    "PRODUCTOS",
    ...lines
  ].join("\n");
}
