import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React from "react";
import { Alert, Linking, Platform } from "react-native";
import { sendInvoiceEmail } from "../services/backend";
import { buildRideHtml } from "../sri/ride";
import { buildCreditNoteXml, buildInvoiceXml, money } from "../sri";
import { AppData, Client, Sale, User } from "../types";
import { appendAudit } from "../utils/audit";
import { resolveCompanyLogoUrl } from "../utils/assets";
import { buildCreditNoteRideHtml, buildInternalTicketHtml, buildProformaHtml } from "../utils/documentHtml";
import { issuerForSale } from "../utils/establishments";
import { createPdfBase64, estimateTicketPageHeightMm, handlePdfDocument, handleThermalPdfDocument, openHtmlViewer } from "../utils/printFiles";
import { appendPendingSync, buildPendingSyncItem } from "../utils/pendingSync";
import { isCreditNoteSale } from "../utils/sales";
import { syncSalePatchToBackend } from "../utils/sync";

type UseSaleDocumentActionsParams = {
  backendToken: string;
  data: AppData;
  persist: (data: AppData, options?: { skipAutoBackup?: boolean; syncState?: "pending" | "syncing" | "synced" | "error" }) => Promise<void>;
  setNotice: React.Dispatch<React.SetStateAction<string>>;
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
  setNotice,
  setProcessingMessage,
  user
}: UseSaleDocumentActionsParams) {
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
    if (!data.sales.some((item) => item.id === sale.id)) return;
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
    const synced = await syncSalePatchToBackend(data.backendUrl, backendToken, patch);
    const localData = synced
      ? nextData
      : appendPendingSync(nextData, buildPendingSyncItem(patch, "Correo pendiente de sincronizar", "El correo fue procesado, pero no se pudo sincronizar el historial en este momento."));
    await persist(localData, { skipAutoBackup: synced, syncState: synced ? "synced" : "pending" });
  };

  const sendSaleEmail = async (sale: Sale, client: Client, source?: Sale, showAlerts = true) => {
    if (sale.status !== "AUTORIZADA") {
      if (showAlerts) Alert.alert("Correo no disponible", "Solo se envia cuando el documento esta autorizado.");
      return false;
    }

    if (!client.email) {
      if (showAlerts) Alert.alert("Cliente sin email", "Agregue un correo al cliente.");
      return false;
    }

    const isCreditNote = isCreditNoteSale(sale);
    const documentLabel = isCreditNote ? "nota de credito" : "factura";
    const documentTitle = isCreditNote ? "Nota de credito" : "Factura";
    const saleIssuer = issuerForDocument(data, sale);
    const documentNumber = `${saleIssuer.establishment}-${saleIssuer.emissionPoint}-${sale.sequence}`;

    try {
      setProcessingMessage(`Enviando ${documentLabel} al correo del cliente...`);
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
      const message = `La ${documentLabel} ${documentNumber} fue enviada a ${client.email} con sus documentos autorizados.`;
      await recordSaleEmailAttempt(sale, client.email, "sent");
      setNotice(message);
      if (showAlerts) {
        if (Platform.OS === "web") {
          window.alert(message);
        } else {
          Alert.alert(`${documentTitle} enviada`, message);
        }
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo enviar el correo.";
      await recordSaleEmailAttempt(sale, client.email, "failed", message);
      if (showAlerts) Alert.alert("Correo no enviado", message);
      return false;
    } finally {
      setProcessingMessage("");
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
    sendSaleEmail,
    whatsappSale
  };
}
