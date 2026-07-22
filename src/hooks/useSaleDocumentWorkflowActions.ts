import React from "react";
import { Alert } from "react-native";
import type { PersistMutation } from "./useSyncAndBackup";
import { authorizeInvoice } from "../services/backend";
import { buildCreditNoteXml, buildInvoiceXml } from "../sri";
import { AdditionalInfoField, AppData, Client, DocumentType, PaymentCondition, PaymentMethod, Sale, SaleItem, SalePaymentSplit, User } from "../types";
import { appendAudit } from "../utils/audit";
import { expireStaleSriPendingDocuments } from "../utils/autoRetrySriDocuments";
import { getRetryInfo, MAX_DAILY_RETRIES, resolveInvoiceStatus } from "../utils/documents";
import { confirmAction, getLocalVoidReason, showMessage } from "../utils/dialogs";
import { issuerForSale } from "../utils/establishments";
import { reverseSaleInventoryOnce, SaleInventoryError } from "../utils/inventory";
import { isTicketOffline } from "../utils/invoiceStatus";
import { canEditSale, documentTypeLabel, isCreditNoteSale, isInvoiceSale, resolveSaleInventoryState } from "../utils/sales";
import { explainSriResult, sriUserMessage } from "../utils/sriMessages";
import { isDocumentCorrectionIssue, isStaleSriPendingDocument, isTransientSriIssue, staleSriPendingMessage } from "../utils/sriRetryPolicy";

const definitiveFailureStatuses = new Set<Sale["status"]>(["DEVUELTA", "ERROR_SRI", "ANULADA"]);

function retryFingerprint(sale: Sale): string {
  return JSON.stringify({
    accessKey: sale.accessKey,
    clientId: sale.clientId,
    documentType: sale.documentType,
    inventoryOperationId: sale.inventoryOperationId,
    inventoryState: sale.inventoryState,
    items: sale.items,
    retryHistory: sale.retryHistory,
    sequence: sale.sequence,
    sourceSaleId: sale.sourceSaleId,
    status: sale.status
  });
}

function isDefinitiveFailure(sale: Sale): boolean {
  if (!definitiveFailureStatuses.has(sale.status)) return false;
  if (sale.status !== "ERROR_SRI") return true;
  const message = sale.sriMessage || "";
  return !isTransientSriIssue(message) || isDocumentCorrectionIssue(message);
}

function inventoryConsistencyError(sale: Sale): SaleInventoryError {
  const state = resolveSaleInventoryState(sale);
  return new SaleInventoryError(
    state === "UNKNOWN"
      ? "SALE_INVENTORY_LEGACY_RECONCILIATION_REQUIRED"
      : "SALE_INVENTORY_OPERATION_MISMATCH",
    sale.id,
    sale.inventoryOperationId || sale.id,
    "APPLY"
  );
}

function isClosedSale(sale: Sale) {
  return sale.status === "AUTORIZADA" || sale.status === "ANULADA" || sale.status === "CONVERTIDA";
}

type UseSaleDocumentWorkflowActionsParams = {
  backendToken: string;
  data: AppData;
  persistMutation: PersistMutation;
  user: User;
  setClientId: React.Dispatch<React.SetStateAction<string>>;
  setDocumentType: React.Dispatch<React.SetStateAction<DocumentType>>;
  setEditingSaleId: React.Dispatch<React.SetStateAction<string>>;
  setIssueNotice: React.Dispatch<React.SetStateAction<string>>;
  setItems: React.Dispatch<React.SetStateAction<SaleItem[]>>;
  setAdditionalInfo: React.Dispatch<React.SetStateAction<AdditionalInfoField[]>>;
  setNotice: React.Dispatch<React.SetStateAction<string>>;
  setPaymentMethod: React.Dispatch<React.SetStateAction<PaymentMethod>>;
  setSalePayments: React.Dispatch<React.SetStateAction<SalePaymentSplit[]>>;
  setPaymentCondition: React.Dispatch<React.SetStateAction<PaymentCondition>>;
  setCreditDueDate: React.Dispatch<React.SetStateAction<string>>;
  setProcessingMessage: React.Dispatch<React.SetStateAction<string>>;
  setRetryingSaleId: React.Dispatch<React.SetStateAction<string>>;
  setSourceProformaId: React.Dispatch<React.SetStateAction<string>>;
  setSourceTicketId: React.Dispatch<React.SetStateAction<string>>;
};

export function useSaleDocumentWorkflowActions({
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
}: UseSaleDocumentWorkflowActionsParams) {
  const loadPaymentTerms = (sale: Sale) => {
    setPaymentMethod(sale.paymentMethod || "01");
    setSalePayments(sale.payments || []);
    setPaymentCondition(sale.paymentCondition || (sale.creditBalance && sale.creditBalance > 0 ? "credito" : "contado"));
    setCreditDueDate(sale.creditDueDate || "");
  };

  const retrySale = async (sale: Sale, client: Client) => {
    if (!isInvoiceSale(sale) && !isCreditNoteSale(sale)) {
      Alert.alert("Documento interno", "Este documento no se envia al SRI.");
      return;
    }
    if (isClosedSale(sale)) {
      Alert.alert("Documento cerrado", "Este documento ya no se puede reintentar.");
      return;
    }
    if (isStaleSriPendingDocument(sale)) {
      const message = staleSriPendingMessage(sale);
      let expired = 0;
      let failed = 0;
      await persistMutation((current) => {
        const result = expireStaleSriPendingDocuments(current, user);
        expired = result.expired;
        failed = result.failed;
        return result.data;
      });
      const finalMessage = failed > 0 && expired === 0
        ? "El inventario de este documento requiere reconciliacion antes de anularlo."
        : message;
      setNotice(finalMessage);
      Alert.alert(failed > 0 && expired === 0 ? "Reconciliacion requerida" : "Fuera del dia permitido", failed > 0 && expired === 0 ? finalMessage : `${message}\n\nPor norma operativa, emita un nuevo comprobante con fecha actual.`);
      return;
    }
    const retryInfo = getRetryInfo(sale);
    if (retryInfo.today >= MAX_DAILY_RETRIES) {
      const message = `Esta factura ya tiene ${retryInfo.today} reintento(s) hoy. Revise el detalle del documento antes de volver a intentar manana.`;
      setNotice(message);
      Alert.alert("Limite diario de reintentos", message);
      return;
    }
    const saleId = sale.id;
    const clientId = client.id;
    const requestFingerprint = retryFingerprint(sale);
    const sourceSale = sale.sourceSaleId ? data.sales.find((item) => item.id === sale.sourceSaleId) : undefined;
    const ticketDerived = isInvoiceSale(sale) && sourceSale?.documentType === "nota_venta";
    if (isInvoiceSale(sale)) {
      const inventoryState = resolveSaleInventoryState(sale);
      const sourceInventoryState = sourceSale ? resolveSaleInventoryState(sourceSale) : undefined;
      if (
        (ticketDerived && (inventoryState !== "NOT_APPLIED" || sourceInventoryState !== "APPLIED")) ||
        (!ticketDerived && inventoryState !== "APPLIED")
      ) {
        Alert.alert("Reconciliacion requerida", "El inventario del documento no es consistente para reintentar la emision.");
        return;
      }
    }
    const saleIssuer = issuerForSale(data.issuer, sale);
    const unsignedXml = isCreditNoteSale(sale) ? buildCreditNoteXml(sale, client, saleIssuer) : buildInvoiceXml(sale, client, saleIssuer);
    const retryAt = new Date().toISOString();
    setRetryingSaleId(saleId);
    setProcessingMessage(`Reintentando ${documentTypeLabel(sale).toLowerCase()}...`);

    let sriResult: Awaited<ReturnType<typeof authorizeInvoice>>;
    try {
      sriResult = await authorizeInvoice(data.backendUrl, unsignedXml, backendToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo reintentar el documento.";
      try {
        await persistMutation((current) => {
          const currentSale = current.sales.find((item) => item.id === saleId);
          if (!currentSale || retryFingerprint(currentSale) !== requestFingerprint || isClosedSale(currentSale)) return current;
          const updatedSale: Sale = { ...currentSale, status: "ERROR_SRI", sriMessage: message, retryHistory: [...(currentSale.retryHistory || []), retryAt] };
          return appendAudit({ ...current, sales: current.sales.map((item) => item.id === saleId ? updatedSale : item) }, user, isCreditNoteSale(currentSale) ? "CREDIT_NOTE_RETRY_FAILED" : "INVOICE_RETRY_FAILED", "sale", saleId, `Reenvio fallido de ${documentTypeLabel(currentSale)} ${currentSale.sequence}`, { error: message });
        });
        Alert.alert("No se pudo reintentar", message);
      } finally {
        setRetryingSaleId("");
        setProcessingMessage("");
      }
      return;
    }

    try {
      let applied = false;
      let persistedSale: Sale | undefined;
      await persistMutation((current) => {
        const currentSale = current.sales.find((item) => item.id === saleId);
        if (!currentSale || retryFingerprint(currentSale) !== requestFingerprint || isClosedSale(currentSale)) return current;
        const currentClient = current.clients.find((item) => item.id === clientId);
        if (!currentClient) return current;
        let updatedSale: Sale = {
          ...currentSale,
          accessKey: sriResult.accessKey || currentSale.accessKey,
          authorizationNumber: sriResult.authorizationNumber,
          authorizationDate: sriResult.authorizationDate,
          sriEnvironment: sriResult.sriEnvironment,
          sriMessage: sriResult.sriMessage,
          signedXml: sriResult.signedXml,
          authorizedXml: sriResult.authorizedXml,
          status: resolveInvoiceStatus(sriResult),
          retryHistory: [...(currentSale.retryHistory || []), retryAt]
        };
        let products = current.products;
        let movements = current.inventoryMovements || [];
        const currentSource = updatedSale.sourceSaleId ? current.sales.find((item) => item.id === updatedSale.sourceSaleId) : undefined;
        const currentTicketDerived = isInvoiceSale(updatedSale) && currentSource?.documentType === "nota_venta";
        if (isInvoiceSale(updatedSale) && !currentTicketDerived) {
          const inventoryState = resolveSaleInventoryState(currentSale);
          if (updatedSale.status === "AUTORIZADA" || !isDefinitiveFailure(updatedSale)) {
            if (inventoryState !== "APPLIED") throw inventoryConsistencyError(currentSale);
          } else if (inventoryState === "UNKNOWN") {
            throw inventoryConsistencyError(currentSale);
          } else if (inventoryState === "APPLIED") {
            const reversed = reverseSaleInventoryOnce({ products, movements, sale: updatedSale, operationId: currentSale.inventoryOperationId || currentSale.id, userId: user.id, createdAt: retryAt, reason: `Reverso por estado ${updatedSale.status}` });
            products = reversed.products;
            movements = reversed.movements;
            updatedSale = reversed.sale;
          }
        } else if (currentTicketDerived) {
          if (resolveSaleInventoryState(currentSale) !== "NOT_APPLIED" || !currentSource || resolveSaleInventoryState(currentSource) !== "APPLIED") throw inventoryConsistencyError(currentSale);
          updatedSale = { ...updatedSale, inventoryState: "NOT_APPLIED", inventoryOperationId: undefined };
        }
        let sales = current.sales.map((item) => item.id === saleId ? updatedSale : item);
        if (updatedSale.status === "AUTORIZADA" && currentSource && (currentSource.documentType === "nota_venta" || currentSource.documentType === "proforma")) {
          if (currentSource.status === "CONVERTIDA" && currentSource.convertedToSaleId && currentSource.convertedToSaleId !== saleId) throw new Error("El documento de origen ya fue convertido a otro comprobante.");
          const convertedAt = new Date().toISOString();
          sales = sales.map((item) => item.id === currentSource.id ? { ...item, status: "CONVERTIDA" as const, voidReason: `Convertida a factura ${updatedSale.sequence}`, voidedAt: item.voidedAt || convertedAt, convertedAt: item.convertedAt || convertedAt, convertedToSaleId: updatedSale.id, convertedToSequence: updatedSale.sequence, sriMessage: `Convertida a factura ${updatedSale.sequence}` } : item);
        }
        applied = true;
        persistedSale = updatedSale;
        return appendAudit({ ...current, products, inventoryMovements: movements, sales }, user, isCreditNoteSale(currentSale) ? "CREDIT_NOTE_RETRIED" : "INVOICE_RETRIED", "sale", saleId, `Reenvio de ${documentTypeLabel(currentSale)} ${currentSale.sequence}: ${updatedSale.status}`, { status: updatedSale.status, accessKey: updatedSale.accessKey });
      });
      if (!applied || !persistedSale) {
        Alert.alert("Documento actualizado", "El documento cambio durante el reintento y la respuesta no se aplico sobre datos obsoletos.");
        return;
      }
      Alert.alert(explainSriResult(sriResult).title, persistedSale.status === "AUTORIZADA" ? `${documentTypeLabel(persistedSale)} autorizada.` : sriUserMessage(sriResult));
    } catch (error) {
      const message = error instanceof SaleInventoryError
        ? "El inventario del documento requiere reconciliacion antes de aplicar la respuesta SRI."
        : error instanceof Error ? error.message : "No se pudo guardar el resultado del SRI.";
      Alert.alert("No se pudo aplicar el resultado", message);
    } finally {
      setRetryingSaleId("");
      setProcessingMessage("");
    }
  };

  const editSale = (sale: Sale) => {
    if (!canEditSale(sale)) {
      Alert.alert("Factura no editable", "Solo se pueden editar facturas no autorizadas y no anuladas.");
      return;
    }

    setEditingSaleId(sale.id);
    setSourceTicketId("");
    setDocumentType(sale.documentType || "factura");
    setClientId(sale.clientId);
    loadPaymentTerms(sale);
    setItems(sale.items.map((item) => ({ ...item })));
    setAdditionalInfo((sale.additionalInfo || []).map((field) => ({ ...field })));
    setIssueNotice(`Corrigiendo factura ${sale.sequence}. Se reintentara con la misma autorizacion.`);
    setNotice("");
    showMessage("Documento cargado", `${documentTypeLabel(sale)} ${sale.sequence} listo para editar.`);
  };

  const invoiceFromTicket = (sale: Sale) => {
    if (sale.documentType !== "nota_venta" || !isTicketOffline(sale.status)) {
      Alert.alert("Ticket no disponible", "Solo se pueden facturar tickets internos activos.");
      return;
    }

    setEditingSaleId("");
    setSourceTicketId(sale.id);
    setDocumentType("factura");
    setClientId(sale.clientId);
    loadPaymentTerms(sale);
    setItems(sale.items.map((item) => ({ ...item })));
    setAdditionalInfo((sale.additionalInfo || []).map((field) => ({ ...field })));
    setIssueNotice(`Facturando ticket ${sale.sequence}. Se usara el siguiente numero disponible.`);
    setNotice("");
    showMessage("Ticket cargado", `Ticket ${sale.sequence} listo para facturar.`);
  };

  const convertProforma = (sale: Sale, target: DocumentType) => {
    if (sale.documentType !== "proforma" || sale.status !== "PROFORMA") {
      Alert.alert("Proforma no disponible", "Solo se pueden convertir proformas activas.");
      return;
    }

    setEditingSaleId("");
    setSourceTicketId("");
    setSourceProformaId(sale.id);
    setDocumentType(target);
    setClientId(sale.clientId);
    loadPaymentTerms(sale);
    setItems(sale.items.map((item) => ({ ...item })));
    setAdditionalInfo((sale.additionalInfo || []).map((field) => ({ ...field })));
    setIssueNotice(target === "factura" ? `Facturando proforma ${sale.sequence}. Se usara el siguiente numero disponible.` : `Convirtiendo proforma ${sale.sequence} a ticket interno.`);
    setNotice("");
    showMessage("Proforma cargada", target === "factura" ? `Proforma ${sale.sequence} lista para facturar.` : `Proforma ${sale.sequence} lista para convertir a ticket.`);
  };

  const cancelEdit = () => {
    setEditingSaleId("");
    setSourceTicketId("");
    setSourceProformaId("");
    setItems([]);
    setAdditionalInfo([]);
    setIssueNotice("");
    setPaymentMethod("01");
    setSalePayments([]);
    setPaymentCondition("contado");
    setCreditDueDate("");
    setDocumentType("factura");
    showMessage("Accion cancelada", "Se limpio el formulario y no se guardaron cambios.");
  };

  const executeVoidSale = async (sale: Sale) => {
    if (sale.status === "AUTORIZADA") {
      Alert.alert("No se puede anular aqui", "Una factura autorizada requiere otro proceso. Use nota de credito o el flujo que corresponda.");
      return;
    }
    if (sale.status === "ANULADA" || sale.status === "CONVERTIDA") {
      Alert.alert("Documento cerrado", sale.status === "CONVERTIDA" ? "Este documento ya fue convertido y queda solo como historial." : "Esta factura ya esta anulada localmente.");
      return;
    }

    const voidedAt = new Date().toISOString();
    const defaultReason = isInvoiceSale(sale) ? "Anulada localmente antes de autorizacion" : sale.documentType === "proforma" ? "Proforma anulada localmente" : isCreditNoteSale(sale) ? "Nota de credito anulada localmente" : "Nota de venta anulada localmente";
    const reason = getLocalVoidReason(defaultReason);
    if (!reason) return;
    const saleId = sale.id;
    try {
      let changed = false;
      let restoredStock = false;
      await persistMutation((current) => {
        const currentSale = current.sales.find((item) => item.id === saleId);
        if (!currentSale || currentSale.status === "ANULADA" || currentSale.status === "CONVERTIDA") return current;
        if (currentSale.status === "AUTORIZADA") throw new Error("Una factura autorizada no puede anularse localmente.");
        let products = current.products;
        let movements = current.inventoryMovements || [];
        let voidedSale = currentSale;
        const sourceSale = currentSale.sourceSaleId ? current.sales.find((item) => item.id === currentSale.sourceSaleId) : undefined;
        const ticketDerived = isInvoiceSale(currentSale) && sourceSale?.documentType === "nota_venta";
        const inventoryAffectingDocument = isInvoiceSale(currentSale) || currentSale.documentType === "nota_venta";
        if (inventoryAffectingDocument && !ticketDerived) {
          const inventoryState = resolveSaleInventoryState(currentSale);
          if (inventoryState === "UNKNOWN") throw inventoryConsistencyError(currentSale);
          if (inventoryState === "APPLIED") {
            const reversed = reverseSaleInventoryOnce({ products, movements, sale: currentSale, operationId: currentSale.inventoryOperationId || currentSale.id, userId: user.id, createdAt: voidedAt, reason });
            products = reversed.products;
            movements = reversed.movements;
            voidedSale = reversed.sale;
            restoredStock = reversed.changed;
          }
        }
        const updatedSale: Sale = { ...voidedSale, status: "ANULADA", voidReason: reason, voidedAt, sriMessage: voidedSale.sriMessage || reason };
        changed = true;
        return appendAudit({ ...current, products, inventoryMovements: movements, sales: current.sales.map((item) => item.id === saleId ? updatedSale : item) }, user, "DOCUMENT_VOIDED", "sale", saleId, `Documento anulado: ${documentTypeLabel(currentSale)} ${currentSale.sequence}`, { reason, restoredStock });
      });
      if (!changed) {
        Alert.alert("Documento cerrado", "El documento ya fue anulado o convertido.");
        return;
      }
      const message = restoredStock ? "Documento anulado localmente y stock devuelto." : "Documento anulado localmente.";
      setNotice(message);
      Alert.alert("Documento anulado", message);
    } catch (error) {
      const message = error instanceof SaleInventoryError
        ? "El inventario del documento requiere reconciliacion antes de anularlo."
        : error instanceof Error ? error.message : "No se pudo anular el documento.";
      setNotice(message);
      Alert.alert("No se pudo anular", message);
    }
  };

  const voidSale = (sale: Sale) => {
    if (sale.status === "AUTORIZADA" || sale.status === "ANULADA" || sale.status === "CONVERTIDA") {
      void executeVoidSale(sale);
      return;
    }
    confirmAction(
      "Anular documento",
      `Se anulara localmente ${documentTypeLabel(sale)} ${sale.sequence}. Esta accion quedara auditada y no se debe usar para facturas autorizadas.`,
      () => { void executeVoidSale(sale); },
      "Anular"
    );
  };

  return {
    cancelEdit,
    convertProforma,
    editSale,
    invoiceFromTicket,
    retrySale,
    voidSale
  };
}
