import React from "react";
import { Alert } from "react-native";
import { authorizeInvoice, reserveDocumentSequence } from "../services/backend";
import { buildCreditNoteXml, calculateTotals, createCreditNoteAccessKey, nextSequence } from "../sri";
import { AppData, Client, Sale, User } from "../types";
import type { PersistMutation } from "./useSyncAndBackup";
import { appendAudit } from "../utils/audit";
import { applyCreditAdjustmentOnce, reconcileCreditBalances, resolveCreditAdjustmentState } from "../utils/credit";
import { isAccessKeyUsed, resolveInvoiceStatus } from "../utils/documents";
import { showMessage } from "../utils/dialogs";
import { activeEstablishment, issuerForSale, updateIssuerEstablishmentSequence } from "../utils/establishments";
import { formatSriDate } from "../utils/format";
import { applyCreditNoteInventoryOnce } from "../utils/inventory";
import { buildCreditNoteItemsFromQuantities, formatQuantity, getCreditLineAvailable, getCreditLineKey, hasCreditNoteBalance, isFinalConsumerClient, isInvoiceSale, validateCreditNoteQuantities } from "../utils/sales";
import { explainSriResult, sriUserMessage } from "../utils/sriMessages";
import { syncSalePatchToBackend } from "../utils/sync";
import { validateEmissionPointLicense } from "../validation";

const PENDING_CREDIT_NOTE_STATUSES = new Set<Sale["status"]>(["BORRADOR", "FIRMADA", "ENVIADA", "PENDIENTE_SRI", "ENVIADA_SRI"]);

function creditNoteItemsFingerprint(items: Sale["items"]) {
  return items
    .map((item, index) => `${item.sourceLineKey || `${item.productId}:${index}`}:${item.quantity}`)
    .sort()
    .join("|");
}

type UseCreditNoteActionsParams = {
  backendToken: string;
  creditNoteClient?: Client;
  creditNoteQuantities: Record<string, string>;
  creditNoteReason: string;
  creditNoteSource?: Sale;
  data: AppData;
  issuingCreditNote: boolean;
  persistMutation: PersistMutation;
  sendSaleEmail: (sale: Sale, client: Client, source?: Sale, showAlerts?: boolean) => Promise<boolean>;
  setCreditNoteQuantities: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setCreditNoteReason: React.Dispatch<React.SetStateAction<string>>;
  setCreditNoteSourceId: React.Dispatch<React.SetStateAction<string>>;
  setIssuingCreditNote: React.Dispatch<React.SetStateAction<boolean>>;
  setProcessingMessage: React.Dispatch<React.SetStateAction<string>>;
  setRetryingSaleId: React.Dispatch<React.SetStateAction<string>>;
  user: User;
};

export function useCreditNoteActions({
  backendToken,
  creditNoteClient,
  creditNoteQuantities,
  creditNoteReason,
  creditNoteSource,
  data,
  issuingCreditNote,
  persistMutation,
  sendSaleEmail,
  setCreditNoteQuantities,
  setCreditNoteReason,
  setCreditNoteSourceId,
  setIssuingCreditNote,
  setProcessingMessage,
  setRetryingSaleId,
  user
}: UseCreditNoteActionsParams) {
  const openCreditNoteForm = (sourceSale: Sale) => {
    const sourceClient = data.clients.find((client) => client.id === sourceSale.clientId);
    if (!isInvoiceSale(sourceSale) || sourceSale.status !== "AUTORIZADA") {
      Alert.alert("Nota de credito no disponible", "Solo se puede emitir nota de credito sobre facturas autorizadas.");
      return;
    }
    if (!sourceClient || isFinalConsumerClient(sourceClient)) {
      Alert.alert("Nota de credito no disponible", "No se puede emitir nota de credito para facturas a consumidor final. La factura debe tener datos de cliente con cedula, RUC, pasaporte o identificacion exterior.");
      return;
    }
    if (!hasCreditNoteBalance(data.sales, sourceSale)) {
      Alert.alert("Factura compensada", "Esta factura ya no tiene cantidades disponibles para nota de credito.");
      return;
    }

    const nextQuantities: Record<string, string> = {};
    sourceSale.items.forEach((item, index) => {
      nextQuantities[getCreditLineKey(item, index)] = "0";
    });
    setCreditNoteSourceId(sourceSale.id);
    setCreditNoteReason("Devolucion parcial");
    setCreditNoteQuantities(nextQuantities);
  };

  const fillCreditNoteTotal = () => {
    if (!creditNoteSource) return;
    const nextQuantities: Record<string, string> = {};
    creditNoteSource.items.forEach((item, index) => {
      const available = getCreditLineAvailable(data.sales, creditNoteSource, item, index);
      nextQuantities[getCreditLineKey(item, index)] = available > 0 ? formatQuantity(available) : "0";
    });
    setCreditNoteQuantities(nextQuantities);
  };

  const closeCreditNoteForm = () => {
    if (issuingCreditNote) return;
    setCreditNoteSourceId("");
    setCreditNoteReason("Devolucion parcial");
    setCreditNoteQuantities({});
  };

  const issueCreditNote = async () => {
    const sourceSaleId = creditNoteSource?.id;
    const sourceClientId = creditNoteClient?.id;
    if (!sourceSaleId || !sourceClientId) {
      Alert.alert("Nota de credito no disponible", "No se encontro la factura o el cliente de origen.");
      return;
    }
    if (!isInvoiceSale(creditNoteSource) || creditNoteSource.status !== "AUTORIZADA") {
      Alert.alert("Nota de credito no disponible", "Solo se puede emitir nota de credito sobre facturas autorizadas.");
      return;
    }
    if (isFinalConsumerClient(creditNoteClient)) {
      Alert.alert("Nota de credito no disponible", "No se puede emitir nota de credito para facturas a consumidor final. La factura debe tener datos de cliente con cedula, RUC, pasaporte o identificacion exterior.");
      return;
    }

    const reason = creditNoteReason.trim();
    if (!reason) {
      Alert.alert("Motivo requerido", "Ingrese el motivo de la nota de credito.");
      return;
    }

    const intendedQuantities = { ...creditNoteQuantities };
    const validationErrors = validateCreditNoteQuantities(creditNoteSource, data.sales, intendedQuantities);
    if (validationErrors.length > 0) {
      Alert.alert("Revise cantidades", validationErrors.join("\n"));
      return;
    }

    const creditItems = buildCreditNoteItemsFromQuantities(creditNoteSource, data.sales, intendedQuantities);
    if (creditItems.length === 0) {
      Alert.alert("Seleccione productos", "Ingrese una cantidad mayor a cero en al menos un producto o servicio.");
      return;
    }

    const createdAt = new Date().toISOString();
    const reservationIssuer = issuerForSale(data.issuer, creditNoteSource);
    const licenseErrors: string[] = [];
    validateEmissionPointLicense(data, reservationIssuer, licenseErrors);
    if (licenseErrors.length > 0) {
      const message = licenseErrors.join("\n");
      showMessage("Plan requerido", message);
      return;
    }
    let sequence = nextSequence(reservationIssuer.creditNoteSequential || 1);
    let accessKey = createCreditNoteAccessKey(new Date(createdAt), reservationIssuer, sequence);
    try {
      setProcessingMessage("Preparando numero de nota de credito...");
      const reserved = await reserveDocumentSequence(data.backendUrl, { documentType: "nota_credito", issuer: reservationIssuer, createdAt }, backendToken);
      if (Number(reserved.sequence) < Number(sequence)) {
        throw new Error(`El servidor devolvio el secuencial ${reserved.sequence}, menor al configurado ${sequence}. Guarde SRI y sincronice antes de emitir.`);
      }
      sequence = reserved.sequence || sequence;
      accessKey = reserved.accessKey || accessKey;
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo preparar el numero de nota de credito.";
      Alert.alert("Numero no preparado", message);
      setProcessingMessage("");
      return;
    }
    const noteId = `credit-note:${accessKey}`;
    const inventoryOperationId = `${noteId}:inventory`;
    const draftFingerprint = `${noteId}:${sourceSaleId}:${sequence}:${createdAt}:${inventoryOperationId}`;
    setRetryingSaleId(sourceSaleId);
    setIssuingCreditNote(true);
    setProcessingMessage("Guardando nota de credito pendiente...");

    let draftData: AppData;
    try {
      draftData = await persistMutation((current) => {
        const currentSource = current.sales.find((sale) => sale.id === sourceSaleId);
        if (!currentSource || !isInvoiceSale(currentSource) || currentSource.status !== "AUTORIZADA") {
          throw new Error("La factura de origen ya no esta disponible o autorizada.");
        }
        const currentClient = current.clients.find((client) => client.id === currentSource.clientId && client.id === sourceClientId);
        if (!currentClient || isFinalConsumerClient(currentClient)) {
          throw new Error("El cliente de la factura ya no es valido para una nota de credito.");
        }
        const currentValidationErrors = validateCreditNoteQuantities(currentSource, current.sales, intendedQuantities);
        if (currentValidationErrors.length > 0) {
          throw new Error(currentValidationErrors.join("\n"));
        }
        const currentItems = buildCreditNoteItemsFromQuantities(currentSource, current.sales, intendedQuantities);
        if (currentItems.length === 0) {
          throw new Error("Ingrese una cantidad mayor a cero en al menos un producto o servicio.");
        }
        const intendedFingerprint = creditNoteItemsFingerprint(currentItems);
        const duplicatePending = current.sales.some((sale) =>
          sale.documentType === "nota_credito" &&
          sale.sourceSaleId === currentSource.id &&
          PENDING_CREDIT_NOTE_STATUSES.has(sale.status) &&
          creditNoteItemsFingerprint(sale.items) === intendedFingerprint
        );
        if (duplicatePending) {
          throw new Error("Ya existe una nota de credito pendiente con las mismas cantidades.");
        }
        currentSource.items.forEach((sourceItem, index) => {
          const sourceLineKey = getCreditLineKey(sourceItem, index);
          const requestedQuantity = currentItems
            .filter((item) => item.sourceLineKey === sourceLineKey)
            .reduce((sum, item) => sum + item.quantity, 0);
          const pendingQuantity = current.sales
            .filter((sale) => sale.documentType === "nota_credito" && sale.sourceSaleId === currentSource.id && PENDING_CREDIT_NOTE_STATUSES.has(sale.status))
            .flatMap((sale) => sale.items)
            .filter((item) => item.sourceLineKey === sourceLineKey)
            .reduce((sum, item) => sum + item.quantity, 0);
          const availableQuantity = getCreditLineAvailable(current.sales, currentSource, sourceItem, index);
          if (requestedQuantity > Math.max(0, availableQuantity - pendingQuantity) + 0.000001) {
            throw new Error(`La cantidad disponible de ${sourceItem.name} cambio mientras se preparaba la nota de credito.`);
          }
        });
        const currentIssuer = issuerForSale(current.issuer, currentSource);
        if (currentIssuer.establishment !== reservationIssuer.establishment || currentIssuer.emissionPoint !== reservationIssuer.emissionPoint) {
          throw new Error("El punto de emision cambio durante la reserva. Intente nuevamente.");
        }
        const currentLicenseErrors: string[] = [];
        validateEmissionPointLicense(current, currentIssuer, currentLicenseErrors);
        if (currentLicenseErrors.length > 0) throw new Error(currentLicenseErrors.join("\n"));
        if (isAccessKeyUsed(current, accessKey)) {
          throw new Error(`La clave de acceso ${accessKey} ya existe. Revise el secuencial de notas de credito.`);
        }

        const establishmentId = `${currentIssuer.establishment}-${currentIssuer.emissionPoint}`;
        const currentEstablishment = {
          ...activeEstablishment(current.issuer),
          id: establishmentId,
          name: currentSource.establishmentName || establishmentId,
          establishment: currentIssuer.establishment,
          emissionPoint: currentIssuer.emissionPoint
        };
        const currentTotals = calculateTotals(currentItems);
        const creditNote: Sale = {
          id: noteId,
          documentType: "nota_credito",
          establishment: currentIssuer.establishment,
          emissionPoint: currentIssuer.emissionPoint,
          establishmentName: currentEstablishment.name,
          sourceSaleId: currentSource.id,
          clientId: currentSource.clientId,
          userId: user.id,
          createdAt,
          sequence,
          accessKey,
          subtotal: currentTotals.subtotal,
          tax: currentTotals.tax,
          total: currentTotals.total,
          paymentMethod: currentSource.paymentMethod || "01",
          status: "PENDIENTE_SRI",
          items: currentItems,
          supportDocumentType: "01",
          supportDocumentNumber: `${currentIssuer.establishment}-${currentIssuer.emissionPoint}-${currentSource.sequence}`,
          supportAuthorizationNumber: currentSource.authorizationNumber || currentSource.accessKey,
          supportIssueDate: formatSriDate(new Date(currentSource.createdAt)),
          creditReason: reason,
          creditNoteInventoryState: "NOT_APPLIED",
          creditNoteInventoryOperationId: inventoryOperationId
        };
        const next = {
          ...current,
          issuer: updateIssuerEstablishmentSequence(current.issuer, establishmentId, "creditNoteSequential", Math.max((currentIssuer.creditNoteSequential || 1) + 1, Number(sequence) + 1)),
          sales: [creditNote, ...current.sales]
        };
        return appendAudit(next, user, "CREDIT_NOTE_DRAFT_CREATED", "sale", creditNote.id, `Nota de credito ${creditNote.sequence} pendiente para factura ${currentSource.sequence}`, { sourceSaleId: currentSource.id, total: creditNote.total, status: creditNote.status });
      });
    } catch (error) {
      Alert.alert("Nota de credito no guardada", error instanceof Error ? error.message : "No se pudo guardar el borrador de la nota de credito.");
      setRetryingSaleId("");
      setIssuingCreditNote(false);
      setProcessingMessage("");
      return;
    }

    const draftNote = draftData.sales.find((sale) => sale.id === noteId);
    const draftSource = draftNote?.sourceSaleId ? draftData.sales.find((sale) => sale.id === draftNote.sourceSaleId) : undefined;
    const draftClient = draftNote ? draftData.clients.find((client) => client.id === draftNote.clientId) : undefined;
    if (!draftNote || !draftSource || !draftClient) {
      Alert.alert("Nota de credito no disponible", "El borrador durable no pudo prepararse para el envio al SRI.");
      setRetryingSaleId("");
      setIssuingCreditNote(false);
      setProcessingMessage("");
      return;
    }
    const draftIssuer = issuerForSale(draftData.issuer, draftNote);
    const xml = buildCreditNoteXml(draftNote, draftClient, draftIssuer);
    setProcessingMessage("Emitiendo nota de credito...");

    let sriResult: Awaited<ReturnType<typeof authorizeInvoice>>;
    try {
      sriResult = await authorizeInvoice(draftData.backendUrl, xml, backendToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo emitir la nota de credito.";
      let auditLogId = "";
      try {
        const failedData = await persistMutation((current) => {
          const currentNote = current.sales.find((sale) => sale.id === noteId);
          if (!currentNote || `${currentNote.id}:${currentNote.sourceSaleId}:${currentNote.sequence}:${currentNote.createdAt}:${currentNote.creditNoteInventoryOperationId}` !== draftFingerprint) {
            throw new Error("El borrador durable de la nota de credito cambio y requiere revision.");
          }
          if (currentNote.status === "AUTORIZADA") return current;
          if (currentNote.status === "ERROR_SRI" && currentNote.sriMessage === message) return current;
          const failedNote: Sale = { ...currentNote, status: "ERROR_SRI", sriMessage: message, signedXml: xml, creditNoteInventoryState: "NOT_APPLIED" };
          const next = { ...current, sales: current.sales.map((sale) => sale.id === noteId ? failedNote : sale) };
          const audited = appendAudit(next, user, "CREDIT_NOTE_FAILED", "sale", noteId, `Nota de credito ${currentNote.sequence} rechazada`, { error: message });
          auditLogId = audited.auditLogs[0]?.id || "";
          return audited;
        });
        const failedNote = failedData.sales.find((sale) => sale.id === noteId);
        if (failedNote) {
          try {
            await syncSalePatchToBackend(failedData.backendUrl, backendToken, {
              baseData: failedData,
              issuer: failedData.issuer,
              sales: [failedNote],
              auditLogs: auditLogId ? failedData.auditLogs.filter((log) => log.id === auditLogId) : []
            }, { persistMutation });
          } catch {
            // El error SRI durable se conserva aunque falle la sincronizacion posterior.
          }
        }
      } catch (persistError) {
        Alert.alert("Error SRI no guardado", persistError instanceof Error ? persistError.message : "No se pudo guardar el error del SRI.");
        setRetryingSaleId("");
        setIssuingCreditNote(false);
        setProcessingMessage("");
        return;
      }
      Alert.alert("Nota de credito rechazada", message);
      setRetryingSaleId("");
      setIssuingCreditNote(false);
      setProcessingMessage("");
      return;
    }

    try {
      const resolvedStatus = resolveInvoiceStatus(sriResult);
      let transitionedToAuthorized = false;
      let changedProductIds = new Set<string>();
      let createdMovementIds = new Set<string>();
      let changedAdjustmentIds = new Set<string>();
      let auditLogId = "";
      let durableResultChanged = false;
      const finalData = await persistMutation((current) => {
        const currentNote = current.sales.find((sale) => sale.id === noteId);
        if (!currentNote) throw new Error("No se encontro el borrador durable de la nota de credito.");
        const currentSource = currentNote.sourceSaleId ? current.sales.find((sale) => sale.id === currentNote.sourceSaleId) : undefined;
        if (!currentSource) throw new Error("No se encontro la factura de origen de la nota de credito.");
        if (`${currentNote.id}:${currentNote.sourceSaleId}:${currentNote.sequence}:${currentNote.createdAt}:${currentNote.creditNoteInventoryOperationId}` !== draftFingerprint) {
          throw new Error("El borrador durable de la nota de credito cambio y requiere revision.");
        }
        if (currentNote.creditNoteInventoryState === "UNKNOWN") {
          throw new Error("El inventario de esta nota de credito requiere reconciliacion manual.");
        }
        const adjustmentRequired = currentSource.paymentCondition === "credito";
        const existingAdjustment = (current.creditAdjustments || []).find((adjustment) => adjustment.sourceCreditNoteId === currentNote.id);
        const adjustmentAlreadyApplied = !adjustmentRequired || resolveCreditAdjustmentState(existingAdjustment) === "APPLIED";
        if (currentNote.status === "AUTORIZADA" && currentNote.creditNoteInventoryState === "APPLIED" && adjustmentAlreadyApplied) return current;

        let finalNote: Sale = {
          ...currentNote,
          accessKey: sriResult.accessKey || currentNote.accessKey,
          authorizationNumber: sriResult.authorizationNumber,
          authorizationDate: sriResult.authorizationDate,
          sriEnvironment: sriResult.sriEnvironment,
          sriMessage: sriResult.sriMessage,
          signedXml: sriResult.signedXml,
          authorizedXml: sriResult.authorizedXml,
          status: resolvedStatus
        };
        let nextProducts = current.products;
        let nextMovements = current.inventoryMovements || [];
        let nextData: AppData = current;
        let adjustmentChanged = false;
        transitionedToAuthorized = currentNote.status !== "AUTORIZADA" && resolvedStatus === "AUTORIZADA";
        if (resolvedStatus === "AUTORIZADA") {
          const inventoryResult = applyCreditNoteInventoryOnce({
            products: current.products,
            movements: nextMovements,
            note: finalNote,
            userId: user.id,
            createdAt,
            reason: `Nota de credito ${finalNote.sequence}`
          });
          finalNote = inventoryResult.note;
          nextProducts = inventoryResult.products;
          nextMovements = inventoryResult.movements;
          if (inventoryResult.changed) {
            changedProductIds = new Set(finalNote.items.map((item) => item.productId));
            createdMovementIds = new Set(nextMovements.filter((movement) => movement.inventoryOperationId === inventoryOperationId && movement.inventoryOperationType === "CREDIT_NOTE_RETURN").map((movement) => movement.id));
          }
          nextData = {
            ...current,
            products: nextProducts,
            inventoryMovements: nextMovements,
            sales: current.sales.map((sale) => sale.id === noteId ? finalNote : sale)
          };
          if (adjustmentRequired) {
            const adjustmentResult = applyCreditAdjustmentOnce({
              data: nextData,
              creditNoteId: finalNote.id,
              userId: user.id,
              occurredAt: sriResult.authorizationDate || createdAt,
              reason: finalNote.creditReason
            });
            nextData = adjustmentResult.data;
            adjustmentChanged = adjustmentResult.changed;
            if (adjustmentResult.changed) changedAdjustmentIds = new Set([adjustmentResult.adjustment.id]);
          }
          nextData = reconcileCreditBalances(nextData);
        } else {
          finalNote = { ...finalNote, creditNoteInventoryState: "NOT_APPLIED" };
          nextData = { ...current, sales: current.sales.map((sale) => sale.id === noteId ? finalNote : sale) };
        }

        let nextSales = nextData.sales;
        const reconciledSource = nextSales.find((sale) => sale.id === currentSource.id);
        if (transitionedToAuthorized && reconciledSource && !hasCreditNoteBalance(nextSales, reconciledSource)) {
          nextSales = nextSales.map((sale) => sale.id === currentSource.id
            ? { ...sale, voidReason: `Compensada con nota de credito ${finalNote.sequence}: ${reason}`, voidedAt: createdAt }
            : sale);
        }
        const next = { ...nextData, sales: nextSales };
        const statusTransitioned = currentNote.status !== resolvedStatus;
        durableResultChanged = statusTransitioned || adjustmentChanged || nextProducts !== current.products || nextMovements !== current.inventoryMovements;
        if (!statusTransitioned) return next;
        const audited = appendAudit(next, user, resolvedStatus === "AUTORIZADA" ? "CREDIT_NOTE_CREATED" : "CREDIT_NOTE_STATUS_UPDATED", "sale", finalNote.id, `Nota de credito ${finalNote.sequence} para factura ${currentSource.sequence}: ${finalNote.status}`, { sourceSaleId: currentSource.id, total: finalNote.total, status: finalNote.status });
        auditLogId = audited.auditLogs[0]?.id || "";
        return audited;
      });
      const finalCreditNote = finalData.sales.find((sale) => sale.id === noteId);
      const finalSource = finalCreditNote?.sourceSaleId ? finalData.sales.find((sale) => sale.id === finalCreditNote.sourceSaleId) : undefined;
      const finalClient = finalCreditNote ? finalData.clients.find((client) => client.id === finalCreditNote.clientId) : undefined;
      if (!finalCreditNote) throw new Error("No se encontro la nota de credito persistida.");

      if (durableResultChanged) {
        try {
          await syncSalePatchToBackend(finalData.backendUrl, backendToken, {
            baseData: finalData,
            issuer: finalData.issuer,
            sales: finalData.sales.filter((sale) => [noteId, finalCreditNote.sourceSaleId].includes(sale.id)),
            products: finalData.products.filter((product) => changedProductIds.has(product.id)),
            inventoryMovements: finalData.inventoryMovements.filter((movement) => createdMovementIds.has(movement.id)),
            creditAdjustments: (finalData.creditAdjustments || []).filter((adjustment) => changedAdjustmentIds.has(adjustment.id)),
            auditLogs: auditLogId ? finalData.auditLogs.filter((log) => log.id === auditLogId) : []
          }, { persistMutation });
        } catch {
          // El estado fiscal durable no debe degradarse por un fallo posterior de sincronizacion.
        }
      }
      let creditNoteEmailSent = false;
      if (transitionedToAuthorized && finalCreditNote.status === "AUTORIZADA" && finalSource && finalClient) {
        try {
          creditNoteEmailSent = await sendSaleEmail(finalCreditNote, finalClient, finalSource, false);
        } catch {
          creditNoteEmailSent = false;
        }
        setCreditNoteSourceId("");
        setCreditNoteReason("Devolucion parcial");
        setCreditNoteQuantities({});
      }
      const stockText = createdMovementIds.size > 0 ? ", stock devuelto" : "";
      Alert.alert(explainSriResult(sriResult).title, finalCreditNote.status === "AUTORIZADA" ? `Nota de credito autorizada${stockText}${creditNoteEmailSent ? " y enviada al correo del cliente" : ""}.` : sriUserMessage(sriResult));
    } catch (error) {
      Alert.alert("Respuesta SRI no aplicada", error instanceof Error ? error.message : "La respuesta del SRI requiere revision antes de continuar.");
    } finally {
      setRetryingSaleId("");
      setIssuingCreditNote(false);
      setProcessingMessage("");
    }
  };

  return {
    closeCreditNoteForm,
    fillCreditNoteTotal,
    issueCreditNote,
    openCreditNoteForm
  };
}
