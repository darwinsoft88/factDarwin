import React from "react";
import { Alert } from "react-native";
import type { PersistMutation } from "./useSyncAndBackup";
import { authorizeInvoice } from "../services/backend";
import { buildCreditNoteXml, buildInvoiceXml } from "../sri";
import { AdditionalInfoField, AppData, Client, DocumentType, PaymentCondition, PaymentMethod, Sale, SaleItem, SalePaymentSplit, User } from "../types";
import { appendAudit } from "../utils/audit";
import { expireStaleSriPendingDocuments } from "../utils/autoRetrySriDocuments";
import { getRetryInfo, MAX_DAILY_RETRIES, resolveInvoiceStatus } from "../utils/documents";
import { issuerForSale } from "../utils/establishments";
import { acquireSaleRetryLock, applySriRetryInventoryOutcome, reapplyAuthorizedSaleInventoryOnce, reverseSaleInventoryOnce, SaleInventoryError } from "../utils/inventory";
import { isTicketOffline } from "../utils/invoiceStatus";
import { canEditSale, documentTypeLabel, isCreditNoteSale, isInvoiceSale, resolveSaleInventoryState } from "../utils/sales";
import { explainSriResult, sriUserMessage } from "../utils/sriMessages";
import { isDocumentCorrectionIssue, isStaleSriPendingDocument, isTransientSriIssue, staleSriPendingMessage } from "../utils/sriRetryPolicy";
import { syncSalePatchToBackend } from "../utils/sync";
import {
  confirmAction,
  getLocalVoidReason,
  showMessage,
  showError,
  showInfo,
  showSuccess,
  showWarning,
} from "../utils/dialogs";

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
  const retryRunningSaleIdsRef = React.useRef(new Set<string>());

  const loadPaymentTerms = (sale: Sale) => {
    setPaymentMethod(sale.paymentMethod || "01");
    setSalePayments(sale.payments || []);
    setPaymentCondition(sale.paymentCondition || (sale.creditBalance && sale.creditBalance > 0 ? "credito" : "contado"));
    setCreditDueDate(sale.creditDueDate || "");
  };

  const retrySale = async (sale: Sale, client: Client) => {
    if (!isInvoiceSale(sale) && !isCreditNoteSale(sale)) {
      showInfo("Documento interno", "Este documento no se envia al SRI.");
      return;
    }
    const saleId = sale.id;
    const releaseRetryLock = acquireSaleRetryLock(retryRunningSaleIdsRef.current, saleId);
    if (!releaseRetryLock) return;

    try {
    if (sale.status === "AUTORIZADA" && resolveSaleInventoryState(sale) === "RECONCILIATION_PENDING") {
      setRetryingSaleId(saleId);
      setProcessingMessage("Reconciliando inventario...");
      try {
        const reconciliationAt = new Date().toISOString();
        const persisted = await persistMutation((current) => {
          const currentSale = current.sales.find((item) => item.id === saleId);
          if (!currentSale || currentSale.status !== "AUTORIZADA" || resolveSaleInventoryState(currentSale) !== "RECONCILIATION_PENDING") return current;
          const reconciled = reapplyAuthorizedSaleInventoryOnce({
            products: current.products,
            movements: current.inventoryMovements || [],
            sale: currentSale,
            userId: user.id,
            createdAt: reconciliationAt,
            reason: "Reaplicacion segura despues de autorizacion SRI"
          });
          return appendAudit(
            {
              ...current,
              products: reconciled.products,
              inventoryMovements: reconciled.movements,
              sales: current.sales.map((item) => item.id === saleId ? reconciled.sale : item)
            },
            user,
            "INVOICE_INVENTORY_RECONCILED",
            "sale",
            saleId,
            `Inventario reconciliado para factura autorizada ${currentSale.sequence}`,
            { inventoryOperationId: reconciled.sale.inventoryOperationId }
          );
        });

        const reconciledSale = persisted.sales.find((item) => item.id === saleId);
        if (!reconciledSale || resolveSaleInventoryState(reconciledSale) !== "APPLIED") {
          showWarning("Reconciliacion pendiente", "El inventario no pudo confirmarse como aplicado.");
          return;
        }

        const reconciliationMovements = (persisted.inventoryMovements || []).filter(
          (movement) => movement.saleId === saleId && movement.createdAt === reconciliationAt
        );
        const changedProductIds = new Set(reconciliationMovements.map((movement) => movement.productId));

        const synced = await syncSalePatchToBackend(data.backendUrl, backendToken, {
          baseData: persisted,
          sales: [reconciledSale],
          products: persisted.products.filter((product) => changedProductIds.has(product.id)),
          inventoryMovements: reconciliationMovements,
          auditLogs: persisted.auditLogs.slice(0, 1)
        }, { persistMutation });

        if (!synced) {
          showWarning(
            "Inventario reconciliado localmente",
            "El inventario se actualizo en este dispositivo, pero la sincronizacion con el servidor quedo pendiente."
          );
          return;
        }

        showSuccess(
          "Inventario reconciliado",
          "La factura ya estaba autorizada y el inventario se actualizo y sincronizo correctamente."
        );
      } catch (error) {
        showError("Reconciliacion pendiente", error instanceof Error ? error.message : "No se pudo actualizar el inventario de la factura autorizada.");
      } finally {
        setRetryingSaleId("");
        setProcessingMessage("");
      }
      return;
    }
    if (isClosedSale(sale)) {
      showWarning("Documento cerrado", "Este documento ya no se puede reintentar.");
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
      showWarning("Limite diario de reintentos", message);
      return;
    }
    const clientId = client.id;
    const requestFingerprint = retryFingerprint(sale);
    const sourceSale = sale.sourceSaleId ? data.sales.find((item) => item.id === sale.sourceSaleId) : undefined;
    const ticketDerived = isInvoiceSale(sale) && sourceSale?.documentType === "nota_venta";
    if (isInvoiceSale(sale)) {
      const inventoryState = resolveSaleInventoryState(sale);
      const sourceInventoryState = sourceSale ? resolveSaleInventoryState(sourceSale) : undefined;
      if (
        (ticketDerived && (inventoryState !== "NOT_APPLIED" || sourceInventoryState !== "APPLIED")) ||
        (!ticketDerived && inventoryState !== "APPLIED" && inventoryState !== "REVERSED")
      ) {
        showWarning("Reconciliacion requerida", "El inventario del documento no es consistente para reintentar la emision.");
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
        showError("No se pudo reintentar", message);
      } finally {
        setRetryingSaleId("");
        setProcessingMessage("");
      }
      return;
    }

    try {
      let applied = false;
      let persistedSale: Sale | undefined;
      const persisted = await persistMutation((current) => {
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
          if (inventoryState === "REVERSED") {
            const retryInventory = applySriRetryInventoryOutcome({
              products,
              movements,
              previousSale: currentSale,
              resultSale: updatedSale,
              userId: user.id,
              createdAt: retryAt
            });
            products = retryInventory.products;
            movements = retryInventory.movements;
            updatedSale = retryInventory.sale;
          } else if (updatedSale.status === "AUTORIZADA" || !isDefinitiveFailure(updatedSale)) {
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
        showInfo("Documento actualizado", "El documento cambio durante el reintento y la respuesta no se aplico sobre datos obsoletos.");
        return;
      }
      const durableSale = persistedSale as Sale;
      const retryMovements = (persisted.inventoryMovements || []).filter((movement) => movement.saleId === saleId && movement.createdAt === retryAt);
      const changedProductIds = new Set(retryMovements.map((movement) => movement.productId));
      const synced = await syncSalePatchToBackend(data.backendUrl, backendToken, {
        baseData: persisted,
        sales: persisted.sales.filter((item) => item.id === saleId || item.id === durableSale.sourceSaleId),
        products: persisted.products.filter((product) => changedProductIds.has(product.id)),
        inventoryMovements: retryMovements,
        auditLogs: persisted.auditLogs.slice(0, 1)
      }, { persistMutation });
      if (!synced) {
        return;
      }
      const title = explainSriResult(sriResult).title;
      const message = durableSale.status === "AUTORIZADA"
        ? `${documentTypeLabel(durableSale)} autorizada.`
        : sriUserMessage(sriResult);

      if (durableSale.status === "AUTORIZADA" && resolveSaleInventoryState(durableSale) === "RECONCILIATION_PENDING") {
        showError("Factura autorizada; inventario pendiente", "El SRI autorizo la factura, pero el inventario requiere reconciliacion. Use Reconciliar inventario para recuperarlo sin reenviar al SRI.");
      } else if (durableSale.status === "AUTORIZADA") {
        showSuccess(title, message);
      } else if (durableSale.status === "PENDIENTE_SRI") {
        showWarning(title, message);
      } else {
        showError(title, message);
      }
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "";
      const normalizedMessage = rawMessage.toLowerCase();
      const storageQuotaExceeded =
        (error instanceof Error && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")) ||
        normalizedMessage.includes("quota") ||
        normalizedMessage.includes("exceeded");
      const message = error instanceof SaleInventoryError
        ? "El inventario del documento requiere reconciliacion antes de aplicar la respuesta SRI."
        : storageQuotaExceeded
          ? "El almacenamiento local está lleno. Sincronice la información y libere espacio antes de intentarlo nuevamente."
          : rawMessage || "No se pudo guardar el resultado del SRI.";
      showError("No se pudo aplicar el resultado", message);
    } finally {
      setRetryingSaleId("");
      setProcessingMessage("");
    }
    } finally {
      releaseRetryLock();
    }
  };

  const editSale = (sale: Sale) => {
    if (!canEditSale(sale)) {
      showWarning("Factura no editable", "Solo se pueden editar facturas no autorizadas y no anuladas.");
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

      const persisted = await persistMutation((current) => {
        const currentSale = current.sales.find((item) => item.id === saleId);

        if (!currentSale || currentSale.status === "ANULADA" || currentSale.status === "CONVERTIDA") {
          return current;
        }

        if (currentSale.status === "AUTORIZADA") {
          throw new Error("Una factura autorizada no puede anularse localmente.");
        }

        let products = current.products;
        let movements = current.inventoryMovements || [];
        let voidedSale = currentSale;

        const sourceSale = currentSale.sourceSaleId
          ? current.sales.find((item) => item.id === currentSale.sourceSaleId)
          : undefined;

        const ticketDerived =
          isInvoiceSale(currentSale) &&
          sourceSale?.documentType === "nota_venta";

        const inventoryAffectingDocument =
          isInvoiceSale(currentSale) ||
          currentSale.documentType === "nota_venta";

        if (inventoryAffectingDocument && !ticketDerived) {
          const inventoryState = resolveSaleInventoryState(currentSale);

          if (inventoryState === "UNKNOWN") {
            throw inventoryConsistencyError(currentSale);
          }

          if (inventoryState === "APPLIED") {
            const reversed = reverseSaleInventoryOnce({
              products,
              movements,
              sale: currentSale,
              operationId: currentSale.inventoryOperationId || currentSale.id,
              userId: user.id,
              createdAt: voidedAt,
              reason
            });

            products = reversed.products;
            movements = reversed.movements;
            voidedSale = reversed.sale;
            restoredStock = reversed.changed;
          }
        }

        const updatedSale: Sale = {
          ...voidedSale,
          status: "ANULADA",
          voidReason: reason,
          voidedAt,
          sriMessage: voidedSale.sriMessage || reason
        };

        changed = true;

        return appendAudit(
          {
            ...current,
            products,
            inventoryMovements: movements,
            sales: current.sales.map((item) =>
              item.id === saleId ? updatedSale : item
            )
          },
          user,
          "DOCUMENT_VOIDED",
          "sale",
          saleId,
          `Documento anulado: ${documentTypeLabel(currentSale)} ${currentSale.sequence}`,
          { reason, restoredStock }
        );
      });

      if (!changed) {
        Alert.alert("Documento cerrado", "El documento ya fue anulado o convertido.");
        return;
      }

      const durableSale = persisted.sales.find((item) => item.id === saleId);

      if (!durableSale || durableSale.status !== "ANULADA") {
        showWarning("Anulacion pendiente", "No se pudo confirmar localmente el estado anulado.");
        return;
      }

      const voidMovements = (persisted.inventoryMovements || []).filter(
        (movement) =>
          movement.saleId === saleId &&
          movement.createdAt === voidedAt
      );

      const changedProductIds = new Set(
        voidMovements.map((movement) => movement.productId)
      );

      const synced = await syncSalePatchToBackend(
        data.backendUrl,
        backendToken,
        {
          baseData: persisted,
          sales: [durableSale],
          products: persisted.products.filter((product) =>
            changedProductIds.has(product.id)
          ),
          inventoryMovements: voidMovements,
          auditLogs: persisted.auditLogs.slice(0, 1)
        },
        { persistMutation }
      );

      if (!synced) {
        const pendingMessage = restoredStock
          ? "Documento anulado y stock devuelto localmente, pero la sincronizacion con el servidor quedo pendiente."
          : "Documento anulado localmente, pero la sincronizacion con el servidor quedo pendiente.";

        setNotice(pendingMessage);
        showWarning("Anulacion pendiente de sincronizar", pendingMessage);
        return;
      }

      const message = restoredStock
        ? "Documento anulado y stock devuelto correctamente."
        : "Documento anulado y sincronizado correctamente.";

      setNotice(message);
      Alert.alert("Documento anulado", message);
    } catch (error) {
      const message = error instanceof SaleInventoryError
        ? "El inventario del documento requiere reconciliacion antes de anularlo."
        : error instanceof Error
          ? error.message
          : "No se pudo anular el documento.";

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
