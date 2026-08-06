import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { CreditAccountCard } from "../components/CreditAccountCard";
import { CreditBulkPaymentModal } from "../components/CreditBulkPaymentModal";
import { CreditDetailModal } from "../components/CreditDetailModal";
import { CreditOverviewSection, CreditStatusFilter } from "../components/CreditOverviewSection";
import { CreditPaymentModal } from "../components/CreditPaymentModal";
import { CreditPaymentSuccessModal } from "../components/CreditPaymentSuccessModal";
import { CreditListItemProps, CreditPaymentsSection } from "../components/CreditPaymentsSection";
import { Empty, Section } from "../components/common";
import { PaginationControls } from "../components/PaginationControls";
import { LIST_BATCH_SIZE } from "../constants/app";
import { useCreditReceipts } from "../hooks/useCreditReceipts";
import { useControlledCreditLedger } from "../hooks/useControlledCreditLedger";
import type { PersistMutation } from "../hooks/useSyncAndBackup";
import { restoreAppData } from "../services/backend";
import { money } from "../sri";
import { AppData, CreditPayment, PaymentMethod, Sale, User } from "../types";
import { createCreditOperationId, creditBalance, creditClientSummaries, creditPaymentsForClient, creditSaleScopeText, creditTotals, isCreditOverdue, isCreditPaymentVoided, registerCreditPayment, registerCreditPayments, voidCreditPayment } from "../utils/credit";
import { CreditScopeFilter, scopeCreditData } from "../utils/creditScope";
import { activeEstablishment } from "../utils/establishments";
import { documentNumber } from "../utils/documents";
import { formatShortDate } from "../utils/format";
import { mergeAppDataSnapshots } from "../utils/dataMerge";
import {
  confirmAction,
  showError,
  showInfo,
  showSuccess,
  showWarning,
} from "../utils/dialogs";
import { parseDecimal } from "../utils/numbers";
import { paginateItems } from "../utils/pagination";
import { syncPatchToBackend } from "../utils/sync";

type CreditReceiptSuccessState = {
  mode: "single" | "bulk";
  title: string;
  message: string;
  payments: CreditPayment[];
  data: AppData;
} | null;

function paymentLockKey(prefix: string, saleIds: string[], amount: number, paymentMethod: PaymentMethod, note: string) {
  return [
    prefix,
    saleIds.slice().sort().join(","),
    money(amount),
    paymentMethod,
    note.trim().toLowerCase()
  ].join("::");
}

type PaymentIntent = {
  fingerprint: string;
  operationId: string;
};

type BulkPaymentIntent = {
  fingerprint: string;
  batchId: string;
  batchOperationId: string;
};

type VoidPaymentIntent = {
  fingerprint: string;
  voidOperationId: string;
};

function paymentIntentFingerprint(saleIds: string[], amountText: string, paymentMethod: PaymentMethod, note: string) {
  return [saleIds.slice().sort().join(","), amountText.trim(), paymentMethod, note.trim()].join("::");
}

export function CreditsScreen({
  backendToken,
  data: sourceData,
  persistMutation,
  user,
  ListItemComponent
}: {
  backendToken: string;
  data: AppData;
  persistMutation: PersistMutation;
  user: User;
  ListItemComponent: React.ComponentType<CreditListItemProps>;
}) {
  const [localData, setLocalData] = useState<AppData | null>(null);
  const canonicalData = localData || sourceData;
  const controlledLedger = useControlledCreditLedger(canonicalData, user);
  const data = useMemo(() => ({
    ...canonicalData,
    creditPayments: controlledLedger.creditPayments,
    creditAdjustments: controlledLedger.creditAdjustments,
  }), [
    canonicalData,
    controlledLedger.creditAdjustments,
    controlledLedger.creditPayments,
  ]);
  const [selectedSaleId, setSelectedSaleId] = useState("");
  const [amountText, setAmountText] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("01");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CreditStatusFilter>("todos");
  const [detailSaleId, setDetailSaleId] = useState("");
  const [paymentSaleId, setPaymentSaleId] = useState("");
  const [bulkClientId, setBulkClientId] = useState("");
  const [bulkAmountText, setBulkAmountText] = useState("");
  const [bulkSelectedSaleIds, setBulkSelectedSaleIds] = useState<string[]>([]);
  const [bulkPaymentMethod, setBulkPaymentMethod] = useState<PaymentMethod>("01");
  const [bulkNote, setBulkNote] = useState("");
  const [clientPage, setClientPage] = useState(1);
  const [receivablePage, setReceivablePage] = useState(1);
  const [selectedPaymentsPage, setSelectedPaymentsPage] = useState(1);
  const [recentPaymentsPage, setRecentPaymentsPage] = useState(1);
  const [detailPaymentsPage, setDetailPaymentsPage] = useState(1);
  const [bulkPage, setBulkPage] = useState(1);
  const [paidHistoryOpen, setPaidHistoryOpen] = useState(false);
  const [clientSummaryOpen, setClientSummaryOpen] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<CreditScopeFilter>("active");
  const [paidHistoryPage, setPaidHistoryPage] = useState(1);
  const [receiptSuccess, setReceiptSuccess] = useState<CreditReceiptSuccessState>(null);
  const [savingPayment, setSavingPayment] = useState(false);
  const [savingBulkPayment, setSavingBulkPayment] = useState(false);
  const paymentLocksRef = useRef(new Set<string>());
  const paymentIntentRef = useRef<PaymentIntent | null>(null);
  const bulkPaymentIntentRef = useRef<BulkPaymentIntent | null>(null);
  const voidPaymentIntentRef = useRef(new Map<string, VoidPaymentIntent>());
  const paymentIntentInProgressRef = useRef(false);
  const bulkPaymentIntentInProgressRef = useRef(false);
  const { openCreditSaleDetail, openPaymentReceipt, shareBulkPaymentReceipt, sharePaymentReceipt, viewBulkPaymentReceipt, viewPaymentReceipt } = useCreditReceipts(data);
  const currentEstablishment = activeEstablishment(data.issuer);
  const scopedCreditData = useMemo(() => scopeCreditData(data, scopeFilter, currentEstablishment.id), [currentEstablishment.id, data, scopeFilter]);
  const totals = useMemo(() => creditTotals(scopedCreditData), [scopedCreditData]);
  const clientSummaries = useMemo(() => creditClientSummaries(scopedCreditData), [scopedCreditData]);
  const receivables = totals.receivables;
  const selectedSale = receivables.find((sale) => sale.id === paymentSaleId || sale.id === selectedSaleId);
  const selectedClient = selectedSale ? data.clients.find((client) => client.id === selectedSale.clientId) : undefined;
  const creditSales = useMemo(() => (scopedCreditData.sales || []).filter((sale) => sale.paymentCondition === "credito" && (sale.documentType === "factura" || sale.documentType === "nota_venta")), [scopedCreditData.sales]);
  const pendingCreditSales = creditSales.filter((sale) => creditBalance(sale) > 0 && sale.creditStatus !== "pagado");
  const paidCreditSales = creditSales.filter((sale) => creditBalance(sale) <= 0 || sale.creditStatus === "pagado");
  const filteredCreditSales = pendingCreditSales.filter((sale) => {
    const client = data.clients.find((item) => item.id === sale.clientId);
    const balance = creditBalance(sale);
    const overdue = isCreditOverdue(sale);
    const haystack = `${client?.name || ""} ${client?.identification || ""} ${sale.sequence} ${sale.accessKey}`.toLowerCase();
    if (search.trim() && !haystack.includes(search.trim().toLowerCase())) return false;
    if (statusFilter === "vencidos") return overdue;
    if (statusFilter === "por_vencer") return balance > 0 && !overdue;
    return true;
  }).sort((a, b) => {
    return new Date(a.creditDueDate || a.createdAt).getTime() - new Date(b.creditDueDate || b.createdAt).getTime();
  });
  const filteredPaidCreditSales = paidCreditSales.filter((sale) => {
    const client = data.clients.find((item) => item.id === sale.clientId);
    const haystack = `${client?.name || ""} ${client?.identification || ""} ${sale.sequence} ${sale.accessKey}`.toLowerCase();
    return !search.trim() || haystack.includes(search.trim().toLowerCase());
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const clientPagination = paginateItems(clientSummaries, clientPage, LIST_BATCH_SIZE);
  const visibleClientSummaries = clientPagination.items;
  const receivablePagination = paginateItems(filteredCreditSales, receivablePage, LIST_BATCH_SIZE);
  const visibleReceivables = receivablePagination.items;
  const paidHistoryPagination = paginateItems(filteredPaidCreditSales, paidHistoryPage, LIST_BATCH_SIZE);
  const visiblePaidHistory = paidHistoryPagination.items;
  const recentPayments = [...(scopedCreditData.creditPayments || [])];
  const recentPaymentsPagination = paginateItems(recentPayments, recentPaymentsPage, LIST_BATCH_SIZE);
  const visibleRecentPayments = recentPaymentsPagination.items;
  const selectedClientPayments = selectedClient ? creditPaymentsForClient(scopedCreditData, selectedClient.id) : [];
  const selectedPaymentsPagination = paginateItems(selectedClientPayments, selectedPaymentsPage, LIST_BATCH_SIZE);
  const visibleSelectedClientPayments = selectedPaymentsPagination.items;
  const detailSale = creditSales.find((sale) => sale.id === detailSaleId);
  const detailClient = detailSale ? data.clients.find((client) => client.id === detailSale.clientId) : undefined;
  const detailPayments = detailSale ? (scopedCreditData.creditPayments || []).filter((payment) => payment.saleId === detailSale.id) : [];
  const detailPaidAmount = detailSale ? detailPayments
    .filter((payment) => !isCreditPaymentVoided(payment))
    .reduce((sum, payment) => sum + payment.amount, 0) : 0;
  const detailPaymentsPagination = paginateItems(detailPayments, detailPaymentsPage, LIST_BATCH_SIZE);
  const visibleDetailPayments = detailPaymentsPagination.items;
  const bulkClient = bulkClientId ? data.clients.find((client) => client.id === bulkClientId) : undefined;
  const bulkSales = bulkClientId ? receivables.filter((sale) => sale.clientId === bulkClientId) : [];
  const bulkPagination = paginateItems(bulkSales, bulkPage, LIST_BATCH_SIZE);
  const visibleBulkSales = bulkPagination.items;
  const bulkSelectedTotal = bulkSales
    .filter((sale) => bulkSelectedSaleIds.includes(sale.id))
    .reduce((sum, sale) => sum + creditBalance(sale), 0);
  const upcomingTotal = Math.max(0, totals.totalPending - totals.overdueTotal);

  useEffect(() => {
    setLocalData(null);
  }, [sourceData]);

  useEffect(() => {
    setReceivablePage(1);
    setPaidHistoryPage(1);
    setClientPage(1);
    setRecentPaymentsPage(1);
  }, [search, statusFilter, scopeFilter]);

  useEffect(() => {
    setSelectedPaymentsPage(1);
  }, [selectedClient?.id]);

  useEffect(() => {
    setDetailPaymentsPage(1);
  }, [detailSaleId]);

  useEffect(() => {
    setBulkPage(1);
  }, [bulkClientId]);

  const invalidatePaymentIntent = () => {
    if (!paymentIntentInProgressRef.current) paymentIntentRef.current = null;
  };

  const invalidateBulkPaymentIntent = () => {
    if (!bulkPaymentIntentInProgressRef.current) bulkPaymentIntentRef.current = null;
  };

  const getOrCreateIndividualOperationId = (fingerprint: string) => {
    const current = paymentIntentRef.current;
    if (current?.fingerprint === fingerprint) return current.operationId;
    const operationId = createCreditOperationId("payment");
    paymentIntentRef.current = { fingerprint, operationId };
    return operationId;
  };

  const getOrCreateBatchIntentIds = (fingerprint: string) => {
    const current = bulkPaymentIntentRef.current;
    if (current?.fingerprint === fingerprint) return current;
    const intent: BulkPaymentIntent = {
      fingerprint,
      batchId: createCreditOperationId("batch"),
      batchOperationId: createCreditOperationId("batch")
    };
    bulkPaymentIntentRef.current = intent;
    return intent;
  };

  const selectSale = (sale: Sale) => {
    invalidatePaymentIntent();
    setSelectedSaleId(sale.id);
    setPaymentSaleId(sale.id);
    setAmountText(money(creditBalance(sale)));
    setNote("");
  };

  const closePaymentModal = () => {
    invalidatePaymentIntent();
    setPaymentSaleId("");
    setAmountText("");
    setNote("");
  };

  const selectClientSummary = (clientId: string) => {
    const firstSale = receivables.find((sale) => sale.clientId === clientId);
    if (firstSale) {
      setSelectedSaleId(firstSale.id);
      setDetailSaleId(firstSale.id);
    }
  };

  const openBulkPayment = (clientId: string) => {
    invalidateBulkPaymentIntent();
    const sales = receivables.filter((sale) => sale.clientId === clientId);
    const total = sales.reduce((sum, sale) => sum + creditBalance(sale), 0);
    setBulkClientId(clientId);
    setBulkSelectedSaleIds(sales.map((sale) => sale.id));
    setBulkAmountText(money(total));
    setBulkPaymentMethod("01");
    setBulkNote("");
  };

  const closeBulkPayment = () => {
    invalidateBulkPaymentIntent();
    setBulkClientId("");
    setBulkAmountText("");
    setBulkSelectedSaleIds([]);
    setBulkNote("");
  };

  const toggleBulkSale = (saleId: string) => {
    invalidateBulkPaymentIntent();
    setBulkSelectedSaleIds((current) => current.includes(saleId) ? current.filter((id) => id !== saleId) : [...current, saleId]);
  };

  const refreshCreditDataFromBackend = async () => {
    if (!data.backendUrl || !backendToken) return;
    let remoteData: AppData | undefined;
    try {
      const snapshot = await restoreAppData<AppData>(data.backendUrl, backendToken);
      if (!snapshot?.data) return;
      remoteData = snapshot.data;
    } catch {
      return;
    }
    if (!remoteData) return;
    try {
      const persisted = await persistMutation((current) => mergeAppDataSnapshots(remoteData, current));
      setLocalData(persisted);
      return persisted;
    } catch (error) {
      showError("No se pudo actualizar la cartera", error instanceof Error ? error.message : "La informacion remota no pudo guardarse localmente.");
      throw error;
    }
  };

  const savePayment = async () => {
    if (paymentIntentInProgressRef.current) return;
    const targetSale = selectedSale;
    if (!targetSale) {
      showWarning("Sin credito", "No hay una factura a credito seleccionada.");
      return;
    }

    const paymentAmount = parseDecimal(amountText || "0");
    const intentFingerprint = paymentIntentFingerprint([targetSale.id], amountText, paymentMethod, note);
    const operationId = getOrCreateIndividualOperationId(intentFingerprint);
    const lockKey = paymentLockKey("single-credit-payment", [targetSale.id], paymentAmount, paymentMethod, note);
    if (paymentLocksRef.current.has(lockKey)) return;
    paymentLocksRef.current.add(lockKey);
    setSavingPayment(true);
    paymentIntentInProgressRef.current = true;

    try {
      await refreshCreditDataFromBackend();
      const paymentId = `credit-payment:${operationId}`;
      let auditLogIds: string[] = [];
      const persisted = await persistMutation((current) => {
        const currentSale = current.sales.find((sale) => sale.id === targetSale.id);
        if (!currentSale) throw new Error("No se encontro la factura actualizada. Sincronice e intente nuevamente.");
        if (currentSale.paymentCondition !== "credito") throw new Error("La factura seleccionada ya no es una venta a credito.");
        const previousAuditIds = new Set(current.auditLogs.map((log) => log.id));
        const next = registerCreditPayment({
          amount: paymentAmount,
          data: current,
          note,
          operationId,
          paymentMethod,
          saleId: currentSale.id,
          user
        });
        auditLogIds = next.auditLogs.filter((log) => !previousAuditIds.has(log.id)).map((log) => log.id);
        return next;
      });
      paymentIntentRef.current = null;
      paymentIntentInProgressRef.current = false;
      const updatedSale = persisted.sales.find((sale) => sale.id === targetSale.id);
      const payment = persisted.creditPayments.find((item) => item.id === paymentId);
      if (!payment) throw new Error("No se pudo preparar el abono.");
      const patch = {
        baseData: persisted,
        sales: updatedSale ? [updatedSale] : [],
        creditPayments: [payment],
        auditLogs: persisted.auditLogs.filter((log) => auditLogIds.includes(log.id))
      };
      setLocalData(persisted);
      try {
        await syncPatchToBackend(persisted.backendUrl, backendToken, patch, "Abono pendiente de sincronizar", { persistMutation });
      } catch (syncError) {
        showWarning("Abono guardado", syncError instanceof Error ? syncError.message : "El abono quedo guardado, pero no pudo prepararse su sincronizacion.");
      }
      setAmountText("");
      setNote("");
      setPaymentSaleId("");
      setDetailSaleId(updatedSale?.id || detailSaleId);
      if ((updatedSale?.creditBalance || 0) <= 0) setSelectedSaleId("");
      setReceiptSuccess({
        mode: "single",
        title: "Abono registrado",
        message: updatedSale?.creditStatus === "pagado"
          ? "El credito quedo pagado por completo. Puede entregar el recibo al cliente en este momento."
          : `Abono aplicado correctamente. Saldo pendiente $${money(updatedSale?.creditBalance || 0)}.`,
        payments: [payment],
        data: persisted
      });
    } catch (error) {
      showError("Revise el abono", error instanceof Error ? error.message : "No se pudo registrar el abono.");
    } finally {
      paymentIntentInProgressRef.current = false;
      paymentLocksRef.current.delete(lockKey);
      setSavingPayment(false);
    }
  };

  const saveBulkPayment = async () => {
    if (bulkPaymentIntentInProgressRef.current) return;
    const paymentAmount = parseDecimal(bulkAmountText || money(bulkSelectedTotal));
    const intentFingerprint = paymentIntentFingerprint(bulkSelectedSaleIds, bulkAmountText, bulkPaymentMethod, bulkNote);
    const { batchId, batchOperationId } = getOrCreateBatchIntentIds(intentFingerprint);
    const lockKey = paymentLockKey("bulk-credit-payment", bulkSelectedSaleIds, paymentAmount, bulkPaymentMethod, bulkNote);
    if (paymentLocksRef.current.has(lockKey)) return;
    paymentLocksRef.current.add(lockKey);
    setSavingBulkPayment(true);
    bulkPaymentIntentInProgressRef.current = true;

    try {
      await refreshCreditDataFromBackend();
      const selectedIds = [...bulkSelectedSaleIds];
      let paymentIds: string[] = [];
      let updatedSaleIds: string[] = [];
      let auditLogIds: string[] = [];
      const persisted = await persistMutation((current) => {
        const previousAuditIds = new Set(current.auditLogs.map((log) => log.id));
        const result = registerCreditPayments({
          amount: paymentAmount,
          batchId,
          batchOperationId,
          data: current,
          note: bulkNote,
          paymentMethod: bulkPaymentMethod,
          saleIds: selectedIds,
          user
        });
        paymentIds = result.payments.map((payment) => payment.id);
        updatedSaleIds = result.sales.map((sale) => sale.id);
        auditLogIds = result.nextData.auditLogs.filter((log) => !previousAuditIds.has(log.id)).map((log) => log.id);
        return result.nextData;
      });
      bulkPaymentIntentRef.current = null;
      bulkPaymentIntentInProgressRef.current = false;
      const payments = persisted.creditPayments.filter((payment) => paymentIds.includes(payment.id));
      const sales = persisted.sales.filter((sale) => updatedSaleIds.includes(sale.id));
      const patch = {
        baseData: persisted,
        sales,
        creditPayments: payments,
        auditLogs: persisted.auditLogs.filter((log) => auditLogIds.includes(log.id))
      };
      setLocalData(persisted);
      try {
        await syncPatchToBackend(persisted.backendUrl, backendToken, patch, "Cobro multiple pendiente de sincronizar", { persistMutation });
      } catch (syncError) {
        showWarning("Cobro guardado", syncError instanceof Error ? syncError.message : "El cobro quedo guardado, pero no pudo prepararse su sincronizacion.");
      }
      closeBulkPayment();
      setReceiptSuccess({
        mode: "bulk",
        title: "Cobro registrado",
        message: `Se aplicaron ${payments.length} documento(s) por $${money(payments.reduce((sum, payment) => sum + payment.amount, 0))}. Puede entregar el comprobante al cliente en este momento.`,
        payments,
        data: persisted
      });
    } catch (error) {
      showError("Revise el cobro", error instanceof Error ? error.message : "No se pudo registrar el cobro multiple.");
    } finally {
      bulkPaymentIntentInProgressRef.current = false;
      paymentLocksRef.current.delete(lockKey);
      setSavingBulkPayment(false);
    }
  };

  const confirmVoidPayment = (payment: CreditPayment) => {
    if (isCreditPaymentVoided(payment)) {
      showInfo("Abono anulado", "Este abono ya fue anulado anteriormente.");
      return;
    }
    const sale = data.sales.find((item) => item.id === payment.saleId);
    confirmAction(
      "Anular abono",
      `Se reversara el abono de $${money(payment.amount)}${sale ? ` de ${documentNumber(sale, data.issuer)}` : ""} y el saldo volvera a la cuenta del cliente. Esta accion quedara auditada.`,
      () => { void voidPayment(payment); },
      "Anular abono"
    );
  };

  const voidPayment = async (payment: CreditPayment) => {
    const reason = "Correccion de cobro aplicado por error";
    const fingerprint = [payment.id, payment.amount, payment.saleId, user.id, reason].join("::");
    const existingIntent = voidPaymentIntentRef.current.get(payment.id);
    const voidOperationId = existingIntent?.fingerprint === fingerprint
      ? existingIntent.voidOperationId
      : createCreditOperationId("void");
    voidPaymentIntentRef.current.set(payment.id, { fingerprint, voidOperationId });
    try {
      let changed = false;
      let saleId = payment.saleId;
      let auditLogId = "";
      const persisted = await persistMutation((current) => {
        const currentPayment = (current.creditPayments || []).find((item) => item.id === payment.id);
        if (!currentPayment) throw new Error("No se encontro el abono.");
        const currentSale = current.sales.find((sale) => sale.id === currentPayment.saleId);
        if (!currentSale) throw new Error("No se encontro la factura del abono.");
        saleId = currentSale.id;
        if (isCreditPaymentVoided(currentPayment)) return current;
        const next = voidCreditPayment({
          data: current,
          paymentId: currentPayment.id,
          reason,
          voidOperationId,
          user
        });
        changed = true;
        auditLogId = next.auditLogs[0]?.id || "";
        return next;
      });
      const updatedPayment = persisted.creditPayments.find((item) => item.id === payment.id);
      const updatedSale = persisted.sales.find((sale) => sale.id === saleId);
      setLocalData(persisted);
      if (!changed) {
        voidPaymentIntentRef.current.delete(payment.id);
        showInfo("Abono anulado", "Este abono ya estaba anulado.");
        return;
      }
      try {
        await syncPatchToBackend(persisted.backendUrl, backendToken, {
          baseData: persisted,
          sales: updatedSale ? [updatedSale] : [],
          creditPayments: updatedPayment ? [updatedPayment] : [],
          auditLogs: auditLogId ? persisted.auditLogs.filter((log) => log.id === auditLogId) : []
        }, "Anulacion de abono pendiente de sincronizar", { persistMutation });
      } catch (syncError) {
        showWarning("Anulacion guardada", syncError instanceof Error ? syncError.message : "La anulacion quedo guardada, pero no pudo prepararse su sincronizacion.");
      }
      voidPaymentIntentRef.current.delete(payment.id);
      showSuccess("Abono anulado", `El cobro fue reversado correctamente.${updatedSale ? ` Saldo pendiente $${money(creditBalance(updatedSale))}.` : ""}`);
    } catch (error) {
      showError("No se pudo anular", error instanceof Error ? error.message : "Revise el abono e intente nuevamente.");
    }
  };

  return (
    <View style={styles.stack}>
      <CreditOverviewSection
        clientCount={clientSummaries.length}
        clientSummaryOpen={clientSummaryOpen}
        currentScopeLabel={`${currentEstablishment.name} ${currentEstablishment.establishment}-${currentEstablishment.emissionPoint}`}
        overdueTotal={totals.overdueTotal}
        paidHistoryOpen={paidHistoryOpen}
        search={search}
        setClientSummaryOpen={setClientSummaryOpen}
        setPaidHistoryOpen={setPaidHistoryOpen}
        setScopeFilter={setScopeFilter}
        setSearch={setSearch}
        setStatusFilter={setStatusFilter}
        scopeFilter={scopeFilter}
        statusFilter={statusFilter}
        totalPending={totals.totalPending}
        upcomingTotal={upcomingTotal}
      />

      {clientSummaryOpen ? (
        <Section title="Cartera por cliente">
          {clientSummaries.length === 0 ? <Empty text="No hay clientes con credito pendiente." /> : null}
          {visibleClientSummaries.map((summary) => (
            <ListItemComponent
              key={summary.clientId}
              title={summary.clientName}
              meta={`${summary.pendingCount} documento(s) | Pendiente $${money(summary.pendingTotal)}${summary.overdueCount > 0 ? ` | Vencido $${money(summary.overdueTotal)}` : ""}${summary.nextDueDate ? ` | proximo ${formatShortDate(summary.nextDueDate)}` : ""}`}
              badge={summary.overdueCount > 0 ? "VENCIDO" : "AL DIA"}
              secondaryLabel="Cobrar"
              onOpen={() => selectClientSummary(summary.clientId)}
              onSecondary={() => openBulkPayment(summary.clientId)}
            />
          ))}
          <PaginationControls page={clientPagination.currentPage} pageSize={LIST_BATCH_SIZE} totalItems={clientSummaries.length} onPageChange={setClientPage} />
        </Section>
      ) : paidHistoryOpen ? (
        <Section title="Historial pagadas">
          {visiblePaidHistory.length === 0 ? <Empty text="No hay facturas pagadas con ese filtro." /> : null}
          {visiblePaidHistory.map((sale) => {
            const client = data.clients.find((item) => item.id === sale.clientId);
            const scopeText = creditSaleScopeText(sale, data);
            return (
              <CreditAccountCard
                key={sale.id}
                balanceText="$ 0.00"
                clientName={client?.name || "Cliente"}
                documentText={documentNumber(sale, data.issuer)}
                dueText={`Emitida: ${formatShortDate(sale.createdAt)}`}
                scopeText={scopeText}
                paid
                onDetail={() => setDetailSaleId(sale.id)}
              />
            );
          })}
          <PaginationControls page={paidHistoryPagination.currentPage} pageSize={LIST_BATCH_SIZE} totalItems={filteredPaidCreditSales.length} onPageChange={setPaidHistoryPage} />
        </Section>
      ) : (
        <Section title={statusFilter === "vencidos" ? "Cuentas vencidas" : statusFilter === "por_vencer" ? "Cuentas por vencer" : "Cuentas por cobrar"}>
          {visibleReceivables.length === 0 ? <Empty text="No hay facturas a credito pendientes." /> : null}
          {visibleReceivables.map((sale) => {
            const client = data.clients.find((item) => item.id === sale.clientId);
            const overdue = isCreditOverdue(sale);
            const balance = creditBalance(sale);
            const paid = balance <= 0 || sale.creditStatus === "pagado";
            const scopeText = creditSaleScopeText(sale, data);
            return (
              <CreditAccountCard
                key={sale.id}
                balanceText={`$${money(balance)}`}
                clientName={client?.name || "Cliente"}
                documentText={documentNumber(sale, data.issuer)}
                dueText={sale.creditDueDate ? `Vence: ${formatShortDate(sale.creditDueDate)}` : `Emitida: ${formatShortDate(sale.createdAt)}`}
                scopeText={scopeText}
                overdue={overdue}
                paid={paid}
                onDetail={() => setDetailSaleId(sale.id)}
                onPay={!paid ? () => selectSale(sale) : undefined}
              />
            );
          })}
          <PaginationControls page={receivablePagination.currentPage} pageSize={LIST_BATCH_SIZE} totalItems={filteredCreditSales.length} onPageChange={setReceivablePage} />
        </Section>
      )}

      <CreditDetailModal
        data={data}
        detailClient={detailClient}
        detailPaidAmount={detailPaidAmount}
        detailPayments={detailPayments}
        detailSale={detailSale}
        onClose={() => setDetailSaleId("")}
        onOpenPaymentReceipt={(payment) => { void openPaymentReceipt(payment); }}
        onOpenSaleDetail={(sale) => { void openCreditSaleDetail(sale.id); }}
        onPageChange={setDetailPaymentsPage}
        onRegisterPayment={(sale) => {
          selectSale(sale);
          setDetailSaleId("");
        }}
        onVoidPayment={confirmVoidPayment}
        page={detailPaymentsPagination.currentPage}
        visiblePayments={visibleDetailPayments}
      />

      <CreditPaymentModal
        amountText={amountText}
        issuer={data.issuer}
        note={note}
        onAmountChange={(value) => {
          invalidatePaymentIntent();
          setAmountText(value);
        }}
        onClose={closePaymentModal}
        onNoteChange={(value) => {
          invalidatePaymentIntent();
          setNote(value);
        }}
        onPaymentMethodChange={(value) => {
          invalidatePaymentIntent();
          setPaymentMethod(value);
        }}
        onSave={savePayment}
        paymentMethod={paymentMethod}
        selectedClient={selectedClient}
        selectedSale={selectedSale && paymentSaleId ? selectedSale : undefined}
        submitting={savingPayment}
      />

      <CreditBulkPaymentModal
        bulkAmountText={bulkAmountText}
        bulkClient={bulkClient}
        bulkNote={bulkNote}
        bulkPaymentMethod={bulkPaymentMethod}
        bulkSales={bulkSales}
        bulkSelectedSaleIds={bulkSelectedSaleIds}
        bulkSelectedTotal={bulkSelectedTotal}
        data={data}
        onAmountChange={(value) => {
          invalidateBulkPaymentIntent();
          setBulkAmountText(value);
        }}
        onClose={closeBulkPayment}
        onNoteChange={(value) => {
          invalidateBulkPaymentIntent();
          setBulkNote(value);
        }}
        onPageChange={setBulkPage}
        onPaymentMethodChange={(value) => {
          invalidateBulkPaymentIntent();
          setBulkPaymentMethod(value);
        }}
        onSave={saveBulkPayment}
        onSelectAll={() => {
          invalidateBulkPaymentIntent();
          setBulkSelectedSaleIds(bulkSales.map((sale) => sale.id));
          setBulkAmountText(money(bulkSales.reduce((sum, sale) => sum + creditBalance(sale), 0)));
        }}
        onSelectNone={() => {
          invalidateBulkPaymentIntent();
          setBulkSelectedSaleIds([]);
          setBulkAmountText("");
        }}
        onToggleSale={toggleBulkSale}
        page={bulkPagination.currentPage}
        submitting={savingBulkPayment}
        visible={Boolean(bulkClientId)}
        visibleBulkSales={visibleBulkSales}
      />

      {selectedClient ? (
        <CreditPaymentsSection
          data={data}
          emptyText="Este cliente aun no tiene abonos registrados."
          ListItemComponent={ListItemComponent}
          onOpenReceipt={(payment) => { void openPaymentReceipt(payment); }}
          onPageChange={setSelectedPaymentsPage}
          onVoidPayment={confirmVoidPayment}
          page={selectedPaymentsPagination.currentPage}
          payments={selectedClientPayments}
          showClientInTitle={false}
          title={`Historial ${selectedClient.name}`}
          visiblePayments={visibleSelectedClientPayments}
        />
      ) : null}

      <CreditPaymentsSection
        data={data}
        emptyText="Aun no hay abonos registrados."
        ListItemComponent={ListItemComponent}
        onOpenReceipt={(payment) => { void openPaymentReceipt(payment); }}
        onPageChange={setRecentPaymentsPage}
        onVoidPayment={confirmVoidPayment}
        page={recentPaymentsPagination.currentPage}
        payments={recentPayments}
        title="Ultimos abonos"
        visiblePayments={visibleRecentPayments}
      />

      <CreditPaymentSuccessModal
        visible={Boolean(receiptSuccess)}
        title={receiptSuccess?.title || ""}
        message={receiptSuccess?.message || ""}
        receiptLabel={receiptSuccess?.mode === "bulk" ? "Ver comprobante" : "Ver recibo"}
        shareLabel={receiptSuccess?.mode === "bulk" ? "Compartir comprobante" : "Compartir recibo"}
        onClose={() => setReceiptSuccess(null)}
        onOpenReceipt={() => {
          const current = receiptSuccess;
          if (!current) return;
          if (current.mode === "bulk") {
            void viewBulkPaymentReceipt(current.payments, current.data);
          } else if (current.payments[0]) {
            void viewPaymentReceipt(current.payments[0], current.data);
          }
        }}
        onShareReceipt={() => {
          const current = receiptSuccess;
          if (!current) return;
          if (current.mode === "bulk") {
            void shareBulkPaymentReceipt(current.payments, current.data);
          } else if (current.payments[0]) {
            void sharePaymentReceipt(current.payments[0], current.data);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12
  }
});
