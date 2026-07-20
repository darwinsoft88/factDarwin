import type React from "react";
import { useRef } from "react";
import { Alert } from "react-native";
import { authorizeInvoice, reserveDocumentSequence } from "../services/backend";
import { buildInvoiceXml, createAccessKey, nextSequence } from "../sri";
import { AdditionalInfoField, AppData, Client, DocumentType, InventoryMovement, PaymentCondition, PaymentMethod, Sale, SaleItem, SalePaymentSplit, User } from "../types";
import { appendAudit } from "../utils/audit";
import { isInventoryProduct } from "../utils/catalogItems";
import { getRetryInfo, isAccessKeyUsed, MAX_DAILY_RETRIES, resolveInvoiceStatus } from "../utils/documents";
import { showMessage } from "../utils/dialogs";
import { activeEstablishment, activeIssuer, normalizedEstablishments, updateIssuerEstablishmentSequence } from "../utils/establishments";
import { generateId } from "../utils/id";
import { buildStockCredits, buildStockMovements, restoreSaleStock } from "../utils/inventory";
import { isSriRejected } from "../utils/invoiceStatus";
import { findPotentialDuplicatePendingInvoice, nextInternalSequence, nextProformaSequence, saleStatusReducesStock } from "../utils/sales";
import { normalizePartialSalePayments, normalizeSalePayments, salePaymentBalance } from "../utils/salePayments";
import { sriUserMessage, userFriendlyActionError } from "../utils/sriMessages";
import { statusForAuthorizationFailure } from "../utils/sriRetryPolicy";
import { syncSalePatchToBackend } from "../utils/sync";
import { normalizeClientForInvoice, validateBeforeInternalSale, validateBeforeIssue, validateBeforeProforma, validateEmissionPointLicense } from "../validation";

const uid = generateId;

type SaleTotals = {
  subtotal: number;
  tax: number;
  total: number;
};

type UseSaleIssueFlowParams = {
  backendToken: string;
  clientId: string;
  data: AppData;
  documentType: DocumentType;
  editingSale?: Sale;
  items: SaleItem[];
  additionalInfo: AdditionalInfoField[];
  paymentMethod: PaymentMethod;
  salePayments: SalePaymentSplit[];
  paymentCondition: PaymentCondition;
  creditDueDate: string;
  persist: (data: AppData) => Promise<void>;
  selectedClient?: Client;
  sourceProforma?: Sale;
  sourceTicket?: Sale;
  totals: SaleTotals;
  user: User;
  resetSaleInputs?: () => void;
  setDocumentType: React.Dispatch<React.SetStateAction<DocumentType>>;
  setEditingSaleId: React.Dispatch<React.SetStateAction<string>>;
  setIssueNotice: React.Dispatch<React.SetStateAction<string>>;
  setIssuing: React.Dispatch<React.SetStateAction<boolean>>;
  setItems: React.Dispatch<React.SetStateAction<SaleItem[]>>;
  setAdditionalInfo: React.Dispatch<React.SetStateAction<AdditionalInfoField[]>>;
  setProcessingMessage: React.Dispatch<React.SetStateAction<string>>;
  setSourceProformaId: React.Dispatch<React.SetStateAction<string>>;
  setSourceTicketId: React.Dispatch<React.SetStateAction<string>>;
};

export function useSaleIssueFlow({
  backendToken,
  clientId,
  data,
  documentType,
  editingSale,
  items,
  additionalInfo,
  paymentMethod,
  salePayments,
  paymentCondition,
  creditDueDate,
  persist,
  selectedClient,
  resetSaleInputs,
  setDocumentType,
  setEditingSaleId,
  setIssueNotice,
  setIssuing,
  setItems,
  setAdditionalInfo,
  setProcessingMessage,
  setSourceProformaId,
  setSourceTicketId,
  sourceProforma,
  sourceTicket,
  totals,
  user
}: UseSaleIssueFlowParams) {
  const issueRunningRef = useRef(false);

  const resetCurrentDocumentForm = () => {
    setItems([]);
    setEditingSaleId("");
    setSourceTicketId("");
    setSourceProformaId("");
    setDocumentType("factura");
    setAdditionalInfo([]);
    resetSaleInputs?.();
  };

  const paymentFallbackMethod: PaymentMethod = paymentCondition === "credito" ? "20" : paymentMethod;
  const partialCreditPayments = paymentCondition === "credito" ? normalizePartialSalePayments(salePayments, paymentMethod) : [];
  const resolvedPayments = paymentCondition === "credito" ? partialCreditPayments : normalizeSalePayments(salePayments, paymentFallbackMethod, totals.total);
  const resolvedPaymentMethod: PaymentMethod = paymentCondition === "credito" ? "20" : resolvedPayments?.[0]?.paymentMethod || paymentFallbackMethod;
  const remainingCreditBalance = paymentCondition === "credito" ? Math.max(0, salePaymentBalance(totals.total, partialCreditPayments)) : 0;
  const creditFields = paymentCondition === "credito"
    ? {
        paymentCondition,
        creditDueDate: creditDueDate.trim(),
        creditBalance: remainingCreditBalance,
        creditStatus: remainingCreditBalance > 0 ? "pendiente" as const : "pagado" as const
      }
    : {
        paymentCondition,
        creditBalance: 0,
        creditStatus: "pagado" as const
      };

  const saveInternalSaleFromCurrentForm = async (options?: { alreadyRunning?: boolean; offlineFallback?: boolean }) => {
    const ownsRun = !options?.alreadyRunning;
    if (ownsRun) {
      if (issueRunningRef.current) return;
      issueRunningRef.current = true;
      setIssuing(true);
    }
    setProcessingMessage(options?.offlineFallback ? "Guardando ticket offline..." : "Guardando nota de venta...");
    setIssueNotice(options?.offlineFallback ? "Guardando ticket offline..." : "Guardando nota de venta...");
    const createdAt = editingSale?.createdAt || new Date().toISOString();
    const savedAt = new Date().toISOString();
    const documentIssuer = activeIssuer(data);
    const documentEstablishment = activeEstablishment(data.issuer);
    const legacyScopeId = normalizedEstablishments(data.issuer)[0]?.id || documentEstablishment.id;
    const sequence = editingSale?.sequence || nextInternalSequence(data.sales, documentEstablishment.id, legacyScopeId);
    const sale: Sale = {
      id: editingSale?.id || uid(),
      documentType: "nota_venta",
      establishment: documentIssuer.establishment,
      emissionPoint: documentIssuer.emissionPoint,
      establishmentName: documentEstablishment.name,
      clientId,
      userId: editingSale?.userId || user.id,
      createdAt,
      sequence,
      accessKey: "",
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      paymentMethod: resolvedPaymentMethod,
      payments: resolvedPayments,
      ...creditFields,
      additionalInfo,
      status: "TICKET_OFFLINE",
      autoInvoiceOnSync: Boolean(options?.offlineFallback),
      sourceSaleId: sourceProforma?.id,
      items
    };
    const restoredProducts = editingSale && saleStatusReducesStock(editingSale.status) ? restoreSaleStock(data.products, editingSale) : data.products;
    const restoreMovements = editingSale && saleStatusReducesStock(editingSale.status) ? buildStockMovements(data.products, editingSale, "entrada", "Reverso por correccion de nota de venta", user.id, savedAt, uid) : [];
    const saleMovements: InventoryMovement[] = [];
    const saleStockChanges = new Map<string, number>();
    items.filter(isInventoryProduct).forEach((item) => {
      saleStockChanges.set(item.productId, (saleStockChanges.get(item.productId) || 0) + item.quantity);
    });
    const nextProducts = restoredProducts.map((product) => {
      if (!isInventoryProduct(product)) return product;
      const quantity = saleStockChanges.get(product.id) || 0;
      if (quantity <= 0) return product;
      const stockAfter = product.stock - quantity;
      saleMovements.push({
        id: uid(),
        productId: product.id,
        productName: product.name,
        type: "salida",
        quantity,
        stockBefore: product.stock,
        stockAfter,
        reason: options?.offlineFallback ? "Ticket guardado sin internet" : editingSale ? "Nota de venta corregida" : "Nota de venta interna",
        reference: sequence,
        userId: user.id,
        createdAt: savedAt
      });
      return { ...product, stock: stockAfter, updatedAt: createdAt };
    });

    const nextSales = editingSale
      ? data.sales.map((item) => (item.id === editingSale.id ? sale : item))
      : sourceProforma
        ? [sale, ...data.sales.map((item) => item.id === sourceProforma.id ? { ...item, status: "CONVERTIDA" as const, voidReason: `Convertida a ticket ${sale.sequence}`, voidedAt: savedAt, convertedAt: savedAt, convertedToSaleId: sale.id, convertedToSequence: sale.sequence, sriMessage: `Convertida a ticket ${sale.sequence}` } : item)]
        : [sale, ...data.sales];
    const nextData = appendAudit({
      ...data,
      products: nextProducts,
      inventoryMovements: [...restoreMovements, ...saleMovements, ...(data.inventoryMovements || [])],
      sales: nextSales
    }, user, editingSale ? "INTERNAL_SALE_UPDATED" : "INTERNAL_SALE_CREATED", "sale", sale.id, `${options?.offlineFallback ? "Ticket offline creado" : editingSale ? "Nota de venta actualizada" : "Nota de venta creada"}: ${sale.sequence}`, { total: sale.total });

    try {
      await persist(nextData);
      resetCurrentDocumentForm();
      const message = options?.offlineFallback
        ? "Se guardo como ticket interno. Cuando vuelva internet, la app intentara facturarlo automaticamente."
        : "La nota de venta se registro como movimiento interno.";
      setIssueNotice(message);
      showMessage(options?.offlineFallback ? "Venta guardada sin internet" : "Nota guardada", message);
      await syncSalePatchToBackend(data.backendUrl, backendToken, {
        baseData: data,
        sales: nextSales.filter((item) => [sale.id, sourceProforma?.id].filter(Boolean).includes(item.id)),
        products: nextProducts.filter((product) => saleStockChanges.has(product.id)),
        inventoryMovements: [...restoreMovements, ...saleMovements],
        auditLogs: nextData.auditLogs.slice(0, 1)
      }, nextData, persist);
    } finally {
      if (ownsRun) {
        issueRunningRef.current = false;
        setIssuing(false);
        setProcessingMessage("");
      }
    }
  };

  const issue = async () => {
    if (issueRunningRef.current) return;
    issueRunningRef.current = true;
    setIssuing(true);
    setIssueNotice("");
    setProcessingMessage("Procesando documento...");
    try {
      const client = selectedClient;
      if (!client || items.length === 0) {
        showMessage("Documento incompleto", "Seleccione cliente y agregue al menos un producto.");
        return;
      }
      const currentDocumentType = sourceTicket || sourceProforma ? documentType : editingSale?.documentType || documentType;
      const stockCredits = buildStockCredits(editingSale || sourceTicket);

      if (currentDocumentType === "proforma") {
        const validationErrors = validateBeforeProforma(data, items, totals);
        if (validationErrors.length > 0) {
          const message = validationErrors.map((error) => `- ${error}`).join("\n");
          setIssueNotice(message);
          showMessage("Revise antes de guardar", message);
          return;
        }
        setProcessingMessage("Guardando proforma...");
        setIssueNotice("Guardando proforma...");

      const createdAt = editingSale?.createdAt || new Date().toISOString();
      const documentIssuer = activeIssuer(data);
      const documentEstablishment = activeEstablishment(data.issuer);
      const legacyScopeId = normalizedEstablishments(data.issuer)[0]?.id || documentEstablishment.id;
      const sequence = editingSale?.sequence || nextProformaSequence(data.sales, documentEstablishment.id, legacyScopeId);
      const sale: Sale = {
        id: editingSale?.id || uid(),
        documentType: "proforma",
        establishment: documentIssuer.establishment,
        emissionPoint: documentIssuer.emissionPoint,
        establishmentName: documentEstablishment.name,
        clientId,
        userId: editingSale?.userId || user.id,
        createdAt,
        sequence,
        accessKey: "",
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        paymentMethod: resolvedPaymentMethod,
        payments: resolvedPayments,
        ...creditFields,
        additionalInfo,
        status: "PROFORMA",
        items
      };

      const nextSales = editingSale ? data.sales.map((item) => (item.id === editingSale.id ? sale : item)) : [sale, ...data.sales];
      const nextData = appendAudit({
        ...data,
        sales: nextSales
      }, user, editingSale ? "PROFORMA_UPDATED" : "PROFORMA_CREATED", "sale", sale.id, `${editingSale ? "Proforma actualizada" : "Proforma creada"}: ${sale.sequence}`, { total: sale.total });

      await persist(nextData);
      resetCurrentDocumentForm();
      setIssueNotice("Proforma guardada. Si no hay internet quedara pendiente de sincronizar.");
      showMessage("Proforma guardada", "La proforma quedo registrada como cotizacion.");
      await syncSalePatchToBackend(data.backendUrl, backendToken, {
        baseData: data,
        sales: [sale],
        auditLogs: nextData.auditLogs.slice(0, 1)
      }, nextData, persist);
      return;
      }

      if (currentDocumentType === "nota_venta") {
        const validationErrors = validateBeforeInternalSale(data, items, totals, stockCredits);
        if (validationErrors.length > 0) {
          const message = validationErrors.map((error) => `- ${error}`).join("\n");
          setIssueNotice(message);
          showMessage("Revise antes de guardar", message);
          return;
        }

        await saveInternalSaleFromCurrentForm({ alreadyRunning: true });
        return;
      }

    const invoiceClient = normalizeClientForInvoice(client);
    if (editingSale && getRetryInfo(editingSale).today >= MAX_DAILY_RETRIES) {
      const message = `Esta factura ya tiene ${MAX_DAILY_RETRIES} reintento(s) hoy. Corrija y vuelva a intentar manana.`;
      setIssueNotice(message);
      showMessage("Limite diario de reintentos", message);
      return;
    }

    const documentIssuer = activeIssuer(data);
    const documentEstablishment = activeEstablishment(data.issuer);
    const dataForDocument = { ...data, issuer: documentIssuer };
    const validationErrors = validateBeforeIssue(dataForDocument, invoiceClient, items, totals, stockCredits);
    validateEmissionPointLicense(data, documentIssuer, validationErrors);
    if (validationErrors.length > 0) {
      const message = validationErrors.map((error) => `- ${error}`).join("\n");
      setIssueNotice(message);
      showMessage("Revise antes de emitir", message);
      return;
    }
    const createdAt = editingSale?.createdAt || new Date().toISOString();
    const duplicatePending = !editingSale ? findPotentialDuplicatePendingInvoice(data.sales, {
      id: "draft",
      clientId,
      createdAt,
      establishment: documentIssuer.establishment,
      emissionPoint: documentIssuer.emissionPoint,
      paymentMethod: resolvedPaymentMethod,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      items,
      sourceSaleId: sourceTicket?.id || sourceProforma?.id
    }) : undefined;
    if (duplicatePending) {
      const message = `Ya existe una factura pendiente muy parecida: ${duplicatePending.sequence}. Use Reintentar en esa factura antes de emitir otra para evitar duplicados.`;
      setIssueNotice(message);
      Alert.alert("Factura pendiente similar", message);
      return;
    }
    let sequence = editingSale?.sequence || nextSequence(documentIssuer.sequential);
    let accessKey = editingSale?.accessKey || createAccessKey(new Date(createdAt), documentIssuer, sequence);
    let reservedByBackend = false;
    if (!editingSale) {
      try {
        setProcessingMessage("Preparando numero de factura...");
        const reserved = await reserveDocumentSequence(data.backendUrl, { documentType: "factura", issuer: documentIssuer, createdAt }, backendToken);
        if (Number(reserved.sequence) < Number(sequence)) {
          throw new Error(`El servidor devolvio el secuencial ${reserved.sequence}, menor al configurado ${sequence}. Guarde SRI y sincronice antes de emitir.`);
        }
        sequence = reserved.sequence || sequence;
        accessKey = reserved.accessKey || accessKey;
        reservedByBackend = true;
      } catch (error) {
        const message = userFriendlyActionError(error, "reserve-sequence");
        setIssueNotice(message);
        Alert.alert("Factura electronica requiere internet", `${message}\n\nPara emitir una factura electronica debe tener conexion a internet. Puede guardar esta venta como ticket interno y facturarla cuando vuelva la conexion.`, [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Guardar ticket",
            onPress: () => {
              void saveInternalSaleFromCurrentForm({ offlineFallback: true });
            }
          }
        ]);
        setProcessingMessage("");
        return;
      }
    }
    const retryAt = new Date().toISOString();
    const sale: Sale = {
      id: editingSale?.id || uid(),
      documentType: "factura",
      establishment: documentIssuer.establishment,
      emissionPoint: documentIssuer.emissionPoint,
      establishmentName: documentEstablishment.name,
      clientId,
      userId: editingSale?.userId || user.id,
      createdAt,
      sequence,
      accessKey,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      paymentMethod: resolvedPaymentMethod,
      payments: resolvedPayments,
      ...creditFields,
      additionalInfo,
      status: "PENDIENTE_SRI" as const,
      items,
      sourceSaleId: sourceTicket?.id || sourceProforma?.id || editingSale?.sourceSaleId,
      retryHistory: editingSale ? [...(editingSale.retryHistory || []), retryAt] : undefined
    };
    const saleForRetry: Sale = { ...sale, paymentMethod: sale.paymentMethod || "01", payments: sale.payments || resolvedPayments };
    if (!editingSale && isAccessKeyUsed(data, saleForRetry.accessKey)) {
      const message = `La clave de acceso ${saleForRetry.accessKey} ya existe en otro comprobante. Revise el secuencial antes de emitir.`;
      setIssueNotice(message);
      showMessage("Clave duplicada", message);
      return;
    }
    const unsignedXml = buildInvoiceXml(saleForRetry, invoiceClient, documentIssuer);
    setIssuing(true);
    setProcessingMessage(sourceTicket ? "Emitiendo factura desde ticket..." : sourceProforma ? "Emitiendo factura desde proforma..." : editingSale ? "Guardando correccion y reintentando emision..." : "Emitiendo factura...");
    setIssueNotice(sourceTicket ? "Emitiendo factura desde ticket..." : sourceProforma ? "Emitiendo factura desde proforma..." : editingSale ? "Guardando correccion y reintentando emision..." : "Guardando y emitiendo factura...");
    const restoredProducts = editingSale && saleStatusReducesStock(editingSale.status) ? restoreSaleStock(data.products, editingSale) : data.products;
    const restoreMovements = editingSale && saleStatusReducesStock(editingSale.status) ? buildStockMovements(data.products, editingSale, "entrada", "Reverso por correccion de factura", user.id, retryAt, uid) : [];
    const savedDraftData: AppData = {
      ...data,
      issuer: editingSale ? data.issuer : updateIssuerEstablishmentSequence(data.issuer, documentEstablishment.id, "sequential", Math.max(documentIssuer.sequential + 1, Number(sequence) + 1)),
      products: restoredProducts,
      inventoryMovements: [...restoreMovements, ...(data.inventoryMovements || [])],
      sales: editingSale ? data.sales.map((item) => (item.id === editingSale.id ? saleForRetry : item)) : [saleForRetry, ...data.sales]
    };
    await persist(savedDraftData);

    let finalSale: Sale = saleForRetry;

    try {
      const sriResult = await authorizeInvoice(data.backendUrl, unsignedXml, backendToken);
      finalSale = {
        ...saleForRetry,
        accessKey: sriResult.accessKey || sale.accessKey,
        authorizationNumber: sriResult.authorizationNumber,
        authorizationDate: sriResult.authorizationDate,
        sriEnvironment: sriResult.sriEnvironment,
        sriMessage: sriResult.sriMessage,
        signedXml: sriResult.signedXml,
        authorizedXml: sriResult.authorizedXml,
        status: resolveInvoiceStatus(sriResult)
      };
      if (finalSale.status !== "AUTORIZADA") {
        const message = sriUserMessage(sriResult) || "El SRI recibio el comprobante, pero aun no devolvio autorizacion. Revise el documento y use Reintentar si queda pendiente.";
        setIssueNotice(message);
        showMessage("Factura no autorizada", message);
      }
    } catch (error) {
      const message = userFriendlyActionError(error, "authorize-invoice");
      const failedStatus = statusForAuthorizationFailure(message);
      const transientSriError = failedStatus === "PENDIENTE_SRI";
      finalSale = {
        ...saleForRetry,
        status: failedStatus,
        sriMessage: message
      };
      setIssueNotice(message);
      showMessage(transientSriError ? "Pendiente SRI" : "No se pudo firmar", transientSriError ? `${message}\n\nLa app lo reintentara cuando el SRI o la conexion respondan.` : message);
    }

    const shouldMoveStock = !sourceTicket && !isSriRejected(finalSale.status) && finalSale.status !== "ANULADA";
    const saleStockChanges = new Map<string, number>();
    if (shouldMoveStock) {
      items.filter(isInventoryProduct).forEach((item) => {
        saleStockChanges.set(item.productId, (saleStockChanges.get(item.productId) || 0) + item.quantity);
      });
    }
    const stockChangedProductIds = new Set<string>([
      ...Array.from(saleStockChanges.keys()),
      ...(editingSale?.items || []).filter(isInventoryProduct).map((item) => item.productId)
    ]);
    const saleMovements: InventoryMovement[] = [];
    const nextProducts = savedDraftData.products.map((product) => {
      if (!isInventoryProduct(product)) return product;
      const quantity = saleStockChanges.get(product.id) || 0;
      if (quantity <= 0) return product;
      const stockAfter = product.stock - quantity;
      saleMovements.push({
        id: uid(),
        productId: product.id,
        productName: product.name,
        type: "salida",
        quantity,
        stockBefore: product.stock,
        stockAfter,
        reason: editingSale ? "Venta corregida y facturada" : "Venta facturada",
        reference: sale.sequence,
        userId: user.id,
        createdAt
      });
      return { ...product, stock: stockAfter, updatedAt: retryAt };
    });

    const finalSales = savedDraftData.sales.map((item) => {
      if (item.id === finalSale.id) return finalSale;
      if (sourceTicket && finalSale.status === "AUTORIZADA" && item.id === sourceTicket.id) {
        const convertedAt = new Date().toISOString();
        return {
          ...item,
          status: "CONVERTIDA" as const,
          voidReason: `Convertida a factura ${finalSale.sequence}`,
          voidedAt: convertedAt,
          convertedAt,
          convertedToSaleId: finalSale.id,
          convertedToSequence: finalSale.sequence,
          sriMessage: `Convertida a factura ${finalSale.sequence}`
        };
      }
      if (sourceProforma && finalSale.status === "AUTORIZADA" && item.id === sourceProforma.id) {
        const convertedAt = new Date().toISOString();
        return {
          ...item,
          status: "CONVERTIDA" as const,
          voidReason: `Convertida a factura ${finalSale.sequence}`,
          voidedAt: convertedAt,
          convertedAt,
          convertedToSaleId: finalSale.id,
          convertedToSequence: finalSale.sequence,
          sriMessage: `Convertida a factura ${finalSale.sequence}`
        };
      }
      return item;
    });
    const finalData = appendAudit({
      ...savedDraftData,
      products: nextProducts,
      inventoryMovements: [...saleMovements, ...(savedDraftData.inventoryMovements || [])],
      sales: finalSales
    }, user, editingSale ? "INVOICE_REISSUED" : "INVOICE_CREATED", "sale", finalSale.id, `Factura ${finalSale.sequence} guardada con estado ${finalSale.status}`, { total: finalSale.total, status: finalSale.status, accessKey: finalSale.accessKey, sequenceSource: reservedByBackend ? "servidor" : "local" });
    await persist(finalData);
    resetCurrentDocumentForm();
    setIssuing(false);
    setProcessingMessage("");
    setIssueNotice(finalSale.status === "AUTORIZADA" ? "Factura autorizada y guardada." : `Factura guardada con estado ${finalSale.status}.`);
    showMessage("Factura guardada", finalSale.status === "AUTORIZADA" ? "Factura autorizada y guardada correctamente." : `Factura guardada con estado ${finalSale.status}.`);
    await syncSalePatchToBackend(data.backendUrl, backendToken, {
      baseData: data,
      issuer: finalData.issuer,
      sales: finalSales.filter((item) => [finalSale.id, sourceTicket?.id, sourceProforma?.id].filter(Boolean).includes(item.id)),
      products: finalData.products.filter((product) => stockChangedProductIds.has(product.id)),
      inventoryMovements: [...restoreMovements, ...saleMovements],
      auditLogs: finalData.auditLogs.slice(0, 1)
    }, finalData, persist);
    } finally {
      issueRunningRef.current = false;
      setIssuing(false);
      setProcessingMessage("");
    }
  };

  return { issue };
}
