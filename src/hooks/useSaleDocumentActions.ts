import * as Sharing from "expo-sharing";
import React, { useEffect, useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { sendInvoiceEmail } from "../services/backend";
import { getCachedDocumentRide, waitForDocumentSync } from "../services/documentRideCoordinator";
import { AppData, Client, Sale, User } from "../types";
import { appendAudit } from "../utils/audit";
import { resolveCompanyLogoUrl } from "../utils/assets";
import { showError, showInfo, showSuccess, showWarning } from "../utils/dialogs";
import { buildInternalTicketHtml, buildProformaHtml } from "../utils/documentHtml";
import { issuerForSale } from "../utils/establishments";
import { estimateTicketPageHeightMm, handlePdfDocument, handleThermalPdfDocument, openHtmlViewer, openPdfFile } from "../utils/printFiles";
import { isCreditNoteSale } from "../utils/sales";
import { syncPatchToBackendResult } from "../utils/sync";
import { isValidEmail } from "../validation";

type UseSaleDocumentActionsParams = {
  backendToken: string;
  data: AppData;
  persist: (data: AppData, options?: { skipAutoBackup?: boolean; syncState?: "pending" | "syncing" | "synced" | "error" }) => Promise<void>;
  setProcessingMessage: React.Dispatch<React.SetStateAction<string>>;
  user: User;
};

function issuerForDocument(data: AppData, sale: Sale) {
  const issuer = issuerForSale(data.issuer, sale);
  return {
    ...issuer,
    logoUrl: resolveCompanyLogoUrl(issuer.logoUrl, data.backendUrl)
  };
}

export function useSaleDocumentActions({
  backendToken,
  data,
  persist,
  setProcessingMessage,
  user
}: UseSaleDocumentActionsParams) {
  const [sendingEmailSaleId, setSendingEmailSaleId] = useState("");
  const mountedRef = useRef(false);
  const sendingEmailRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const createRide = async (sale: Sale, _client: Client) => {
    if (sale.status !== "AUTORIZADA") {
      Alert.alert("RIDE no disponible", "El RIDE se genera cuando la factura esta autorizada.");
      return;
    }

    await openBackendRide(sale);
  };

  const createTicket = async (sale: Sale, client: Client) => {
    const pageHeightMm = estimateTicketPageHeightMm(sale);
    const html = buildInternalTicketHtml(sale, client, issuerForDocument(data, sale), pageHeightMm);

    if (typeof window !== "undefined" && "document" in window) {
      openHtmlViewer(html, `Ticket ${sale.sequence}`);
      return;
    }

    await handleThermalPdfDocument(html, `Ticket ${sale.sequence}`, "Nota de venta 80mm", pageHeightMm);
  };

  const createProforma = async (sale: Sale, client: Client) => {
    const html = buildProformaHtml(sale, client, issuerForDocument(data, sale));

    if (typeof window !== "undefined" && "document" in window) {
      openHtmlViewer(html, `Proforma ${sale.sequence}`);
      return;
    }

    await handlePdfDocument(html, `Proforma ${sale.sequence}`, "Proforma");
  };

  const createCreditNoteRide = async (sale: Sale, _client: Client, _source?: Sale) => {
    if (sale.status !== "AUTORIZADA") {
      Alert.alert("RIDE no disponible", "La nota de credito debe estar autorizada.");
      return;
    }

    await openBackendRide(sale);
  };

  const openBackendRide = async (sale: Sale) => {
    const isCreditNote = isCreditNoteSale(sale);
    const documentType = isCreditNote ? "nota_credito" : "factura";
    const pendingWindow = Platform.OS === "web" && typeof window !== "undefined" ? window.open("", "_blank") : null;
    try {
      const ready = await waitForDocumentSync(data.backendUrl, sale.id, documentType);
      if (!ready) throw new Error("El documento está guardado y su sincronización continúa pendiente. Intente compartirlo nuevamente en unos segundos.");
      const ride = await getCachedDocumentRide(data.backendUrl, {
        documentId: sale.id,
        documentType
      }, backendToken);
      if (Platform.OS === "web") {
        const binary = atob(ride.pdfBase64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        const url = URL.createObjectURL(new Blob([bytes], { type: ride.mimeType }));
        if (pendingWindow) pendingWindow.location.href = url;
        else window.open(url, "_blank");
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
        return;
      }
      const baseDirectory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      if (!baseDirectory) throw new Error("No existe una ubicacion disponible para abrir el RIDE.");
      const uri = `${baseDirectory}${ride.filename.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      await FileSystem.writeAsStringAsync(uri, ride.pdfBase64, { encoding: FileSystem.EncodingType.Base64 });
      await openPdfFile(uri, isCreditNote ? "RIDE nota de credito" : "RIDE factura");
    } catch (error) {
      pendingWindow?.close();
      showError("RIDE no disponible", error instanceof Error ? error.message : "No se pudo obtener el RIDE.");
    }
  };

  const recordSaleEmailAttempt = async (sale: Sale, to: string, status: "sent" | "failed", error = "") => {
    if (!data.sales.some((item) => item.id === sale.id)) return false;
    const sentAt = new Date().toISOString();
    const updatedSale: Sale = {
      ...sale,
      emailHistory: [{ to, sentAt, status, error: error || undefined }, ...(sale.emailHistory || [])].slice(0, 20)
    };
    const nextData = appendAudit({
      ...data,
      sales: data.sales.map((item) => (item.id === sale.id ? updatedSale : item))
    }, user, status === "sent" ? "EMAIL_SENT" : "EMAIL_FAILED", "sale", sale.id, status === "sent" ? `Correo enviado a ${to}` : `Correo fallido a ${to}`, { to, error });
    const patch = {
      baseData: data,
      sales: [updatedSale],
      auditLogs: nextData.auditLogs.slice(0, 1)
    };
    const syncResult = await syncPatchToBackendResult(data.backendUrl, backendToken, patch, "Historial de correo pendiente de sincronizar");
    if (!syncResult.confirmed || syncResult.localCleanupPending) return false;
    await persist(nextData, { skipAutoBackup: true, syncState: "synced" });
    return true;
  };

  const sendSaleEmail = async (sale: Sale, client: Client, showAlerts = true) => {
    if (sendingEmailRef.current) return false;

    if (sale.status !== "AUTORIZADA") {
      if (showAlerts) showInfo("Correo no disponible", "Solo se envia cuando el documento esta autorizado.");
      return false;
    }

    if (!client.email) {
      if (showAlerts) showInfo("Cliente sin correo", "Agregue un correo al cliente antes de enviar el documento.");
      return false;
    }

    if (!isValidEmail(client.email)) {
      if (showAlerts) showWarning("Correo invalido", "El correo registrado para el cliente no tiene un formato valido.");
      return false;
    }

    const isCreditNote = isCreditNoteSale(sale);
    const documentLabel = isCreditNote ? "nota de credito" : "factura";
    const saleIssuer = issuerForDocument(data, sale);
    const documentNumber = `${saleIssuer.establishment}-${saleIssuer.emissionPoint}-${sale.sequence}`;

    sendingEmailRef.current = true;
    if (mountedRef.current) {
      setSendingEmailSaleId(sale.id);
      setProcessingMessage(`Enviando ${documentLabel} al correo del cliente...`);
    }
    try {
      await sendInvoiceEmail(data.backendUrl, {
        to: client.email,
        documentId: sale.id,
        documentType: isCreditNote ? "nota_credito" : "factura",
      }, backendToken);
      let historySaved = false;
      try {
        historySaved = await recordSaleEmailAttempt(sale, client.email, "sent");
      } catch {
        historySaved = false;
      }
      if (showAlerts) {
        if (historySaved) {
          showSuccess("Correo aceptado para envio", `El servidor de correo acepto la ${documentLabel} ${documentNumber} para ${client.email}.`);
        } else {
          showWarning("Correo aceptado; historial pendiente", `El servidor de correo acepto el mensaje para ${client.email}, pero no se pudo actualizar el historial. Se recuperara al sincronizar.`);
        }
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo enviar el correo.";
      try {
        await recordSaleEmailAttempt(sale, client.email, "failed", message);
      } catch {
        // El fallo del historial no debe reemplazar el resultado principal del envio.
      }
      if (showAlerts) showError("Correo no enviado", message);
      return false;
    } finally {
      sendingEmailRef.current = false;
      if (mountedRef.current) {
        setSendingEmailSaleId("");
        setProcessingMessage("");
      }
    }
  };

  const emailSale = async (sale: Sale, client: Client) => {
    await sendSaleEmail(sale, client);
  };

  const whatsappSale = async (sale: Sale, client: Client) => {
    if (!client.phone) {
      Alert.alert("Cliente sin telefono", "Agregue el numero de telefono del cliente.");
      return;
    }

    if (sale.status !== "AUTORIZADA") {
      showInfo("WhatsApp no disponible", "Solo se comparte cuando el documento esta autorizado.");
      return;
    }

    try {
      const isCreditNote = isCreditNoteSale(sale);
      const documentType = isCreditNote ? "nota_credito" : "factura";
      const ready = await waitForDocumentSync(data.backendUrl, sale.id, documentType);
      if (!ready) throw new Error("El documento está guardado y su sincronización continúa pendiente. Intente compartirlo nuevamente en unos segundos.");
      const ride = await getCachedDocumentRide(data.backendUrl, {
        documentId: sale.id,
        documentType
      }, backendToken);

      if (Platform.OS === "web") {
        const binary = atob(ride.pdfBase64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        const pdfFile = new File([bytes], ride.filename, { type: ride.mimeType });
        if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [pdfFile] }))) {
          await navigator.share({ files: [pdfFile], title: `RIDE ${sale.sequence}` });
          return;
        }
        const url = URL.createObjectURL(pdfFile);
        window.open(url, "_blank");
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
        showInfo("RIDE preparado", "El navegador no permite adjuntar archivos directamente a WhatsApp. Descargue el PDF abierto y adjuntelo en la conversacion.");
        return;
      }

      const baseDirectory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      if (!baseDirectory) throw new Error("No existe una ubicacion disponible para compartir el RIDE.");
      const uri = `${baseDirectory}${ride.filename.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      await FileSystem.writeAsStringAsync(uri, ride.pdfBase64, { encoding: FileSystem.EncodingType.Base64 });
      if (!(await Sharing.isAvailableAsync())) throw new Error("Este dispositivo no permite compartir archivos.");
      await Sharing.shareAsync(uri, {
        mimeType: ride.mimeType,
        dialogTitle: "Enviar RIDE por WhatsApp",
        UTI: "com.adobe.pdf"
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      showError("No se pudo compartir", error instanceof Error ? error.message : "No se pudo preparar el RIDE para WhatsApp.");
    }
  };

  return {
    createCreditNoteRide,
    createProforma,
    createRide,
    createTicket,
    emailSale,
    sendingEmailSaleId,
    sendSaleEmail,
    whatsappSale
  };
}
