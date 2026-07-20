import { InvoiceStatus, Sale } from "../types";

export const finalInvoiceStatuses = new Set<InvoiceStatus>(["AUTORIZADA", "DEVUELTA", "ERROR_SRI", "ANULADA", "CONVERTIDA"]);

export function normalizeInvoiceStatus(status: unknown, sriMessage = ""): InvoiceStatus {
  const value = String(status || "BORRADOR").toUpperCase();
  if (value === "INTERNA") return "TICKET_OFFLINE";
  if (value === "PENDIENTE_SRI") return "FIRMADA";
  if (value === "RECIBIDA" || value === "ENVIADA_SRI") return "ENVIADA";
  if (value === "RECHAZADA") return sriMessage.toUpperCase().includes("ERROR") ? "ERROR_SRI" : "DEVUELTA";
  if (isInvoiceStatus(value)) return value;
  return "BORRADOR";
}

export function normalizeSaleStatus(sale: Pick<Sale, "status" | "sriMessage" | "voidReason">): InvoiceStatus {
  const normalized = normalizeInvoiceStatus(sale.status, sale.sriMessage);
  if (normalized === "ANULADA" && sale.voidReason?.toLowerCase().includes("convertida a")) return "CONVERTIDA";
  return normalized;
}

export function isInvoiceStatus(value: string): value is InvoiceStatus {
  return [
    "BORRADOR",
    "TICKET_OFFLINE",
    "FIRMADA",
    "ENVIADA",
    "PENDIENTE_SRI",
    "ENVIADA_SRI",
    "AUTORIZADA",
    "DEVUELTA",
    "ERROR_SRI",
    "ANULADA",
    "PROFORMA",
    "CONVERTIDA"
  ].includes(value);
}

export function isTicketOffline(status: Sale["status"]) {
  return status === "TICKET_OFFLINE";
}

export function isSriRejected(status: Sale["status"]) {
  return status === "DEVUELTA" || status === "ERROR_SRI";
}

export function isSriPending(status: Sale["status"]) {
  return status === "BORRADOR" || status === "FIRMADA" || status === "ENVIADA" || status === "PENDIENTE_SRI" || status === "ENVIADA_SRI";
}

export function canRetrySriStatus(status: Sale["status"]) {
  return status !== "AUTORIZADA" && status !== "ANULADA" && status !== "CONVERTIDA";
}

export function displayInvoiceStatus(status: Sale["status"]) {
  if (status === "TICKET_OFFLINE") return "INTERNO";
  if (status === "PENDIENTE_SRI" || status === "FIRMADA") return "PENDIENTE ENVIO SRI";
  if (status === "ENVIADA_SRI" || status === "ENVIADA") return "EN REVISION SRI";
  if (status === "ERROR_SRI") return "ERROR SRI";
  if (status === "CONVERTIDA") return "CONVERTIDA";
  return status;
}
