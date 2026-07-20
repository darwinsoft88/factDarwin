import { useCallback } from "react";
import { Alert, Platform } from "react-native";
import { AppData, CreditPayment } from "../types";
import { buildCreditPaymentReceiptHtml, buildCreditPaymentsReceiptHtml, buildCreditSaleDetailTicketHtml, estimateCreditPaymentReceiptHeightMm, estimateCreditPaymentsReceiptHeightMm, estimateCreditSaleDetailHeightMm } from "../utils/creditReceipt";
import { documentNumber } from "../utils/documents";
import { createThermalPdfFile, handleThermalPdfDocument, openHtmlViewer, openPdfFile, shareGeneratedFile } from "../utils/printFiles";

function buildPaymentReceiptPayload(payment: CreditPayment, sourceData: AppData) {
  const sale = sourceData.sales.find((item) => item.id === payment.saleId);
  const client = sourceData.clients.find((item) => item.id === payment.clientId);
  if (!sale || !client) return null;
  const title = `Recibo ${documentNumber(sale, sourceData.issuer)}`;
  const html = buildCreditPaymentReceiptHtml({ client, issuer: sourceData.issuer, payment, sale });
  const height = estimateCreditPaymentReceiptHeightMm({ client, payment });
  return { html, title, height };
}

function buildBulkReceiptPayload(payments: CreditPayment[], sourceData: AppData) {
  const firstPayment = payments[0];
  const client = firstPayment ? sourceData.clients.find((item) => item.id === firstPayment.clientId) : undefined;
  const saleIds = new Set(payments.map((payment) => payment.saleId));
  const sales = sourceData.sales.filter((sale) => saleIds.has(sale.id));
  if (!firstPayment || !client || sales.length === 0) return null;
  const title = `Comprobante cobro ${client.name}`;
  const html = buildCreditPaymentsReceiptHtml({ client, issuer: sourceData.issuer, payments, sales });
  const height = estimateCreditPaymentsReceiptHeightMm({ client, payments });
  return { html, title, height };
}

export function useCreditReceipts(data: AppData) {
  const openCreditSaleDetail = useCallback(async (saleId: string, sourceData = data) => {
    const sale = sourceData.sales.find((item) => item.id === saleId);
    const client = sale ? sourceData.clients.find((item) => item.id === sale.clientId) : undefined;
    if (!sale || !client) {
      Alert.alert("Detalle no disponible", "No se encontro la factura o cliente de esta cuenta.");
      return;
    }
    const title = `Detalle ${documentNumber(sale, sourceData.issuer)}`;
    const html = buildCreditSaleDetailTicketHtml({ client, issuer: sourceData.issuer, sale });
    if (Platform.OS === "web") {
      openHtmlViewer(html, title);
      return;
    }
    await handleThermalPdfDocument(html, "Detalle de cuenta", title, estimateCreditSaleDetailHeightMm({ client, sale }));
  }, [data]);

  const openPaymentReceipt = useCallback(async (payment: CreditPayment, sourceData = data) => {
    const payload = buildPaymentReceiptPayload(payment, sourceData);
    if (!payload) {
      Alert.alert("Recibo no disponible", "No se encontro la factura o cliente de este abono.");
      return;
    }
    if (Platform.OS === "web") {
      openHtmlViewer(payload.html, payload.title);
      return;
    }
    await handleThermalPdfDocument(payload.html, "Recibo de abono", payload.title, payload.height);
  }, [data]);

  const openBulkPaymentReceipt = useCallback(async (payments: CreditPayment[], sourceData = data) => {
    const payload = buildBulkReceiptPayload(payments, sourceData);
    if (!payload) {
      Alert.alert("Comprobante no disponible", "No se encontro la informacion del cobro.");
      return;
    }
    if (Platform.OS === "web") {
      openHtmlViewer(payload.html, payload.title);
      return;
    }
    await handleThermalPdfDocument(payload.html, "Comprobante de cobro", payload.title, payload.height);
  }, [data]);

  const viewPaymentReceipt = useCallback(async (payment: CreditPayment, sourceData = data) => {
    const payload = buildPaymentReceiptPayload(payment, sourceData);
    if (!payload) {
      Alert.alert("Recibo no disponible", "No se encontro la factura o cliente de este abono.");
      return;
    }
    if (Platform.OS === "web") {
      openHtmlViewer(payload.html, payload.title);
      return;
    }
    const uri = await createThermalPdfFile(payload.html, payload.title, payload.height);
    await openPdfFile(uri, payload.title);
  }, [data]);

  const sharePaymentReceipt = useCallback(async (payment: CreditPayment, sourceData = data) => {
    const payload = buildPaymentReceiptPayload(payment, sourceData);
    if (!payload) {
      Alert.alert("Recibo no disponible", "No se encontro la factura o cliente de este abono.");
      return;
    }
    if (Platform.OS === "web") {
      openHtmlViewer(payload.html, payload.title);
      return;
    }
    const uri = await createThermalPdfFile(payload.html, payload.title, payload.height);
    await shareGeneratedFile(uri, "application/pdf", "Compartir recibo de abono", payload.title);
  }, [data]);

  const viewBulkPaymentReceipt = useCallback(async (payments: CreditPayment[], sourceData = data) => {
    const payload = buildBulkReceiptPayload(payments, sourceData);
    if (!payload) {
      Alert.alert("Comprobante no disponible", "No se encontro la informacion del cobro.");
      return;
    }
    if (Platform.OS === "web") {
      openHtmlViewer(payload.html, payload.title);
      return;
    }
    const uri = await createThermalPdfFile(payload.html, payload.title, payload.height);
    await openPdfFile(uri, payload.title);
  }, [data]);

  const shareBulkPaymentReceipt = useCallback(async (payments: CreditPayment[], sourceData = data) => {
    const payload = buildBulkReceiptPayload(payments, sourceData);
    if (!payload) {
      Alert.alert("Comprobante no disponible", "No se encontro la informacion del cobro.");
      return;
    }
    if (Platform.OS === "web") {
      openHtmlViewer(payload.html, payload.title);
      return;
    }
    const uri = await createThermalPdfFile(payload.html, payload.title, payload.height);
    await shareGeneratedFile(uri, "application/pdf", "Compartir comprobante de cobro", payload.title);
  }, [data]);

  return {
    openBulkPaymentReceipt,
    openCreditSaleDetail,
    openPaymentReceipt,
    shareBulkPaymentReceipt,
    sharePaymentReceipt,
    viewBulkPaymentReceipt,
    viewPaymentReceipt
  };
}
