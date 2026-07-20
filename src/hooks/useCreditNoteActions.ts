import React from "react";
import { Alert } from "react-native";
import { authorizeInvoice, reserveDocumentSequence } from "../services/backend";
import { buildCreditNoteXml, calculateTotals, createCreditNoteAccessKey, nextSequence } from "../sri";
import { AppData, Client, InventoryMovement, Sale, User } from "../types";
import { appendAudit } from "../utils/audit";
import { isInventoryProduct } from "../utils/catalogItems";
import { isAccessKeyUsed, resolveInvoiceStatus } from "../utils/documents";
import { showMessage } from "../utils/dialogs";
import { activeEstablishment, issuerForSale, updateIssuerEstablishmentSequence } from "../utils/establishments";
import { formatSriDate } from "../utils/format";
import { generateId } from "../utils/id";
import { buildCreditNoteItemsFromQuantities, formatQuantity, getCreditLineAvailable, getCreditLineKey, hasCreditNoteBalance, isFinalConsumerClient, isInvoiceSale, validateCreditNoteQuantities } from "../utils/sales";
import { explainSriResult, sriUserMessage } from "../utils/sriMessages";
import { syncSalePatchToBackend } from "../utils/sync";
import { validateEmissionPointLicense } from "../validation";

const uid = generateId;

type UseCreditNoteActionsParams = {
  backendToken: string;
  creditNoteClient?: Client;
  creditNoteQuantities: Record<string, string>;
  creditNoteReason: string;
  creditNoteSource?: Sale;
  data: AppData;
  issuingCreditNote: boolean;
  persist: (data: AppData) => Promise<void>;
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
  persist,
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
    const sourceSale = creditNoteSource;
    const client = creditNoteClient;
    if (!sourceSale || !client) {
      Alert.alert("Nota de credito no disponible", "No se encontro la factura o el cliente de origen.");
      return;
    }
    if (!isInvoiceSale(sourceSale) || sourceSale.status !== "AUTORIZADA") {
      Alert.alert("Nota de credito no disponible", "Solo se puede emitir nota de credito sobre facturas autorizadas.");
      return;
    }
    if (isFinalConsumerClient(client)) {
      Alert.alert("Nota de credito no disponible", "No se puede emitir nota de credito para facturas a consumidor final. La factura debe tener datos de cliente con cedula, RUC, pasaporte o identificacion exterior.");
      return;
    }

    const reason = creditNoteReason.trim();
    if (!reason) {
      Alert.alert("Motivo requerido", "Ingrese el motivo de la nota de credito.");
      return;
    }

    const validationErrors = validateCreditNoteQuantities(sourceSale, data.sales, creditNoteQuantities);
    if (validationErrors.length > 0) {
      Alert.alert("Revise cantidades", validationErrors.join("\n"));
      return;
    }

    const creditItems = buildCreditNoteItemsFromQuantities(sourceSale, data.sales, creditNoteQuantities);
    if (creditItems.length === 0) {
      Alert.alert("Seleccione productos", "Ingrese una cantidad mayor a cero en al menos un producto o servicio.");
      return;
    }

    const creditTotals = calculateTotals(creditItems);

    const createdAt = new Date().toISOString();
    const documentIssuer = issuerForSale(data.issuer, sourceSale);
    const documentEstablishment = {
      ...activeEstablishment(data.issuer),
      id: `${documentIssuer.establishment}-${documentIssuer.emissionPoint}`,
      name: sourceSale.establishmentName || `${documentIssuer.establishment}-${documentIssuer.emissionPoint}`,
      establishment: documentIssuer.establishment,
      emissionPoint: documentIssuer.emissionPoint
    };
    const licenseErrors: string[] = [];
    validateEmissionPointLicense(data, documentIssuer, licenseErrors);
    if (licenseErrors.length > 0) {
      const message = licenseErrors.join("\n");
      showMessage("Plan requerido", message);
      return;
    }
    let sequence = nextSequence(documentIssuer.creditNoteSequential || 1);
    let accessKey = createCreditNoteAccessKey(new Date(createdAt), documentIssuer, sequence);
    try {
      setProcessingMessage("Preparando numero de nota de credito...");
      const reserved = await reserveDocumentSequence(data.backendUrl, { documentType: "nota_credito", issuer: documentIssuer, createdAt }, backendToken);
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
    const supportDocumentNumber = `${documentIssuer.establishment}-${documentIssuer.emissionPoint}-${sourceSale.sequence}`;
    const creditNote: Sale = {
      id: uid(),
      documentType: "nota_credito",
      establishment: documentIssuer.establishment,
      emissionPoint: documentIssuer.emissionPoint,
      establishmentName: documentEstablishment.name,
      sourceSaleId: sourceSale.id,
      clientId: sourceSale.clientId,
      userId: user.id,
      createdAt,
      sequence,
      accessKey,
      subtotal: creditTotals.subtotal,
      tax: creditTotals.tax,
      total: creditTotals.total,
      paymentMethod: sourceSale.paymentMethod || "01",
      status: "BORRADOR",
      items: creditItems,
      supportDocumentType: "01",
      supportDocumentNumber,
      supportAuthorizationNumber: sourceSale.authorizationNumber || sourceSale.accessKey,
      supportIssueDate: formatSriDate(new Date(sourceSale.createdAt)),
      creditReason: reason
    };

    if (isAccessKeyUsed(data, creditNote.accessKey)) {
      Alert.alert("Clave duplicada", `La clave de acceso ${creditNote.accessKey} ya existe. Revise el secuencial de notas de credito.`);
      return;
    }

    const xml = buildCreditNoteXml(creditNote, client, documentIssuer);
    setRetryingSaleId(sourceSale.id);
    setIssuingCreditNote(true);
    setProcessingMessage("Emitiendo nota de credito...");
    const draftData: AppData = {
      ...data,
      issuer: updateIssuerEstablishmentSequence(data.issuer, documentEstablishment.id, "creditNoteSequential", Math.max((documentIssuer.creditNoteSequential || 1) + 1, Number(sequence) + 1)),
      sales: [creditNote, ...data.sales]
    };
    await persist(draftData);

    try {
      const sriResult = await authorizeInvoice(data.backendUrl, xml, backendToken);
      const finalCreditNote: Sale = {
        ...creditNote,
        accessKey: sriResult.accessKey || creditNote.accessKey,
        authorizationNumber: sriResult.authorizationNumber,
        authorizationDate: sriResult.authorizationDate,
        sriEnvironment: sriResult.sriEnvironment,
        sriMessage: sriResult.sriMessage,
        signedXml: sriResult.signedXml,
        authorizedXml: sriResult.authorizedXml,
        status: resolveInvoiceStatus(sriResult)
      };
      const stockMovements: InventoryMovement[] = [];
      const nextProducts = finalCreditNote.status === "AUTORIZADA"
        ? data.products.map((product) => {
            if (!isInventoryProduct(product)) return product;
            const returnedQuantity = finalCreditNote.items.filter((item) => isInventoryProduct(item) && item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
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
              reason: `Nota de credito ${finalCreditNote.sequence}`,
              reference: sourceSale.sequence,
              userId: user.id,
              createdAt
            });
            return { ...product, stock: stockAfter, updatedAt: createdAt };
          })
        : data.products;
      const finalSales = draftData.sales.map((sale) => (sale.id === finalCreditNote.id ? finalCreditNote : sale));
      const fullyCredited = finalCreditNote.status === "AUTORIZADA" && !hasCreditNoteBalance(finalSales, sourceSale);

      const patchedSales = finalSales.map((sale) => {
        if (sale.id === finalCreditNote.id) return finalCreditNote;
        if (sale.id === sourceSale.id && fullyCredited) {
          return { ...sale, voidReason: `Compensada con nota de credito ${finalCreditNote.sequence}: ${reason}`, voidedAt: createdAt };
        }
        return sale;
      });
      const finalData = appendAudit({
        ...draftData,
        products: nextProducts,
        inventoryMovements: [...stockMovements, ...(draftData.inventoryMovements || [])],
        sales: patchedSales
      }, user, "CREDIT_NOTE_CREATED", "sale", finalCreditNote.id, `Nota de credito ${finalCreditNote.sequence} para factura ${sourceSale.sequence}: ${finalCreditNote.status}`, { sourceSaleId: sourceSale.id, total: finalCreditNote.total, status: finalCreditNote.status });
      await persist(finalData);
      await syncSalePatchToBackend(data.backendUrl, backendToken, {
        baseData: data,
        issuer: finalData.issuer,
        sales: patchedSales.filter((sale) => [finalCreditNote.id, sourceSale.id].includes(sale.id)),
        products: finalData.products.filter((product) => stockMovements.some((movement) => movement.productId === product.id)),
        inventoryMovements: stockMovements,
        auditLogs: finalData.auditLogs.slice(0, 1)
      }, finalData, persist);
      let creditNoteEmailSent = false;
      if (finalCreditNote.status === "AUTORIZADA") {
        creditNoteEmailSent = await sendSaleEmail(finalCreditNote, client, sourceSale, false);
        setCreditNoteSourceId("");
        setCreditNoteReason("Devolucion parcial");
        setCreditNoteQuantities({});
      }
      const stockText = stockMovements.length > 0 ? ", stock devuelto" : "";
      Alert.alert(explainSriResult(sriResult).title, finalCreditNote.status === "AUTORIZADA" ? `Nota de credito autorizada${stockText}${creditNoteEmailSent ? " y enviada al correo del cliente" : ""}.` : sriUserMessage(sriResult));
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo emitir la nota de credito.";
      const failedCreditNote: Sale = { ...creditNote, status: "ERROR_SRI", sriMessage: message, signedXml: xml };
      const failedData = appendAudit({
        ...draftData,
        sales: draftData.sales.map((sale) => (sale.id === creditNote.id ? failedCreditNote : sale))
      }, user, "CREDIT_NOTE_FAILED", "sale", creditNote.id, `Nota de credito ${creditNote.sequence} rechazada`, { error: message });
      await persist(failedData);
      await syncSalePatchToBackend(data.backendUrl, backendToken, {
        baseData: data,
        issuer: failedData.issuer,
        sales: [failedCreditNote],
        auditLogs: failedData.auditLogs.slice(0, 1)
      }, failedData, persist);
      Alert.alert("Nota de credito rechazada", message);
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
