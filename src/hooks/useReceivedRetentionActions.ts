import React, { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { AppData, ReceivedRetention, RetentionTaxType, Sale, User } from "../types";
import { appendAudit } from "../utils/audit";
import { showError, showSuccess, showWarning } from "../utils/dialogs";
import { parseInputDate, toInputDate } from "../utils/format";
import { generateId } from "../utils/id";
import { parseDecimal, roundMoney } from "../utils/numbers";
import { isInvoiceSale } from "../utils/sales";
import { money } from "../sri";
import { syncPatchToBackendResult } from "../utils/sync";

const uid = generateId;

type RetentionSaveAttempt = {
  auditLog: AppData["auditLogs"][number];
  fingerprint: string;
  requestId: string;
  retention: ReceivedRetention;
};

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
  const [savingReceivedRetention, setSavingReceivedRetention] = useState(false);
  const mountedRef = useRef(false);
  const saveRunningRef = useRef(false);
  const saveAttemptRef = useRef<RetentionSaveAttempt | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const openRetentionForm = (sale: Sale) => {
    if (!isInvoiceSale(sale) || sale.status !== "AUTORIZADA") {
      Alert.alert("Retencion no disponible", "Solo se registran retenciones sobre facturas autorizadas.");
      return;
    }

    saveAttemptRef.current = null;
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
    if (saveRunningRef.current) return;

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

    const fingerprint = JSON.stringify({
      saleId: retentionSale.id,
      clientId: retentionClient.id,
      documentNumber: retentionDocumentNumber.trim(),
      authorizationNumber: retentionAuthorizationNumber.trim(),
      receivedAt: receivedDate.toISOString(),
      taxType: retentionTaxType,
      base,
      percentage,
      amount,
      notes: retentionNotes.trim()
    });

    saveRunningRef.current = true;
    if (mountedRef.current) setSavingReceivedRetention(true);
    try {
      let attempt = saveAttemptRef.current;
      if (!attempt || attempt.fingerprint !== fingerprint) {
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
        const auditedData = appendAudit({
          ...data,
          receivedRetentions: [retention, ...(data.receivedRetentions || [])]
        }, user, "RETENTION_RECEIVED_CREATED", "retention", retention.id, `Retencion recibida ${retention.taxType} $${money(retention.amount)} para factura ${retentionSale.sequence}`, { saleId: retentionSale.id, documentNumber: retention.documentNumber });
        const auditLog = auditedData.auditLogs[0];
        if (!auditLog) throw new Error("No se pudo preparar la auditoria de la retencion.");
        attempt = {
          auditLog,
          fingerprint,
          requestId: `sync_${uid()}`,
          retention
        };
        saveAttemptRef.current = attempt;
      }
      if (!attempt) throw new Error("No se pudo preparar el intento de guardado de la retencion.");

      const nextData = {
        ...data,
        receivedRetentions: [attempt.retention, ...(data.receivedRetentions || []).filter((item) => item.id !== attempt.retention.id)],
        auditLogs: [attempt.auditLog, ...data.auditLogs.filter((item) => item.id !== attempt.auditLog.id)]
      };
      const syncResult = await syncPatchToBackendResult(data.backendUrl, backendToken, {
        baseData: data,
        requestId: attempt.requestId,
        receivedRetentions: [attempt.retention],
        auditLogs: [attempt.auditLog]
      }, "Retencion pendiente de sincronizar");

      if (!syncResult.confirmed) {
        showWarning("Retencion no guardada", syncResult.errorMessage || "El servidor no confirmo el registro. Revise la conexion e intente nuevamente.");
        return;
      }

      if (syncResult.localCleanupPending) {
        saveAttemptRef.current = null;
        if (mountedRef.current) closeRetentionForm();
        showWarning("Retencion guardada con sincronizacion pendiente", "Retencion guardada en el servidor, pero no pudo completarse la limpieza local. Se recuperara al sincronizar.");
        return;
      }

      try {
        await persist(nextData);
      } catch {
        saveAttemptRef.current = null;
        if (mountedRef.current) closeRetentionForm();
        showWarning("Retencion guardada con sincronizacion pendiente", "Retencion guardada en el servidor, pero no pudo actualizarse el almacenamiento local. Se recuperara al sincronizar.");
        return;
      }

      saveAttemptRef.current = null;
      if (mountedRef.current) closeRetentionForm();
      showSuccess("Retencion guardada", `Se registro una retencion de ${attempt.retention.taxType} por $${money(attempt.retention.amount)}.`);
    } catch (error) {
      showError("Error al guardar", error instanceof Error ? error.message : "No se pudo guardar la retencion.");
    } finally {
      saveRunningRef.current = false;
      if (mountedRef.current) setSavingReceivedRetention(false);
    }
  };

  return {
    closeRetentionForm,
    openRetentionForm,
    saveReceivedRetention,
    savingReceivedRetention
  };
}
