import type React from "react";
import { useRef } from "react";
import { Alert } from "react-native";
import type { PersistMutation } from "./useSyncAndBackup";
import { authorizeInvoice, reserveDocumentSequence } from "../services/backend";
import { buildInvoiceXml, createAccessKey, nextSequence } from "../sri";
import { AdditionalInfoField, AppData, Client, DocumentType, PaymentCondition, PaymentMethod, Sale, SaleItem, SalePaymentSplit, User } from "../types";
import { appendAudit } from "../utils/audit";
import { isInventoryProduct } from "../utils/catalogItems";
import { getRetryInfo, MAX_DAILY_RETRIES, resolveInvoiceStatus } from "../utils/documents";
import { showMessage } from "../utils/dialogs";
import { activeEstablishment, activeIssuer, normalizedEstablishments, updateIssuerEstablishmentSequence } from "../utils/establishments";
import { generateId } from "../utils/id";
import { applySaleInventoryOnce, buildStockCredits, reverseSaleInventoryOnce, SaleInventoryError } from "../utils/inventory";
import { findPotentialDuplicatePendingInvoice, nextInternalSequence, nextProformaSequence, resolveSaleInventoryState } from "../utils/sales";
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

function inventoryItemsSignature(items: SaleItem[]): string {
  const quantities = new Map<string, number>();
  items.filter(isInventoryProduct).forEach((item) => {
    quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity);
  });
  return [...quantities.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([productId, quantity]) => `${productId}:${quantity.toFixed(6)}`)
    .join("|");
}

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
  persistMutation: PersistMutation;
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
  persistMutation,
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
    const saleId = editingSale?.id || uid();
    const editingSaleId = editingSale?.id;
    const sourceProformaId = sourceProforma?.id;
    const inventoryOperationId = uid();
    const createdAt = editingSale?.createdAt || new Date().toISOString();
    const savedAt = new Date().toISOString();
    const documentEstablishment = activeEstablishment(data.issuer);
    const establishmentId = documentEstablishment.id;
    const capturedItems = items.map((item) => ({ ...item }));
    const capturedPayments = resolvedPayments.map((payment) => ({ ...payment }));
    const capturedAdditionalInfo = additionalInfo.map((field) => ({ ...field }));
    const capturedTotals = { ...totals };
    const capturedUser = { ...user };
    const capturedClientId = clientId;
    const capturedCreditDueDate = creditDueDate.trim();
    const capturedPaymentCondition = paymentCondition;
    const capturedPaymentMethod = resolvedPaymentMethod;
    const backendUrl = data.backendUrl;
    const internalSaleCreditBalance = paymentCondition === "credito"
      ? Math.max(0, salePaymentBalance(totals.total, resolvedPayments))
      : 0;

    try {
      const persisted = await persistMutation((current) => {
        const currentEstablishment = normalizedEstablishments(current.issuer).find((item) => item.id === establishmentId);
        if (!currentEstablishment) throw new Error("El establecimiento seleccionado ya no existe.");
        if (activeEstablishment(current.issuer).id !== establishmentId) throw new Error("El establecimiento activo cambio durante la operacion.");
        const currentIssuer = activeIssuer(current);
        const currentEditingSale = editingSaleId ? current.sales.find((item) => item.id === editingSaleId) : undefined;
        if (editingSaleId && !currentEditingSale) throw new Error("La venta que intenta editar ya no existe.");
        const legacyScopeId = normalizedEstablishments(current.issuer)[0]?.id || currentEstablishment.id;
        const sequence = currentEditingSale?.sequence || nextInternalSequence(current.sales, establishmentId, legacyScopeId);
        let sale: Sale = {
          id: saleId,
          documentType: "nota_venta",
          establishment: currentIssuer.establishment,
          emissionPoint: currentIssuer.emissionPoint,
          establishmentName: currentEstablishment.name,
          clientId: capturedClientId,
          userId: currentEditingSale?.userId || capturedUser.id,
          createdAt,
          sequence,
          accessKey: "",
          subtotal: capturedTotals.subtotal,
          tax: capturedTotals.tax,
          total: capturedTotals.total,
          paymentMethod: capturedPaymentMethod,
          payments: capturedPayments,
          paymentCondition: capturedPaymentCondition,
          creditDueDate: capturedPaymentCondition === "credito" ? capturedCreditDueDate : undefined,
          creditBalance: internalSaleCreditBalance,
          creditStatus: internalSaleCreditBalance > 0 ? "pendiente" : "pagado",
          additionalInfo: capturedAdditionalInfo,
          status: "TICKET_OFFLINE",
          autoInvoiceOnSync: Boolean(options?.offlineFallback),
          sourceSaleId: sourceProformaId,
          items: capturedItems,
          inventoryState: "NOT_APPLIED",
          inventoryOperationId
        };
        let products = current.products;
        let movements = current.inventoryMovements || [];
        const inventoryUnchanged = currentEditingSale && inventoryItemsSignature(currentEditingSale.items) === inventoryItemsSignature(capturedItems);
        if (currentEditingSale && inventoryUnchanged && resolveSaleInventoryState(currentEditingSale) === "APPLIED") {
          const operationId = currentEditingSale.inventoryOperationId || inventoryOperationId;
          const applied = applySaleInventoryOnce({ products, movements, sale: { ...sale, inventoryState: "APPLIED", inventoryOperationId: operationId }, operationId, userId: capturedUser.id, createdAt: savedAt, reason: "Verificacion de inventario de nota de venta" });
          products = applied.products;
          movements = applied.movements;
          sale = applied.sale;
        } else {
          if (currentEditingSale && resolveSaleInventoryState(currentEditingSale) === "APPLIED") {
            const reversed = reverseSaleInventoryOnce({ products, movements, sale: currentEditingSale, operationId: currentEditingSale.inventoryOperationId || inventoryOperationId, userId: capturedUser.id, createdAt: savedAt, reason: "Reverso por correccion de nota de venta" });
            products = reversed.products;
            movements = reversed.movements;
          } else if (currentEditingSale && resolveSaleInventoryState(currentEditingSale) === "UNKNOWN") {
            reverseSaleInventoryOnce({ products, movements, sale: currentEditingSale, operationId: currentEditingSale.inventoryOperationId || inventoryOperationId, userId: capturedUser.id, createdAt: savedAt, reason: "Reconciliacion de nota de venta" });
          }
          const applied = applySaleInventoryOnce({ products, movements, sale, operationId: inventoryOperationId, userId: capturedUser.id, createdAt: savedAt, reason: options?.offlineFallback ? "Ticket guardado sin internet" : currentEditingSale ? "Nota de venta corregida" : "Nota de venta interna" });
          products = applied.products;
          movements = applied.movements;
          sale = applied.sale;
        }
        let sales = currentEditingSale
          ? current.sales.map((item) => item.id === saleId ? sale : item)
          : [sale, ...current.sales];
        if (sourceProformaId) {
          const currentSource = current.sales.find((item) => item.id === sourceProformaId);
          if (!currentSource) throw new Error("La proforma de origen ya no existe.");
          sales = sales.map((item) => item.id === sourceProformaId ? { ...item, status: "CONVERTIDA" as const, voidReason: `Convertida a ticket ${sale.sequence}`, voidedAt: savedAt, convertedAt: savedAt, convertedToSaleId: sale.id, convertedToSequence: sale.sequence, sriMessage: `Convertida a ticket ${sale.sequence}` } : item);
        }
        return appendAudit({ ...current, products, inventoryMovements: movements, sales }, capturedUser, currentEditingSale ? "INTERNAL_SALE_UPDATED" : "INTERNAL_SALE_CREATED", "sale", sale.id, `${options?.offlineFallback ? "Ticket offline creado" : currentEditingSale ? "Nota de venta actualizada" : "Nota de venta creada"}: ${sale.sequence}`, { total: sale.total });
      });
      const persistedSale = persisted.sales.find((item) => item.id === saleId);
      if (!persistedSale) throw new Error("La nota de venta no quedo disponible despues de persistir.");
      resetCurrentDocumentForm();
      const message = options?.offlineFallback
        ? "Se guardo como ticket interno. Cuando vuelva internet, la app intentara facturarlo automaticamente."
        : "La nota de venta se registro como movimiento interno.";
      setIssueNotice(message);
      showMessage(options?.offlineFallback ? "Venta guardada sin internet" : "Nota guardada", message);
      const operationMovements = (persisted.inventoryMovements || []).filter((movement) => movement.saleId === saleId && movement.createdAt === savedAt);
      const productIds = new Set(operationMovements.map((movement) => movement.productId));
      await syncSalePatchToBackend(backendUrl, backendToken, {
        baseData: persisted,
        sales: persisted.sales.filter((item) => [saleId, sourceProformaId].filter(Boolean).includes(item.id)),
        products: persisted.products.filter((product) => productIds.has(product.id)),
        inventoryMovements: operationMovements,
        auditLogs: persisted.auditLogs.slice(0, 1)
      }, persisted, persist);
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

      const saleId = editingSale?.id || uid();
      const editingSaleId = editingSale?.id;
      const createdAt = editingSale?.createdAt || new Date().toISOString();
      const establishmentId = activeEstablishment(data.issuer).id;
      const capturedItems = items.map((item) => ({ ...item }));
      const capturedPayments = resolvedPayments.map((payment) => ({ ...payment }));
      const capturedAdditionalInfo = additionalInfo.map((field) => ({ ...field }));
      const capturedTotals = { ...totals };
      const capturedUser = { ...user };
      const backendUrl = data.backendUrl;
      const persisted = await persistMutation((current) => {
        const currentEstablishment = normalizedEstablishments(current.issuer).find((item) => item.id === establishmentId);
        if (!currentEstablishment) throw new Error("El establecimiento seleccionado ya no existe.");
        if (activeEstablishment(current.issuer).id !== establishmentId) throw new Error("El establecimiento activo cambio durante la operacion.");
        const documentIssuer = activeIssuer(current);
        const currentEditingSale = editingSaleId ? current.sales.find((item) => item.id === editingSaleId) : undefined;
        if (editingSaleId && !currentEditingSale) throw new Error("La proforma que intenta editar ya no existe.");
        const legacyScopeId = normalizedEstablishments(current.issuer)[0]?.id || currentEstablishment.id;
        const sequence = currentEditingSale?.sequence || nextProformaSequence(current.sales, establishmentId, legacyScopeId);
        const sale: Sale = {
          id: saleId,
          documentType: "proforma",
          establishment: documentIssuer.establishment,
          emissionPoint: documentIssuer.emissionPoint,
          establishmentName: currentEstablishment.name,
          clientId,
          userId: currentEditingSale?.userId || capturedUser.id,
          createdAt,
          sequence,
          accessKey: "",
          subtotal: capturedTotals.subtotal,
          tax: capturedTotals.tax,
          total: capturedTotals.total,
          paymentMethod: resolvedPaymentMethod,
          payments: capturedPayments,
          ...creditFields,
          additionalInfo: capturedAdditionalInfo,
          status: "PROFORMA",
          items: capturedItems,
          inventoryState: "NOT_APPLIED",
          inventoryOperationId: undefined
        };
        const sales = currentEditingSale ? current.sales.map((item) => item.id === saleId ? sale : item) : [sale, ...current.sales];
        return appendAudit({ ...current, sales }, capturedUser, currentEditingSale ? "PROFORMA_UPDATED" : "PROFORMA_CREATED", "sale", sale.id, `${currentEditingSale ? "Proforma actualizada" : "Proforma creada"}: ${sale.sequence}`, { total: sale.total });
      });
      const persistedSale = persisted.sales.find((item) => item.id === saleId);
      if (!persistedSale) throw new Error("La proforma no quedo disponible despues de persistir.");
      resetCurrentDocumentForm();
      setIssueNotice("Proforma guardada. Si no hay internet quedara pendiente de sincronizar.");
      showMessage("Proforma guardada", "La proforma quedo registrada como cotizacion.");
      await syncSalePatchToBackend(backendUrl, backendToken, {
        baseData: persisted,
        sales: [persistedSale],
        auditLogs: persisted.auditLogs.slice(0, 1)
      }, persisted, persist);
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
    const saleId = editingSale?.id || uid();
    const editingSaleId = editingSale?.id;
    const sourceProformaId = sourceProforma?.id;
    const renderedSource = editingSale?.sourceSaleId ? data.sales.find((item) => item.id === editingSale.sourceSaleId) : undefined;
    const sourceTicketId = sourceTicket?.id || (renderedSource?.documentType === "nota_venta" ? renderedSource.id : undefined);
    const inventoryOperationId = uid();
    const createdAt = editingSale?.createdAt || new Date().toISOString();
    const establishmentId = documentEstablishment.id;
    const capturedItems = items.map((item) => ({ ...item }));
    const capturedPayments = resolvedPayments.map((payment) => ({ ...payment }));
    const capturedAdditionalInfo = additionalInfo.map((field) => ({ ...field }));
    const capturedTotals = { ...totals };
    const capturedUser = { ...user };
    const capturedClient = { ...invoiceClient };
    const capturedClientId = clientId;
    const capturedPaymentCondition = paymentCondition;
    const capturedPaymentMethod = resolvedPaymentMethod;
    const capturedCreditDueDate = creditDueDate.trim();
    const backendUrl = data.backendUrl;
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
      items: capturedItems,
      sourceSaleId: sourceTicketId || sourceProformaId
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
        const reserved = await reserveDocumentSequence(backendUrl, { documentType: "factura", issuer: documentIssuer, createdAt }, backendToken);
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
    setIssuing(true);
    setProcessingMessage(sourceTicket ? "Emitiendo factura desde ticket..." : sourceProforma ? "Emitiendo factura desde proforma..." : editingSale ? "Guardando correccion y reintentando emision..." : "Emitiendo factura...");
    setIssueNotice(sourceTicket ? "Emitiendo factura desde ticket..." : sourceProforma ? "Emitiendo factura desde proforma..." : editingSale ? "Guardando correccion y reintentando emision..." : "Guardando y emitiendo factura...");
    const savedDraftData = await persistMutation((current) => {
      const currentEstablishment = normalizedEstablishments(current.issuer).find((item) => item.id === establishmentId);
      if (!currentEstablishment) throw new Error("El establecimiento seleccionado ya no existe.");
      if (activeEstablishment(current.issuer).id !== establishmentId) throw new Error("El establecimiento activo cambio durante la emision.");
      const currentIssuer = activeIssuer(current);
      const currentEditingSale = editingSaleId ? current.sales.find((item) => item.id === editingSaleId) : undefined;
      if (editingSaleId && !currentEditingSale) throw new Error("La factura que intenta reemitir ya no existe.");
      if (!editingSaleId) {
        const duplicate = findPotentialDuplicatePendingInvoice(current.sales, {
          id: saleId,
          clientId: capturedClientId,
          createdAt,
          establishment: currentIssuer.establishment,
          emissionPoint: currentIssuer.emissionPoint,
          paymentMethod: capturedPaymentMethod,
          subtotal: capturedTotals.subtotal,
          tax: capturedTotals.tax,
          total: capturedTotals.total,
          items: capturedItems,
          sourceSaleId: sourceTicketId || sourceProformaId
        });
        if (duplicate) throw new Error(`Ya existe una factura pendiente muy parecida: ${duplicate.sequence}.`);
      }
      if (current.sales.some((item) => item.id !== saleId && item.accessKey === accessKey)) {
        throw new Error(`La clave de acceso ${accessKey} ya existe en otro comprobante.`);
      }
      let saleForRetry: Sale = {
        id: saleId,
        documentType: "factura",
        establishment: currentIssuer.establishment,
        emissionPoint: currentIssuer.emissionPoint,
        establishmentName: currentEstablishment.name,
        clientId: capturedClientId,
        userId: currentEditingSale?.userId || capturedUser.id,
        createdAt,
        sequence,
        accessKey,
        subtotal: capturedTotals.subtotal,
        tax: capturedTotals.tax,
        total: capturedTotals.total,
        paymentMethod: capturedPaymentMethod || "01",
        payments: capturedPayments,
        paymentCondition: capturedPaymentCondition,
        creditDueDate: capturedPaymentCondition === "credito" ? capturedCreditDueDate : undefined,
        creditBalance: creditFields.creditBalance,
        creditStatus: creditFields.creditStatus,
        additionalInfo: capturedAdditionalInfo,
        status: "PENDIENTE_SRI",
        items: capturedItems,
        sourceSaleId: sourceTicketId || sourceProformaId || currentEditingSale?.sourceSaleId,
        retryHistory: currentEditingSale ? [...(currentEditingSale.retryHistory || []), retryAt] : undefined,
        inventoryState: "NOT_APPLIED",
        inventoryOperationId: sourceTicketId ? undefined : inventoryOperationId
      };
      let products = current.products;
      let movements = current.inventoryMovements || [];
      if (sourceTicketId) {
        const currentTicket = current.sales.find((item) => item.id === sourceTicketId);
        if (!currentTicket) throw new Error("El ticket de origen ya no existe.");
        const ticketOperationId = currentTicket.inventoryOperationId || inventoryOperationId;
        applySaleInventoryOnce({ products, movements, sale: currentTicket, operationId: ticketOperationId, userId: capturedUser.id, createdAt: retryAt, reason: "Verificacion de inventario del ticket de origen" });
      } else {
        const inventoryUnchanged = currentEditingSale && inventoryItemsSignature(currentEditingSale.items) === inventoryItemsSignature(capturedItems);
        if (currentEditingSale && inventoryUnchanged && resolveSaleInventoryState(currentEditingSale) === "APPLIED") {
          const operationId = currentEditingSale.inventoryOperationId || inventoryOperationId;
          const applied = applySaleInventoryOnce({ products, movements, sale: { ...saleForRetry, inventoryState: "APPLIED", inventoryOperationId: operationId }, operationId, userId: capturedUser.id, createdAt: retryAt, reason: "Verificacion de inventario de factura" });
          products = applied.products;
          movements = applied.movements;
          saleForRetry = applied.sale;
        } else {
          if (currentEditingSale && resolveSaleInventoryState(currentEditingSale) === "APPLIED") {
            const reversed = reverseSaleInventoryOnce({ products, movements, sale: currentEditingSale, operationId: currentEditingSale.inventoryOperationId || inventoryOperationId, userId: capturedUser.id, createdAt: retryAt, reason: "Reverso por correccion de factura" });
            products = reversed.products;
            movements = reversed.movements;
          } else if (currentEditingSale && resolveSaleInventoryState(currentEditingSale) === "UNKNOWN") {
            reverseSaleInventoryOnce({ products, movements, sale: currentEditingSale, operationId: currentEditingSale.inventoryOperationId || inventoryOperationId, userId: capturedUser.id, createdAt: retryAt, reason: "Reconciliacion de factura" });
          }
          const applied = applySaleInventoryOnce({ products, movements, sale: saleForRetry, operationId: inventoryOperationId, userId: capturedUser.id, createdAt: retryAt, reason: currentEditingSale ? "Venta corregida pendiente SRI" : "Venta pendiente SRI" });
          products = applied.products;
          movements = applied.movements;
          saleForRetry = applied.sale;
        }
      }
      const sales = currentEditingSale ? current.sales.map((item) => item.id === saleId ? saleForRetry : item) : [saleForRetry, ...current.sales];
      const issuer = currentEditingSale
        ? current.issuer
        : updateIssuerEstablishmentSequence(current.issuer, establishmentId, "sequential", Math.max(currentIssuer.sequential + 1, Number(sequence) + 1));
      return appendAudit({ ...current, issuer, products, inventoryMovements: movements, sales }, capturedUser, currentEditingSale ? "INVOICE_REISSUE_PENDING" : "INVOICE_PENDING", "sale", saleId, `Factura ${sequence} guardada con estado PENDIENTE_SRI`, { total: capturedTotals.total, status: "PENDIENTE_SRI", accessKey, sequenceSource: reservedByBackend ? "servidor" : "local" });
    });
    const persistedDraftSale = savedDraftData.sales.find((item) => item.id === saleId);
    if (!persistedDraftSale) throw new Error("El borrador de factura no quedo disponible despues de persistir.");
    const unsignedXml = buildInvoiceXml(persistedDraftSale, capturedClient, activeIssuer(savedDraftData));

    let finalSaleResult: Sale = persistedDraftSale;

    try {
      const sriResult = await authorizeInvoice(backendUrl, unsignedXml, backendToken);
      finalSaleResult = {
        ...persistedDraftSale,
        accessKey: sriResult.accessKey || persistedDraftSale.accessKey,
        authorizationNumber: sriResult.authorizationNumber,
        authorizationDate: sriResult.authorizationDate,
        sriEnvironment: sriResult.sriEnvironment,
        sriMessage: sriResult.sriMessage,
        signedXml: sriResult.signedXml,
        authorizedXml: sriResult.authorizedXml,
        status: resolveInvoiceStatus(sriResult)
      };
      if (finalSaleResult.status !== "AUTORIZADA") {
        const message = sriUserMessage(sriResult) || "El SRI recibio el comprobante, pero aun no devolvio autorizacion. Revise el documento y use Reintentar si queda pendiente.";
        setIssueNotice(message);
        showMessage("Factura no autorizada", message);
      }
    } catch (error) {
      const message = userFriendlyActionError(error, "authorize-invoice");
      const failedStatus = statusForAuthorizationFailure(message);
      const transientSriError = failedStatus === "PENDIENTE_SRI";
      finalSaleResult = {
        ...persistedDraftSale,
        status: failedStatus,
        sriMessage: message
      };
      setIssueNotice(message);
      showMessage(transientSriError ? "Pendiente SRI" : "No se pudo firmar", transientSriError ? `${message}\n\nLa app lo reintentara cuando el SRI o la conexion respondan.` : message);
    }

    const finalPersistedAt = new Date().toISOString();
    const finalData = await persistMutation((current) => {
      const currentDraft = current.sales.find((item) => item.id === saleId);
      if (!currentDraft) throw new Error("El borrador de factura ya no existe.");
      let products = current.products;
      let movements = current.inventoryMovements || [];
      let finalSale: Sale = {
        ...currentDraft,
        accessKey: finalSaleResult.accessKey,
        authorizationNumber: finalSaleResult.authorizationNumber,
        authorizationDate: finalSaleResult.authorizationDate,
        sriEnvironment: finalSaleResult.sriEnvironment,
        sriMessage: finalSaleResult.sriMessage,
        signedXml: finalSaleResult.signedXml,
        authorizedXml: finalSaleResult.authorizedXml,
        status: finalSaleResult.status,
        inventoryState: currentDraft.inventoryState,
        inventoryOperationId: currentDraft.inventoryOperationId
      };
      if (!sourceTicketId) {
        if (["DEVUELTA", "ERROR_SRI", "ANULADA"].includes(finalSale.status)) {
          const operationId = currentDraft.inventoryOperationId || inventoryOperationId;
          const reversed = reverseSaleInventoryOnce({ products, movements, sale: finalSale, operationId, userId: capturedUser.id, createdAt: finalPersistedAt, reason: `Reverso por estado ${finalSale.status}` });
          products = reversed.products;
          movements = reversed.movements;
          finalSale = reversed.sale;
        } else {
          const operationId = currentDraft.inventoryOperationId || inventoryOperationId;
          if (resolveSaleInventoryState(currentDraft) !== "APPLIED") {
            throw new SaleInventoryError("SALE_INVENTORY_OPERATION_MISMATCH", currentDraft.id, operationId, "APPLY");
          }
          const verified = applySaleInventoryOnce({ products, movements, sale: finalSale, operationId, userId: capturedUser.id, createdAt: finalPersistedAt, reason: "Verificacion de inventario de factura" });
          products = verified.products;
          movements = verified.movements;
          finalSale = verified.sale;
        }
      } else {
        finalSale = { ...finalSale, inventoryState: "NOT_APPLIED", inventoryOperationId: undefined };
      }
      let sales = current.sales.map((item) => item.id === saleId ? finalSale : item);
      if (finalSale.status === "AUTORIZADA") {
        const sourceId = sourceTicketId || sourceProformaId;
        if (sourceId) {
          const currentSource = current.sales.find((item) => item.id === sourceId);
          if (!currentSource) throw new Error("El documento de origen ya no existe.");
          if (sourceTicketId) {
            const ticketOperationId = currentSource.inventoryOperationId || inventoryOperationId;
            if (resolveSaleInventoryState(currentSource) !== "APPLIED") {
              throw new SaleInventoryError("SALE_INVENTORY_OPERATION_MISMATCH", currentSource.id, ticketOperationId, "APPLY");
            }
            applySaleInventoryOnce({ products, movements, sale: currentSource, operationId: ticketOperationId, userId: capturedUser.id, createdAt: finalPersistedAt, reason: "Verificacion final del inventario del ticket" });
          }
          sales = sales.map((item) => item.id === sourceId ? { ...item, status: "CONVERTIDA" as const, voidReason: `Convertida a factura ${finalSale.sequence}`, voidedAt: finalPersistedAt, convertedAt: finalPersistedAt, convertedToSaleId: finalSale.id, convertedToSequence: finalSale.sequence, sriMessage: `Convertida a factura ${finalSale.sequence}` } : item);
        }
      }
      return appendAudit({ ...current, products, inventoryMovements: movements, sales }, capturedUser, editingSaleId ? "INVOICE_REISSUED" : "INVOICE_CREATED", "sale", finalSale.id, `Factura ${finalSale.sequence} guardada con estado ${finalSale.status}`, { total: finalSale.total, status: finalSale.status, accessKey: finalSale.accessKey, sequenceSource: reservedByBackend ? "servidor" : "local" });
    });
    const finalSale = finalData.sales.find((item) => item.id === saleId);
    if (!finalSale) throw new Error("La factura no quedo disponible despues de persistir el resultado SRI.");
    resetCurrentDocumentForm();
    setIssuing(false);
    setProcessingMessage("");
    setIssueNotice(finalSale.status === "AUTORIZADA" ? "Factura autorizada y guardada." : `Factura guardada con estado ${finalSale.status}.`);
    showMessage("Factura guardada", finalSale.status === "AUTORIZADA" ? "Factura autorizada y guardada correctamente." : `Factura guardada con estado ${finalSale.status}.`);
    const operationMovements = (finalData.inventoryMovements || []).filter((movement) => movement.saleId === saleId && (movement.createdAt === retryAt || movement.createdAt === finalPersistedAt));
    const stockChangedProductIds = new Set(operationMovements.map((movement) => movement.productId));
    await syncSalePatchToBackend(backendUrl, backendToken, {
      baseData: finalData,
      issuer: finalData.issuer,
      sales: finalData.sales.filter((item) => [saleId, sourceTicketId, sourceProformaId].filter(Boolean).includes(item.id)),
      products: finalData.products.filter((product) => stockChangedProductIds.has(product.id)),
      inventoryMovements: operationMovements,
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
