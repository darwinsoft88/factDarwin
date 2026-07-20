import React from "react";
import { Alert } from "react-native";
import { authorizeInvoice } from "../services/backend";
import { buildCreditNoteXml, buildInvoiceXml } from "../sri";
import { AdditionalInfoField, AppData, Client, DocumentType, InventoryMovement, PaymentCondition, PaymentMethod, Sale, SaleItem, SalePaymentSplit, User } from "../types";
import { appendAudit } from "../utils/audit";
import { expireStaleSriPendingDocuments } from "../utils/autoRetrySriDocuments";
import { getRetryInfo, MAX_DAILY_RETRIES, resolveInvoiceStatus } from "../utils/documents";
import { confirmAction, getLocalVoidReason, showMessage } from "../utils/dialogs";
import { issuerForSale } from "../utils/establishments";
import { generateId } from "../utils/id";
import { isSriRejected, isTicketOffline } from "../utils/invoiceStatus";
import { canEditSale, documentTypeLabel, isCreditNoteSale, isInvoiceSale, saleNeedsStockDiscount, saleStatusReducesStock } from "../utils/sales";
import { explainSriResult, sriUserMessage } from "../utils/sriMessages";
import { isStaleSriPendingDocument, staleSriPendingMessage } from "../utils/sriRetryPolicy";
import { isInventoryProduct } from "../utils/catalogItems";

const uid = generateId;

type UseSaleDocumentWorkflowActionsParams = {
  backendToken: string;
  data: AppData;
  persist: (data: AppData) => Promise<void>;
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
  persist,
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
    if (sale.status === "ANULADA") {
      Alert.alert("Documento anulado", "Este documento ya fue anulado localmente y no se puede reintentar.");
      return;
    }
    if (isStaleSriPendingDocument(sale)) {
      const message = staleSriPendingMessage(sale);
      const expiredResult = expireStaleSriPendingDocuments(data, user);
      await persist(expiredResult.data);
      setNotice(message);
      Alert.alert("Fuera del dia permitido", `${message}\n\nPor norma operativa, emita un nuevo comprobante con fecha actual.`);
      return;
    }
    const retryInfo = getRetryInfo(sale);
    if (retryInfo.today >= MAX_DAILY_RETRIES) {
      const message = `Esta factura ya tiene ${retryInfo.today} reintento(s) hoy. Revise el detalle del documento antes de volver a intentar manana.`;
      setNotice(message);
      Alert.alert("Limite diario de reintentos", message);
      return;
    }
    setRetryingSaleId(sale.id);
    setProcessingMessage(`Reintentando ${documentTypeLabel(sale).toLowerCase()}...`);
    const saleIssuer = issuerForSale(data.issuer, sale);
    const unsignedXml = isCreditNoteSale(sale) ? buildCreditNoteXml(sale, client, saleIssuer) : buildInvoiceXml(sale, client, saleIssuer);
    const retryAt = new Date().toISOString();

    try {
      const sriResult = await authorizeInvoice(data.backendUrl, unsignedXml, backendToken);
      const updatedSale: Sale = {
        ...sale,
        accessKey: sriResult.accessKey || sale.accessKey,
        authorizationNumber: sriResult.authorizationNumber,
        authorizationDate: sriResult.authorizationDate,
        sriEnvironment: sriResult.sriEnvironment,
        sriMessage: sriResult.sriMessage,
        signedXml: sriResult.signedXml,
        authorizedXml: sriResult.authorizedXml,
        status: resolveInvoiceStatus(sriResult),
        retryHistory: [...(sale.retryHistory || []), retryAt]
      };
      const stockMovements: InventoryMovement[] = [];
      const sourceSale = sale.sourceSaleId ? data.sales.find((item) => item.id === sale.sourceSaleId) : undefined;
      const sourceTicketAlreadyDiscountedStock = sourceSale?.documentType === "nota_venta" && isTicketOffline(sourceSale.status);
      const shouldDiscountStock = isInvoiceSale(sale) && !sourceTicketAlreadyDiscountedStock && saleNeedsStockDiscount(sale.status) && !isSriRejected(updatedSale.status) && updatedSale.status !== "ANULADA";
      const shouldRestoreCreditStock = isCreditNoteSale(sale) && sale.status !== "AUTORIZADA" && updatedSale.status === "AUTORIZADA";
      const stockSourceSale = shouldRestoreCreditStock ? data.sales.find((item) => item.id === sale.sourceSaleId) : undefined;
      const nextProducts = shouldDiscountStock
        ? data.products.map((product) => {
            if (!isInventoryProduct(product)) return product;
            const soldQuantity = sale.items.filter((item) => isInventoryProduct(item) && item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
            if (soldQuantity <= 0) return product;
            const stockAfter = product.stock - soldQuantity;
            stockMovements.push({
              id: uid(),
              productId: product.id,
              productName: product.name,
              type: "salida",
              quantity: soldQuantity,
              stockBefore: product.stock,
              stockAfter,
              reason: "Reenvio autorizado",
              reference: sale.sequence,
              userId: user.id,
              createdAt: retryAt
            });
            return { ...product, stock: stockAfter, updatedAt: retryAt };
          })
        : shouldRestoreCreditStock
          ? data.products.map((product) => {
              if (!isInventoryProduct(product)) return product;
              const returnedQuantity = sale.items.filter((item) => isInventoryProduct(item) && item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
              if (returnedQuantity <= 0) return product;
              const stockAfter = product.stock + returnedQuantity;
              stockMovements.push({
                id: uid(),
                productId: product.id,
                productName: product.name,
                type: "entrada",
                quantity: returnedQuantity,
                stockBefore: product.stock,
                stockAfter,
                reason: `Reenvio nota de credito ${sale.sequence}`,
                reference: stockSourceSale?.sequence || sale.sequence,
                userId: user.id,
                createdAt: retryAt
              });
              return { ...product, stock: stockAfter, updatedAt: retryAt };
            })
          : data.products;

      const convertedAt = new Date().toISOString();
      await persist(appendAudit({
        ...data,
        products: nextProducts,
        inventoryMovements: [...stockMovements, ...(data.inventoryMovements || [])],
        sales: data.sales.map((item) => {
          if (item.id === sale.id) return updatedSale;
          if (updatedSale.status === "AUTORIZADA" && sourceSale && item.id === sourceSale.id && (isTicketOffline(item.status) || item.status === "PROFORMA")) {
            return {
              ...item,
              status: "CONVERTIDA" as const,
              voidReason: `Convertida a factura ${updatedSale.sequence}`,
              voidedAt: convertedAt,
              convertedAt,
              convertedToSaleId: updatedSale.id,
              convertedToSequence: updatedSale.sequence,
              sriMessage: `Convertida a factura ${updatedSale.sequence}`
            };
          }
          return item;
        })
      }, user, isCreditNoteSale(sale) ? "CREDIT_NOTE_RETRIED" : "INVOICE_RETRIED", "sale", sale.id, `Reenvio de ${documentTypeLabel(sale)} ${sale.sequence}: ${updatedSale.status}`, { status: updatedSale.status, accessKey: updatedSale.accessKey }));
      Alert.alert(explainSriResult(sriResult).title, updatedSale.status === "AUTORIZADA" ? `${documentTypeLabel(sale)} autorizada.` : sriUserMessage(sriResult));
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo reintentar el documento.";
      await persist(appendAudit({
        ...data,
        sales: data.sales.map((item) => (item.id === sale.id ? { ...item, status: "ERROR_SRI", sriMessage: message, retryHistory: [...(sale.retryHistory || []), retryAt] } : item))
      }, user, isCreditNoteSale(sale) ? "CREDIT_NOTE_RETRY_FAILED" : "INVOICE_RETRY_FAILED", "sale", sale.id, `Reenvio fallido de ${documentTypeLabel(sale)} ${sale.sequence}`, { error: message }));
      Alert.alert("No se pudo reintentar", message);
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
    const restoreStock = saleStatusReducesStock(sale.status);
    const stockMovements: InventoryMovement[] = [];
    const nextProducts = restoreStock
      ? data.products.map((product) => {
          if (!isInventoryProduct(product)) return product;
          const soldQuantity = sale.items.filter((item) => isInventoryProduct(item) && item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
          if (soldQuantity <= 0) return product;
          const stockAfter = product.stock + soldQuantity;
          stockMovements.push({
            id: uid(),
            productId: product.id,
            productName: product.name,
            type: "entrada",
            quantity: soldQuantity,
            stockBefore: product.stock,
            stockAfter,
            reason,
            reference: sale.sequence,
            userId: user.id,
            createdAt: voidedAt
          });
          return { ...product, stock: stockAfter, updatedAt: voidedAt };
        })
      : data.products;

    await persist(appendAudit({
      ...data,
      products: nextProducts,
      inventoryMovements: [...stockMovements, ...(data.inventoryMovements || [])],
      sales: data.sales.map((item) =>
        item.id === sale.id
          ? {
              ...item,
              status: "ANULADA",
              voidReason: reason,
              voidedAt,
              sriMessage: item.sriMessage || reason
            }
          : item
      )
    }, user, "DOCUMENT_VOIDED", "sale", sale.id, `Documento anulado: ${documentTypeLabel(sale)} ${sale.sequence}`, { reason, restoredStock: restoreStock }));
    const message = restoreStock ? "Documento anulado localmente y stock devuelto." : "Documento anulado localmente.";
    setNotice(message);
    Alert.alert("Documento anulado", message);
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
