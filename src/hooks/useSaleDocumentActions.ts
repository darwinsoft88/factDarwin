import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useEffect, useRef, useState } from "react";
import { Alert, Linking, Platform } from "react-native";
import { sendInvoiceEmail } from "../services/backend";
import { buildRideHtml } from "../sri/ride";
import { buildCreditNoteXml, buildInvoiceXml, money } from "../sri";
import { AppData, Client, Sale, User } from "../types";
import { appendAudit } from "../utils/audit";
import { resolveCompanyLogoUrl } from "../utils/assets";
import { showError, showInfo, showSuccess, showWarning } from "../utils/dialogs";
import { buildCreditNoteRideHtml, buildInternalTicketHtml, buildProformaHtml } from "../utils/documentHtml";
import { issuerForSale } from "../utils/establishments";
import { createPdfBase64, estimateTicketPageHeightMm, handlePdfDocument, handleThermalPdfDocument, openHtmlViewer } from "../utils/printFiles";
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

  const createRide = async (sale: Sale, client: Client) => {
    if (sale.status !== "AUTORIZADA") {
      Alert.alert("RIDE no disponible", "El RIDE se genera cuando la factura esta autorizada.");
      return;
    }

    const html = buildRideHtml(sale, client, issuerForDocument(data, sale));

    if (typeof window !== "undefined" && "document" in window) {
      openHtmlViewer(html, `RIDE ${sale.sequence}`);
      return;
    }

    await handlePdfDocument(html, `RIDE ${sale.sequence}`, "RIDE factura");
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

  const createCreditNoteRide = async (sale: Sale, client: Client, source?: Sale) => {
    if (sale.status !== "AUTORIZADA") {
      Alert.alert("RIDE no disponible", "La nota de credito debe estar autorizada.");
      return;
    }

    const html = buildCreditNoteRideHtml(sale, client, issuerForDocument(data, sale), source);
    if (Platform.OS === "web") {
      openHtmlViewer(html, `Nota credito ${sale.sequence}`);
      return;
    }

    await handlePdfDocument(html, `Nota credito ${sale.sequence}`, "Nota de credito");
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

  const sendSaleEmail = async (sale: Sale, client: Client, source?: Sale, showAlerts = true) => {
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
    const documentTitle = isCreditNote ? "Nota de credito" : "Factura";
    const saleIssuer = issuerForDocument(data, sale);
    const documentNumber = `${saleIssuer.establishment}-${saleIssuer.emissionPoint}-${sale.sequence}`;

    sendingEmailRef.current = true;
    if (mountedRef.current) {
      setSendingEmailSaleId(sale.id);
      setProcessingMessage(`Enviando ${documentLabel} al correo del cliente...`);
    }
    try {
      const rideHtml = isCreditNote ? buildCreditNoteRideHtml(sale, client, saleIssuer, source) : buildRideHtml(sale, client, saleIssuer);
      const pdfBase64 = await createPdfBase64(rideHtml);
      await sendInvoiceEmail(data.backendUrl, {
        to: client.email,
        subject: `${documentTitle} ${documentNumber}`,
        html: rideHtml,
        pdfBase64,
        xml: sale.authorizedXml || sale.signedXml || (isCreditNote ? buildCreditNoteXml(sale, client, saleIssuer) : buildInvoiceXml(sale, client, saleIssuer)),
        documentType: isCreditNote ? "nota_credito" : "factura",
        documentNumber
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
    await sendSaleEmail(sale, client, data.sales.find((item) => item.id === sale.sourceSaleId));
  };

  const whatsappSale = async (sale: Sale, client: Client) => {
    if (!client.phone) {
      Alert.alert("Cliente sin telefono", "Agregue el numero de telefono del cliente.");
      return;
    }

    const saleIssuer = issuerForDocument(data, sale);
    const html = buildRideHtml(sale, client, saleIssuer);

    if (Platform.OS === "web") {
      openHtmlViewer(html, `RIDE ${sale.sequence}`);
      return;
    }

    const file = await Print.printToFileAsync({ html, base64: false });

    if (!(await Sharing.isAvailableAsync())) {
      const phone = client.phone.replace(/\D/g, "");
      const message = [
        `Hola ${client.name},`,
        `Su factura ${saleIssuer.establishment}-${saleIssuer.emissionPoint}-${sale.sequence} fue autorizada por el SRI.`,
        `Total: $${money(sale.total)}`,
        `Autorizacion: ${sale.authorizationNumber || sale.accessKey}`
      ].join("\n");
      await Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
      return;
    }

    await Sharing.shareAsync(file.uri, {
      mimeType: "application/pdf",
      dialogTitle: "Enviar RIDE por WhatsApp",
      UTI: "com.adobe.pdf"
    });
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
