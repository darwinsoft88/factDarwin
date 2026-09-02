import { AppData, Sale } from "../types";
import { getRetryInfo, MAX_DAILY_RETRIES } from "./documents";
import { dateKey } from "./format";
import { isCreditNoteSale, isInvoiceSale, uniquePendingOfficialInvoices } from "./sales";

const sriPendingSendStatuses = new Set<Sale["status"]>(["FIRMADA", "ENVIADA", "PENDIENTE_SRI", "ENVIADA_SRI"]);
const sriAuthorizationQueryStatuses = new Set<Sale["status"]>(["ENVIADA", "ENVIADA_SRI"]);

export function isSriAuthorizationQueryDocument(sale: Sale) {
  return (isInvoiceSale(sale) || isCreditNoteSale(sale)) && sriAuthorizationQueryStatuses.has(sale.status);
}

export function isTransientSriIssue(message = "") {
  const text = message.toLowerCase();
  return [
    "conexion",
    "connection",
    "network",
    "timeout",
    "tiempo de espera",
    "servidor no esta disponible",
    "servidor",
    "fetch",
    "internet",
    "sri no respond",
    "no devolvio autorizacion",
    "en revision",
    "recibio el comprobante"
  ].some((pattern) => text.includes(pattern));
}

export function isDocumentCorrectionIssue(message = "") {
  const text = message.toLowerCase();
  return [
    "cedula",
    "cédula",
    "ruc invalido",
    "ruc inválido",
    "identificacion",
    "identificación",
    "secuencial",
    "clave de acceso ya registrada",
    "clave acceso registrada",
    "ambiente",
    "certificado",
    ".p12",
    "firma invalida",
    "firma inválida",
    "total",
    "impuesto",
    "xml",
    "devuelta",
    "rechazada",
    "no autorizado"
  ].some((pattern) => text.includes(pattern));
}

export function isSriDocumentSameDayForSending(sale: Sale, now = new Date()) {
  return dateKey(new Date(sale.createdAt)) === dateKey(now);
}

export function isSriSendPendingDocument(sale: Sale) {
  if (!(isInvoiceSale(sale) || isCreditNoteSale(sale))) return false;
  if (sriPendingSendStatuses.has(sale.status)) return true;
  return sale.status === "ERROR_SRI" && isTransientSriIssue(sale.sriMessage || "") && !isDocumentCorrectionIssue(sale.sriMessage || "");
}

export function isStaleSriPendingDocument(sale: Sale, now = new Date()) {
  return isSriSendPendingDocument(sale) && !isSriAuthorizationQueryDocument(sale) && !isSriDocumentSameDayForSending(sale, now);
}

export function staleSriPendingMessage(sale: Sale) {
  const label = isCreditNoteSale(sale) ? "nota de credito" : "factura";
  return `Esta ${label} no se envio al SRI dentro del dia de emision. No debe reenviarse; emita un nuevo comprobante con fecha actual.`;
}

export function sriPendingSendSummary(data: AppData, now = new Date()) {
  const pending = uniquePendingOfficialInvoices(data.sales.filter(isSriSendPendingDocument));
  const stale = pending.filter((sale) => isStaleSriPendingDocument(sale, now));
  const sendable = pending.filter((sale) => !isStaleSriPendingDocument(sale, now));
  return {
    pending,
    stale,
    sendable,
    pendingCount: pending.length,
    staleCount: stale.length,
    sendableCount: sendable.length
  };
}

export function shouldAutoRetrySriDocument(sale: Sale, now = new Date()) {
  if (!(isInvoiceSale(sale) || isCreditNoteSale(sale))) return false;
  if (sale.status === "AUTORIZADA" || sale.status === "ANULADA" || sale.status === "CONVERTIDA" || sale.status === "DEVUELTA") return false;
  if (isSriAuthorizationQueryDocument(sale)) return true;
  if (isStaleSriPendingDocument(sale, now)) return false;
  if (getRetryInfo(sale, now).today >= MAX_DAILY_RETRIES) return false;

  if (sale.status === "FIRMADA" || sale.status === "ENVIADA" || sale.status === "PENDIENTE_SRI" || sale.status === "ENVIADA_SRI") return true;
  if (sale.status === "ERROR_SRI") return isTransientSriIssue(sale.sriMessage || "") && !isDocumentCorrectionIssue(sale.sriMessage || "");
  return false;
}

export function statusForAuthorizationFailure(message = ""): Sale["status"] {
  return isTransientSriIssue(message) && !isDocumentCorrectionIssue(message) ? "PENDIENTE_SRI" : "ERROR_SRI";
}

export function sriStatusHelpText(sale: Sale) {
  if (isStaleSriPendingDocument(sale)) return "Fuera del dia permitido para envio al SRI. Debe anularse localmente y emitir un nuevo comprobante con fecha actual.";
  if (sale.status === "FIRMADA" || sale.status === "PENDIENTE_SRI") return "Pendiente de envio al SRI. La app puede reintentar automaticamente cuando haya conexion.";
  if (sale.status === "ENVIADA" || sale.status === "ENVIADA_SRI") return "En revision SRI. La app puede consultar/reintentar automaticamente.";
  if (sale.status === "ERROR_SRI" && shouldAutoRetrySriDocument(sale)) return "Error temporal. Se reintentara automaticamente cuando haya conexion.";
  if (sale.status === "ERROR_SRI") return "Error del documento. Revise el detalle, corrija y reintente manualmente.";
  if (sale.status === "DEVUELTA") return "Devuelta por SRI. Corrija el documento antes de reenviar.";
  return "";
}
