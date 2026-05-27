import { InvoiceStatus, Sale } from "../types";

export const finalInvoiceStatuses = new Set<InvoiceStatus>(["AUTORIZADA", "DEVUELTA", "ERROR_SRI", "ANULADA"]);

export function normalizeInvoiceStatus(status: unknown, sriMessage = ""): InvoiceStatus {
  const value = String(status || "BORRADOR").toUpperCase();
  if (value === "INTERNA") return "TICKET_OFFLINE";
  if (value === "PENDIENTE_SRI") return "FIRMADA";
  if (value === "RECIBIDA" || value === "ENVIADA_SRI") return "ENVIADA";
  if (value === "RECHAZADA") return sriMessage.toUpperCase().includes("ERROR") ? "ERROR_SRI" : "DEVUELTA";
  if (isInvoiceStatus(value)) return value;
  return "BORRADOR";
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
    "PROFORMA"
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
  return status !== "AUTORIZADA" && status !== "ANULADA";
}

export function displayInvoiceStatus(status: Sale["status"]) {
  if (status === "TICKET_OFFLINE") return "INTERNO";
  if (status === "PENDIENTE_SRI" || status === "FIRMADA") return "FIRMADA";
  if (status === "ENVIADA_SRI" || status === "ENVIADA") return "ENVIADA";
  if (status === "ERROR_SRI") return "ERROR SRI";
  return status;
}
