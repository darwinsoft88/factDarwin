import React from "react";
import { Alert } from "react-native";
import { AppData, ReceivedRetention, RetentionTaxType, Sale, User } from "../types";
import { appendAudit } from "../utils/audit";
import { showMessage } from "../utils/dialogs";
import { parseInputDate, toInputDate } from "../utils/format";
import { generateId } from "../utils/id";
import { parseDecimal, roundMoney } from "../utils/numbers";
import { isInvoiceSale } from "../utils/sales";
import { money } from "../sri";
import { syncPatchToBackend } from "../utils/sync";

const uid = generateId;

type RetentionClient = {
  id: string;
  name: string;
};

type UseReceivedRetentionActionsParams = {
  backendToken: string;
  data: AppData;
  persist: (data: AppData) => Promise<void>;
  retentionAmount: string;
  retentionAuthorizationNumber: string;
  retentionBase: string;
  retentionClient?: RetentionClient;
  retentionDocumentNumber: string;
  retentionNotes: string;
  retentionPercentage: string;
  retentionReceivedAt: string;
  retentionSale?: Sale;
  retentionTaxType: RetentionTaxType;
  user: User;
  setRetentionAmount: React.Dispatch<React.SetStateAction<string>>;
  setRetentionAuthorizationNumber: React.Dispatch<React.SetStateAction<string>>;
  setRetentionBase: React.Dispatch<React.SetStateAction<string>>;
  setRetentionDocumentNumber: React.Dispatch<React.SetStateAction<string>>;
  setRetentionNotes: React.Dispatch<React.SetStateAction<string>>;
  setRetentionPercentage: React.Dispatch<React.SetStateAction<string>>;
  setRetentionReceivedAt: React.Dispatch<React.SetStateAction<string>>;
  setRetentionSaleId: React.Dispatch<React.SetStateAction<string>>;
  setRetentionTaxType: React.Dispatch<React.SetStateAction<RetentionTaxType>>;
};

export function useReceivedRetentionActions({
  backendToken,
  data,
  persist,
  retentionAmount,
  retentionAuthorizationNumber,
  retentionBase,
  retentionClient,
  retentionDocumentNumber,
  retentionNotes,
  retentionPercentage,
  retentionReceivedAt,
  retentionSale,
  retentionTaxType,
  setRetentionAmount,
  setRetentionAuthorizationNumber,
  setRetentionBase,
  setRetentionDocumentNumber,
  setRetentionNotes,
  setRetentionPercentage,
  setRetentionReceivedAt,
  setRetentionSaleId,
  setRetentionTaxType,
  user
}: UseReceivedRetentionActionsParams) {
  const openRetentionForm = (sale: Sale) => {
    if (!isInvoiceSale(sale) || sale.status !== "AUTORIZADA") {
      Alert.alert("Retencion no disponible", "Solo se registran retenciones sobre facturas autorizadas.");
      return;
    }

    setRetentionSaleId(sale.id);
    setRetentionTaxType("IVA");
    setRetentionBase(money(sale.tax));
    setRetentionPercentage("");
    setRetentionAmount("");
    setRetentionDocumentNumber("");
    setRetentionAuthorizationNumber("");
    setRetentionReceivedAt(toInputDate(new Date()));
    setRetentionNotes("");
  };

  const closeRetentionForm = () => {
    setRetentionSaleId("");
  };

  const saveReceivedRetention = async () => {
    if (!retentionSale || !retentionClient) {
      Alert.alert("Retencion no disponible", "No se encontro la factura o el cliente.");
      return;
    }

    const base = roundMoney(parseDecimal(retentionBase || "0"));
    const percentage = roundMoney(parseDecimal(retentionPercentage || "0"));
    const calculatedAmount = roundMoney(base * (percentage / 100));
    const amount = roundMoney(parseDecimal(retentionAmount || String(calculatedAmount)));
    const receivedDate = parseInputDate(retentionReceivedAt, "start");

    if (!retentionDocumentNumber.trim()) {
      Alert.alert("Comprobante requerido", "Ingrese el numero del comprobante de retencion recibido.");
      return;
    }
    if (!receivedDate) {
      Alert.alert("Fecha invalida", "Ingrese la fecha en formato YYYY-MM-DD.");
      return;
    }
    if (base <= 0 || percentage <= 0 || amount <= 0) {
      Alert.alert("Valores invalidos", "Base, porcentaje y valor retenido deben ser mayores a cero.");
      return;
    }

    const retention: ReceivedRetention = {
      id: uid(),
      saleId: retentionSale.id,
      clientId: retentionClient.id,
      userId: user.id,
      createdAt: new Date().toISOString(),
      receivedAt: receivedDate.toISOString(),
      documentNumber: retentionDocumentNumber.trim(),
      authorizationNumber: retentionAuthorizationNumber.trim(),
      taxType: retentionTaxType,
      base,
      percentage,
      amount,
      notes: retentionNotes.trim()
    };

    const nextData = appendAudit({
      ...data,
      receivedRetentions: [retention, ...(data.receivedRetentions || [])]
    }, user, "RETENTION_RECEIVED_CREATED", "retention", retention.id, `Retencion recibida ${retention.taxType} $${money(retention.amount)} para factura ${retentionSale.sequence}`, { saleId: retentionSale.id, documentNumber: retention.documentNumber });
    await persist(nextData);
    await syncPatchToBackend(data.backendUrl, backendToken, {
      baseData: data,
      receivedRetentions: [retention],
      auditLogs: nextData.auditLogs.slice(0, 1)
    }, "Retencion pendiente de sincronizar", nextData, persist);

    closeRetentionForm();
    showMessage("Retencion guardada", `Se registro una retencion de ${retention.taxType} por $${money(retention.amount)}.`);
  };

  return {
    closeRetentionForm,
    openRetentionForm,
    saveReceivedRetention
  };
}
