import React, { useEffect, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { LIST_BATCH_SIZE } from "../constants/app";
import { MODAL_EDGE_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { AdditionalInfoField, Client, DocumentType, PaymentMethod, Product, Sale, SaleItem, SalePaymentSplit } from "../types";
import { PaymentCondition } from "../types";
import { money } from "../sri";
import { toInputDate } from "../utils/format";
import { documentTypeLabel } from "../utils/sales";
import { isConsumerFinalClient } from "../validation";
import { useFloatingOverlay } from "../context/FloatingOverlayContext";
import {
  SPLIT_PAYMENT_METHOD_OPTIONS,
  TRANSFER_BANK_OPTIONS,
  createSalePayment,
  normalizePartialSalePayments,
  normalizeSalePayments,
  parsePaymentAmount,
  salePaymentBalance,
  salePaymentTotal
} from "../utils/salePayments";
import { DismissibleNotice } from "./DismissibleNotice";
import { DocumentTypeSelector } from "./DocumentTypeSelector";
import { SaleClientPicker } from "./SaleClientPicker";
import { SaleEditNotice } from "./SaleEditNotice";
import { SaleItemsList } from "./SaleItemsList";
import { SaleProductControls } from "./SaleProductControls";
import { SaleProductPicker } from "./SaleProductPicker";
import { SaleSubmitButton } from "./SaleSubmitButton";
import { SaleTotalsBox } from "./SaleTotalsBox";
import { CalendarDateInput } from "./CalendarDateInput";
import { Input, Section } from "./common";

type MaterialIconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
type PaymentChoice = PaymentMethod | "credito";

const PAYMENT_CHOICE_OPTIONS: {
  value: PaymentChoice;
  title: string;
  detail: string;
  icon: MaterialIconName;
}[] = [
  ...SPLIT_PAYMENT_METHOD_OPTIONS.map((option) => ({
    ...option,
    icon: option.icon as MaterialIconName
  })),
  { value: "credito", title: "Credito al cliente", detail: "Cuentas por cobrar", icon: "account-clock-outline" }
];

const CREDIT_TERM_OPTIONS = [
  { label: "Semanal", days: 7 },
  { label: "Quincenal", days: 15 },
  { label: "Mensual", days: 30 },
  { label: "60 dias", days: 60 }
];

function normalizePaymentAmountInput(rawValue: string) {
  const normalized = rawValue.replace(",", ".").replace(/[^0-9.]/g, "");
  const [whole = "", ...decimalParts] = normalized.split(".");
  if (!decimalParts.length) return whole;
  return `${whole}.${decimalParts.join("").slice(0, 2)}`;
}

type SaleFormSectionProps = {
  addProductById: (productId: string) => void;
  addProductSearchSubmit: () => void;
  additionalInfo: AdditionalInfoField[];
  adjustSaleLineQuantity: (index: number, delta: number) => void;
  cancelEdit: () => void;
  clientId: string;
  clientSearch: string;
  documentType: DocumentType;
  editingSale?: Sale;
  filteredClientCount: number;
  filteredProductCount: number;
  issue: () => void;
  issueNotice: string;
  issuing: boolean;
  items: SaleItem[];
  onOpenScanner: () => void;
  openLineEditor: (index: number) => void;
  openQuickClientCreator?: () => void;
  openQuickClientEditor: () => void;
  nextDocumentLabel?: string;
  paymentCondition: PaymentCondition;
  creditDueDate: string;
  paymentMethod: PaymentMethod;
  productId: string;
  productSearch: string;
  projectedStock: number;
  saleSummaryTotals: { subtotal: number; discount: number; tax: number; total: number };
  selectClientForSale: (nextClientId: string, nextClient?: Client) => void;
  selectProductForSale: (nextProductId: string) => void;
  selectedClient?: Client;
  selectedProduct?: Product;
  selectedProductLowStock: boolean;
  salePayments: SalePaymentSplit[];
  setClientSearch: React.Dispatch<React.SetStateAction<string>>;
  setDocumentType: React.Dispatch<React.SetStateAction<DocumentType>>;
  setIssueNotice: React.Dispatch<React.SetStateAction<string>>;
  setItems: React.Dispatch<React.SetStateAction<SaleItem[]>>;
  setAdditionalInfoVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setPaymentCondition: React.Dispatch<React.SetStateAction<PaymentCondition>>;
  setCreditDueDate: React.Dispatch<React.SetStateAction<string>>;
  setPaymentMethod: React.Dispatch<React.SetStateAction<PaymentMethod>>;
  setSalePayments: React.Dispatch<React.SetStateAction<SalePaymentSplit[]>>;
  setProductSearch: React.Dispatch<React.SetStateAction<string>>;
  setVisibleClientCount: React.Dispatch<React.SetStateAction<number>>;
  setVisibleProductCount: React.Dispatch<React.SetStateAction<number>>;
  sourceProforma?: Sale;
  sourceTicket?: Sale;
  filteredProductsForSale?: Product[];
  visibleClientsForSale: Client[];
  visibleProductsForSale: Product[];
};

export function SaleFormSection({
  addProductById,
  addProductSearchSubmit,
  additionalInfo,
  adjustSaleLineQuantity,
  cancelEdit,
  clientId,
  clientSearch,
  documentType,
  editingSale,
  filteredClientCount,
  filteredProductCount,
  issue,
  issueNotice,
  issuing,
  items,
  onOpenScanner,
  openLineEditor,
  openQuickClientCreator,
  openQuickClientEditor,
  nextDocumentLabel,
  paymentCondition,
  creditDueDate,
  paymentMethod,
  productId,
  productSearch,
  projectedStock,
  saleSummaryTotals,
  selectClientForSale,
  selectProductForSale,
  selectedClient,
  selectedProduct,
  selectedProductLowStock,
  salePayments,
  setClientSearch,
  setDocumentType,
  setIssueNotice,
  setItems,
  setAdditionalInfoVisible,
  setPaymentCondition,
  setCreditDueDate,
  setPaymentMethod,
  setSalePayments,
  setProductSearch,
  setVisibleClientCount,
  setVisibleProductCount,
  sourceProforma,
  sourceTicket,
  filteredProductsForSale: _filteredProductsForSale,
  visibleClientsForSale,
  visibleProductsForSale
}: SaleFormSectionProps) {
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [checkoutSummaryOpen, setCheckoutSummaryOpen] = useState(false);
  const { setOverlay } = useFloatingOverlay();
  const creditAllowed = Boolean(selectedClient && !isConsumerFinalClient(selectedClient));
  const paymentActionLabel = submitActionLabel(documentType, editingSale, sourceTicket, sourceProforma);
  const itemCount = items.length;
  const unitCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const openPaymentModal = () => {
    if (issuing) return;
    setSalePayments((current) =>
      paymentCondition === "credito"
        ? normalizePartialSalePayments(current, paymentMethod)
        : normalizeSalePayments(current, paymentMethod, saleSummaryTotals.total)
    );
    setPaymentModalVisible(true);
  };
  const confirmPayment = () => {
    const resolvedPayments =
      paymentCondition === "credito"
        ? normalizePartialSalePayments(salePayments, paymentMethod)
        : normalizeSalePayments(salePayments, paymentMethod, saleSummaryTotals.total);
    const balance = salePaymentBalance(saleSummaryTotals.total, resolvedPayments);

    if (paymentCondition === "credito") {
      if (!creditAllowed) {
        Alert.alert("Cliente requerido", "Para vender a credito seleccione un cliente identificado. No se permite credito a Consumidor Final.");
        return;
      }
      if (balance < -0.009) {
        Alert.alert("Pago excedido", `El abono supera el total por $${money(Math.abs(balance))}.`);
        return;
      }
    } else if (Math.abs(balance) > 0.009) {
      Alert.alert(
        "Pagos incompletos",
        balance > 0
          ? `Faltan $${money(balance)} para cuadrar la venta.`
          : `El pago supera el total por $${money(Math.abs(balance))}.`
      );
      return;
    }

    setSalePayments(resolvedPayments);
    setPaymentModalVisible(false);
    issue();
  };

  useEffect(() => {
    setOverlay(
      <SaleCheckoutDock
        discount={saleSummaryTotals.discount}
        expanded={checkoutSummaryOpen}
        issuing={issuing}
        itemCount={itemCount}
        onSubmit={openPaymentModal}
        onToggle={() => setCheckoutSummaryOpen((current) => !current)}
        subtotal={saleSummaryTotals.subtotal}
        tax={saleSummaryTotals.tax}
        total={saleSummaryTotals.total}
        unitCount={unitCount}
      />
    );
    return () => setOverlay(null);
  }, [
    checkoutSummaryOpen,
    issuing,
    itemCount,
    saleSummaryTotals.discount,
    saleSummaryTotals.subtotal,
    saleSummaryTotals.tax,
    saleSummaryTotals.total,
    paymentCondition,
    paymentMethod,
    setOverlay,
    unitCount
  ]);

  return (
    <Section title={sourceTicket ? `Facturando ticket ${sourceTicket.sequence}` : sourceProforma ? `Convirtiendo proforma ${sourceProforma.sequence}` : editingSale ? `Corrigiendo ${documentTypeLabel(editingSale)} ${editingSale.sequence}` : "Nueva venta"}>
      <SaleEditNotice sourceTicket={sourceTicket} sourceProforma={sourceProforma} editingSale={editingSale} onCancel={cancelEdit} />
      <View style={styles.saleGroupCompact}>
        <DocumentTypeSelector
          value={documentType}
          editingSale={editingSale}
          nextDocumentLabel={nextDocumentLabel}
          sourceTicket={sourceTicket}
          sourceProforma={sourceProforma}
          onChange={setDocumentType}
        />
      </View>
      <View style={styles.saleGroup}>
        <SaleClientPicker
          search={clientSearch}
          selectedClientId={clientId}
          visibleClients={visibleClientsForSale}
          filteredClientCount={filteredClientCount}
          selectedClient={selectedClient}
          canLoadMore={visibleClientsForSale.length < filteredClientCount}
          onSearchChange={setClientSearch}
          onClientChange={selectClientForSale}
          onLoadMore={() => setVisibleClientCount((count) => count + LIST_BATCH_SIZE)}
          onCreateClient={openQuickClientCreator || openQuickClientEditor}
          onEditClient={openQuickClientEditor}
        />
      </View>

      <View style={styles.saleGroup}>
        <SaleProductPicker
          search={productSearch}
          selectedProductId={productId}
          visibleProducts={visibleProductsForSale}
          filteredProductCount={filteredProductCount}
          canLoadMore={visibleProductsForSale.length < filteredProductCount}
          onSearchChange={setProductSearch}
          onProductChange={selectProductForSale}
          onSearchSubmit={addProductSearchSubmit}
          onOpenScanner={onOpenScanner}
          onLoadMore={() => setVisibleProductCount((count) => count + LIST_BATCH_SIZE)}
          onAddProduct={addProductById}
        />
        <SaleProductControls
          product={selectedProduct}
          lowStock={selectedProductLowStock}
          projectedStock={projectedStock}
        />
      </View>

      <SaleItemsList
        items={items}
        onAdjustQuantity={adjustSaleLineQuantity}
        onEdit={openLineEditor}
        onDelete={(index) => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}
      />
      <SaleTotalsBox
        key={`additional-${additionalInfo.length}`}
        subtotal={saleSummaryTotals.subtotal}
        discount={saleSummaryTotals.discount}
        tax={saleSummaryTotals.tax}
        total={saleSummaryTotals.total}
        additionalInfoCount={additionalInfo.length}
        onOpenAdditionalInfo={() => setAdditionalInfoVisible(true)}
        showSummary={false}
      />
      <DismissibleNotice message={issueNotice} onDismiss={() => setIssueNotice("")} />
      <SalePaymentModal
        visible={paymentModalVisible}
        actionLabel={paymentActionLabel}
        creditAllowed={creditAllowed}
        creditDueDate={creditDueDate}
        documentType={documentType}
        issuing={issuing}
        onClose={() => setPaymentModalVisible(false)}
        onConfirm={confirmPayment}
        onCreditDueDateChange={setCreditDueDate}
        onPaymentConditionChange={setPaymentCondition}
        onPaymentMethodChange={setPaymentMethod}
        onSalePaymentsChange={setSalePayments}
        paymentCondition={paymentCondition}
        paymentMethod={paymentMethod}
        salePayments={salePayments}
        total={saleSummaryTotals.total}
      />
    </Section>
  );
}

type SalePaymentModalProps = {
  actionLabel: string;
  creditAllowed: boolean;
  creditDueDate: string;
  documentType: DocumentType;
  issuing: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onCreditDueDateChange: (value: string) => void;
  onPaymentConditionChange: (value: PaymentCondition) => void;
  onPaymentMethodChange: (value: PaymentMethod) => void;
  onSalePaymentsChange: React.Dispatch<React.SetStateAction<SalePaymentSplit[]>>;
  paymentCondition: PaymentCondition;
  paymentMethod: PaymentMethod;
  salePayments: SalePaymentSplit[];
  total: number;
  visible: boolean;
};

function SalePaymentModal({
  actionLabel,
  creditAllowed,
  creditDueDate,
  documentType,
  issuing,
  onClose,
  onConfirm,
  onCreditDueDateChange,
  onPaymentConditionChange,
  onPaymentMethodChange,
  onSalePaymentsChange,
  paymentCondition,
  paymentMethod,
  salePayments,
  total,
  visible
}: SalePaymentModalProps) {
  const isInvoice = documentType === "factura";
  const helperText = isInvoice
    ? "Se autoriza en el SRI al confirmar."
    : documentType === "nota_venta"
      ? "Se guarda como nota de venta al confirmar."
      : "Se guarda la proforma al confirmar.";
  const handlePaymentConditionChange = (value: PaymentCondition) => {
    onPaymentConditionChange(value);
    if (value === "credito") {
      const initialMethod: PaymentMethod = paymentMethod === "20" ? "01" : paymentMethod;
      onPaymentMethodChange(initialMethod);
      onSalePaymentsChange((current) => normalizePartialSalePayments(current, initialMethod));
      return;
    }
    const immediateMethod: PaymentMethod = paymentMethod === "20" ? "01" : paymentMethod;
    onPaymentMethodChange(immediateMethod);
    onSalePaymentsChange((current) => normalizeSalePayments(current, immediateMethod, total));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.paymentBackdrop}>
        <View style={styles.paymentSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.paymentHeader}>
            <View style={styles.paymentTitleBlock}>
              <Text style={styles.paymentTitle}>Cobro de la venta</Text>
              <Text style={styles.paymentSubtitle}>{documentLabel(documentType)}</Text>
            </View>
            <Pressable style={styles.roundCloseButton} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color="#475569" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.paymentContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.amountHero}>
              <Text style={styles.amountHeroLabel}>Total a cobrar</Text>
              <Text style={styles.amountHeroValue}>${money(total)}</Text>
            </View>
            <SaleSplitPaymentsEditor
              creditAllowed={creditAllowed}
              creditDueDate={creditDueDate}
              fallbackMethod={paymentMethod}
              onChange={onSalePaymentsChange}
              onCreditDueDateChange={onCreditDueDateChange}
              onPaymentConditionChange={handlePaymentConditionChange}
              onPrimaryMethodChange={onPaymentMethodChange}
              paymentCondition={paymentCondition}
              payments={salePayments}
              total={total}
            />
            <View style={styles.paymentHint}>
              <MaterialCommunityIcons name={isInvoice ? "shield-check-outline" : "file-check-outline"} size={18} color="#0f766e" />
              <Text style={styles.paymentHintText}>{helperText}</Text>
            </View>
            <SaleSubmitButton
              issuing={issuing}
              documentType={documentType}
              total={total}
              labelOverride={actionLabel}
              onSubmit={onConfirm}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function SaleCheckoutDock({
  discount,
  expanded,
  issuing,
  itemCount,
  onSubmit,
  onToggle,
  subtotal,
  tax,
  total,
  unitCount
}: {
  discount: number;
  expanded: boolean;
  issuing: boolean;
  itemCount: number;
  onSubmit: () => void;
  onToggle: () => void;
  subtotal: number;
  tax: number;
  total: number;
  unitCount: number;
}) {
  return (
    <View pointerEvents="box-none" style={styles.checkoutOverlay}>
      {expanded ? (
        <View style={styles.checkoutBreakdown}>
          <View style={styles.checkoutBreakdownHeader}>
            <Text style={styles.checkoutBreakdownTitle}>Desglose</Text>
            <Pressable style={styles.checkoutSmallToggle} onPress={onToggle}>
              <MaterialCommunityIcons name="chevron-down" size={20} color="#0f766e" />
            </Pressable>
          </View>
          <View style={styles.checkoutRow}>
            <Text style={styles.checkoutRowLabel}>Subtotal</Text>
            <Text style={styles.checkoutRowValue}>${money(subtotal)}</Text>
          </View>
          <View style={styles.checkoutRow}>
            <Text style={styles.checkoutRowLabel}>Descuento</Text>
            <Text style={[styles.checkoutRowValue, discount > 0 && styles.checkoutDiscountValue]}>${money(discount)}</Text>
          </View>
          <View style={styles.checkoutRow}>
            <Text style={styles.checkoutRowLabel}>IVA</Text>
            <Text style={styles.checkoutRowValue}>${money(tax)}</Text>
          </View>
        </View>
      ) : null}
      <View style={styles.checkoutDock}>
        <Pressable style={styles.checkoutToggle} onPress={onToggle}>
          <MaterialCommunityIcons name={expanded ? "chevron-down" : "chevron-up"} size={24} color="#d1fae5" />
        </Pressable>
        <View style={styles.checkoutTotalBlock}>
          <Text style={styles.checkoutLabel}>Total a cobrar</Text>
          <Text style={styles.checkoutTotal}>${money(total)}</Text>
          <Text style={styles.checkoutMeta}>{itemCount} lineas | {unitCount} unidades</Text>
        </View>
        <Pressable style={[styles.checkoutPayButton, issuing && styles.checkoutPayButtonDisabled]} onPress={issuing ? undefined : onSubmit}>
          <MaterialCommunityIcons name="wallet-outline" size={21} color="#ffffff" />
          <View style={styles.checkoutPayTextBlock}>
            <Text style={styles.checkoutPayTitle}>{issuing ? "Procesando..." : "Cobrar"}</Text>
            <Text style={styles.checkoutPayAmount}>${money(total)}</Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

function SaleSplitPaymentsEditor({
  creditAllowed,
  creditDueDate,
  fallbackMethod,
  onChange,
  onCreditDueDateChange,
  onPaymentConditionChange,
  onPrimaryMethodChange,
  paymentCondition,
  payments,
  total
}: {
  creditAllowed: boolean;
  creditDueDate: string;
  fallbackMethod: PaymentMethod;
  onChange: React.Dispatch<React.SetStateAction<SalePaymentSplit[]>>;
  onCreditDueDateChange: (value: string) => void;
  onPaymentConditionChange: (value: PaymentCondition) => void;
  onPrimaryMethodChange?: (method: PaymentMethod) => void;
  paymentCondition: PaymentCondition;
  payments: SalePaymentSplit[];
  total: number;
}) {
  const [openBankPickerId, setOpenBankPickerId] = useState<string | null>(null);
  const [openMethodPickerId, setOpenMethodPickerId] = useState<string | null>(null);
  const [creditTermExpanded, setCreditTermExpanded] = useState(false);
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [manualPaymentAmounts, setManualPaymentAmounts] = useState<Record<string, boolean>>({});
  const isCredit = paymentCondition === "credito";
  const cashFallbackMethod: PaymentMethod = fallbackMethod === "20" ? "01" : fallbackMethod;
  const normalizeCreditEditorPayments = (source: SalePaymentSplit[]) =>
    source.map((payment, index) => ({
      ...payment,
      id: payment.id || `credit-payment-${index}`,
      amount: parsePaymentAmount(payment.amount),
      paymentMethod: payment.paymentMethod || cashFallbackMethod
    }));
  const normalizedPayments = isCredit
    ? normalizeCreditEditorPayments(payments)
    : normalizeSalePayments(payments, fallbackMethod, total);
  const paidNowAmount = salePaymentTotal(normalizedPayments);
  const balance = salePaymentBalance(total, normalizedPayments);
  const creditAmount = isCredit ? Math.max(0, balance) : 0;
  const overpaid = balance < -0.009;
  const balanced = Math.abs(balance) <= 0.009 || (isCredit && !overpaid);
  const unassignedAmount = isCredit ? (overpaid ? Math.abs(balance) : 0) : Math.max(0, balance);
  const hasEmptyPaymentLine = normalizedPayments.some((payment) => parsePaymentAmount(payment.amount) <= 0.009);
  const hasPaidPaymentLine = normalizedPayments.some((payment) => parsePaymentAmount(payment.amount) > 0.009);
  const canAddEmptySplitPayment = !isCredit && !hasEmptyPaymentLine && hasPaidPaymentLine;
  const canAddPayment =
    total > 0.009 && !overpaid && (isCredit ? creditAmount > 0.009 : balance > 0.009 || canAddEmptySplitPayment);
  const statusLabel = overpaid
    ? "Excedido"
    : isCredit
      ? creditAmount > 0.009
        ? `Credito $${money(creditAmount)}`
        : "Pagado"
      : balanced
      ? "Cuadrado"
      : `Falta $${money(Math.max(0, balance))}`;
  const displayedPayments = normalizedPayments;
  const singlePayment = displayedPayments.length === 1 ? displayedPayments[0] : undefined;
  const shouldSyncSingleCashPayment = !isCredit && singlePayment?.paymentMethod === "01";
  const singlePaymentWasEdited = singlePayment ? manualPaymentAmounts[singlePayment.id] : false;
  const showCreditPayment = isCredit && (creditAmount > 0.009 || !displayedPayments.length);

  const dateForCreditTerm = (days: number) => {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + days);
    return toInputDate(dueDate);
  };
  const selectedCreditTerm = CREDIT_TERM_OPTIONS.find((option) => creditDueDate === dateForCreditTerm(option.days));
  const creditTermLabel = selectedCreditTerm?.label || (creditDueDate ? "Personalizado" : "Plazo");
  const changeCreditDueDate = (value: string) => {
    onCreditDueDateChange(value);
    setCreditTermExpanded(false);
  };

  useEffect(() => {
    if (!isCredit || creditAllowed) return;
    onPaymentConditionChange("contado");
    onCreditDueDateChange("");
    onChange((current) => normalizeSalePayments(current, cashFallbackMethod, total));
  }, [cashFallbackMethod, creditAllowed, isCredit, onChange, onCreditDueDateChange, onPaymentConditionChange, total]);

  useEffect(() => {
    if (!shouldSyncSingleCashPayment || !singlePayment || singlePaymentWasEdited) return;
    const syncedAmount = Math.max(0, parsePaymentAmount(total));
    const syncedDraft = syncedAmount > 0 ? money(syncedAmount) : "";

    if (Math.abs(parsePaymentAmount(singlePayment.amount) - syncedAmount) > 0.009) {
      onChange((current) => {
        const source = current.length ? current : displayedPayments;
        if (source.length !== 1 || source[0]?.paymentMethod !== "01") {
          return source;
        }
        if (Math.abs(parsePaymentAmount(source[0].amount) - syncedAmount) <= 0.009) {
          return source;
        }
        return [{ ...source[0], amount: syncedAmount }];
      });
    }

    setAmountDrafts((current) => {
      if (current[singlePayment.id] === syncedDraft) return current;
      return { ...current, [singlePayment.id]: syncedDraft };
    });
  }, [displayedPayments, onChange, shouldSyncSingleCashPayment, singlePayment, singlePaymentWasEdited, total]);

  const updatePayment = (id: string, patch: Partial<SalePaymentSplit>) => {
    onChange((current) => {
      const source = current.length ? current : normalizedPayments;
      return source.map((payment) => (payment.id === id ? { ...payment, ...patch } : payment));
    });
  };

  const addPayment = () => {
    if (!canAddPayment) return;
    onChange((current) => {
      const source = isCredit ? normalizeCreditEditorPayments(current) : normalizeSalePayments(current, fallbackMethod, total);
      const pending = Math.max(0, salePaymentBalance(total, source));
      if (pending <= 0.009) {
        const hasEmptySourcePayment = source.some((payment) => parsePaymentAmount(payment.amount) <= 0.009);
        const hasPaidSourcePayment = source.some((payment) => parsePaymentAmount(payment.amount) > 0.009);
        if (!isCredit && !hasEmptySourcePayment && hasPaidSourcePayment) {
          const usedMethods = new Set(source.map((payment) => payment.paymentMethod));
          const nextMethod = SPLIT_PAYMENT_METHOD_OPTIONS.find((option) => !usedMethods.has(option.value))?.value || "01";
          return [...source, createSalePayment(nextMethod, 0)];
        }
        return source;
      }
      if (isCredit) {
        return [...source, createSalePayment(cashFallbackMethod, 0)];
      }
      return [...source, createSalePayment(fallbackMethod || "01", pending)];
    });
  };

  const updatePaymentAmount = (payment: SalePaymentSplit, rawValue: string) => {
    const sanitized = normalizePaymentAmountInput(rawValue);
    setManualPaymentAmounts((current) => ({ ...current, [payment.id]: true }));
    setAmountDrafts((current) => ({ ...current, [payment.id]: sanitized }));
    updatePayment(payment.id, { amount: parsePaymentAmount(sanitized) });
  };

  const selectPaymentMethod = (payment: SalePaymentSplit, index: number, method: PaymentChoice) => {
    if (method === "credito") {
      if (!creditAllowed) {
        Alert.alert("Cliente requerido", "Para vender a credito seleccione un cliente identificado. No se permite credito a Consumidor Final.");
        setOpenMethodPickerId(null);
        return;
      }
      const remainingPayments = normalizePartialSalePayments(
        displayedPayments.filter((item) => item.id !== payment.id),
        cashFallbackMethod
      );
      onPaymentConditionChange("credito");
      onPrimaryMethodChange?.(remainingPayments[0]?.paymentMethod || cashFallbackMethod);
      setAmountDrafts((current) => {
        const next = { ...current };
        delete next[payment.id];
        return next;
      });
      setManualPaymentAmounts((current) => {
        const next = { ...current };
        delete next[payment.id];
        return next;
      });
      onChange(remainingPayments);
      setOpenMethodPickerId(null);
      return;
    }

    const selectedMethod = method as PaymentMethod;
    if (!isCredit) {
      onPaymentConditionChange("contado");
    }
    if (index === 0) {
      onPrimaryMethodChange?.(selectedMethod);
    }
    updatePayment(payment.id, {
      paymentMethod: selectedMethod,
      bank: selectedMethod === "20" ? payment.bank : undefined,
      reference: selectedMethod === "20" ? payment.reference : undefined
    });
    setOpenMethodPickerId(null);
  };

  const removePayment = (id: string) => {
    setAmountDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setManualPaymentAmounts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    onChange((current) => {
      const next = current.filter((payment) => payment.id !== id);
      return isCredit ? normalizePartialSalePayments(next, cashFallbackMethod) : normalizeSalePayments(next, fallbackMethod, total);
    });
  };

  const removeCreditPayment = () => {
    onPaymentConditionChange("contado");
    onCreditDueDateChange("");
    onChange((current) => normalizeSalePayments(current, cashFallbackMethod, total));
  };

  return (
    <View style={styles.splitBox}>
      <View style={styles.splitHeader}>
        <View>
          <Text style={styles.splitTitle}>Metodos de pago</Text>
          <Text style={styles.splitHelp}>Distribuye el total entre uno o varios metodos.</Text>
        </View>
        <Text style={[styles.splitStatus, balanced ? styles.splitStatusBalanced : styles.splitStatusWarning]}>{statusLabel}</Text>
      </View>

      {displayedPayments.map((payment, index) => {
          const selectedChoice: PaymentChoice = payment.paymentMethod;
          const isTransfer = payment.paymentMethod === "20";
          return (
            <View key={payment.id} style={styles.paymentCompactCard}>
              <View style={styles.paymentCompactRow}>
                <View style={styles.paymentRowNumber}>
                  <Text style={styles.paymentRowNumberText}>{index + 1}</Text>
                </View>
                <View style={styles.paymentRowMethod}>
                  <PaymentMethodDropdown
                    compact
                    expanded={openMethodPickerId === payment.id}
                    includeCredit
                    method={selectedChoice}
                    onSelect={(method) => selectPaymentMethod(payment, index, method)}
                    onToggle={() => setOpenMethodPickerId((current) => (current === payment.id ? null : payment.id))}
                  />
                </View>
                <TextInput
                  style={styles.paymentAmountInput}
                  value={amountDrafts[payment.id] ?? (payment.amount ? String(payment.amount) : "")}
                  onChangeText={(value) => updatePaymentAmount(payment, value)}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor="#94a3b8"
                  selectTextOnFocus
                />
                {displayedPayments.length > 1 || isCredit ? (
                  <Pressable style={styles.paymentRowRemove} onPress={() => removePayment(payment.id)}>
                    <MaterialCommunityIcons name="trash-can-outline" size={17} color="#991b1b" />
                  </Pressable>
                ) : (
                  <View style={styles.paymentRowSpacer} />
                )}
              </View>
              {isTransfer ? (
                <View style={styles.paymentCompactExtra}>
                  <BankDropdown
                    bank={payment.bank}
                    expanded={openBankPickerId === payment.id}
                    onToggle={() => setOpenBankPickerId((current) => (current === payment.id ? null : payment.id))}
                    onSelect={(bank) => {
                      updatePayment(payment.id, { bank });
                      setOpenBankPickerId(null);
                    }}
                  />
                  <Input
                    label="Referencia bancaria (opcional)"
                    value={payment.reference || ""}
                    onChangeText={(value) => updatePayment(payment.id, { reference: value })}
                    placeholder="Ej. comprobante, banco o numero"
                  />
                </View>
              ) : null}
            </View>
          );
        })}

      {showCreditPayment ? (
        <View style={[styles.paymentCompactCard, styles.creditPaymentCard]}>
          <View style={styles.paymentCompactRow}>
            <View style={styles.paymentRowNumber}>
              <Text style={styles.paymentRowNumberText}>{displayedPayments.length + 1}</Text>
            </View>
            <View style={styles.creditMethodInfo}>
              <MaterialCommunityIcons name="calendar-clock-outline" size={20} color="#0f766e" />
              <View style={styles.paymentMethodText}>
                <Text style={styles.creditMethodTitle}>Credito al cliente</Text>
                <Text style={styles.creditMethodDetail}>{displayedPayments.length ? "Saldo financiado" : "Todo el valor queda a credito"}</Text>
              </View>
            </View>
            <Text style={styles.creditAmountText}>${money(creditAmount)}</Text>
            <Pressable style={styles.paymentRowRemove} onPress={removeCreditPayment}>
              <MaterialCommunityIcons name="trash-can-outline" size={17} color="#991b1b" />
            </Pressable>
          </View>
          <View style={styles.creditInlineFields}>
            <View style={styles.creditTermColumn}>
              <Text style={styles.creditTermLabel}>Plazo</Text>
              <Pressable
                style={[styles.creditTermSelect, creditTermExpanded && styles.creditTermSelectActive]}
                onPress={() => setCreditTermExpanded((current) => !current)}
              >
                <Text style={styles.creditTermSelectText} numberOfLines={1}>
                  {creditTermLabel}
                </Text>
                <MaterialCommunityIcons name={creditTermExpanded ? "chevron-up" : "chevron-down"} size={18} color="#475569" />
              </Pressable>
              {creditTermExpanded ? (
                <View style={styles.creditTermMenu}>
                  {CREDIT_TERM_OPTIONS.map((option) => {
                    const selected = selectedCreditTerm?.days === option.days;
                    return (
                      <Pressable
                        key={option.days}
                        style={styles.creditTermOption}
                        onPress={() => changeCreditDueDate(dateForCreditTerm(option.days))}
                      >
                        <Text style={[styles.creditTermOptionText, selected && styles.creditTermOptionTextActive]}>{option.label}</Text>
                        {selected ? <MaterialCommunityIcons name="check" size={17} color="#0f766e" /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
            <View style={styles.creditDateBox}>
              <CalendarDateInput label="Vencimiento" value={creditDueDate} onChange={changeCreditDueDate} />
            </View>
          </View>
          <View style={styles.creditGeneratedNotice}>
            <MaterialCommunityIcons name="information-outline" size={18} color="#1d4ed8" />
            <Text style={styles.creditGeneratedText}>Se generara una cuenta por cobrar de ${money(creditAmount)}.</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.splitFooter}>
        <Pressable
          disabled={!canAddPayment}
          style={[styles.splitAddButton, !canAddPayment && styles.splitAddButtonDisabled]}
          onPress={addPayment}
        >
          <MaterialCommunityIcons name={canAddPayment ? "plus-circle-outline" : "check-circle-outline"} size={18} color={canAddPayment ? "#0f766e" : "#64748b"} />
          <Text style={[styles.splitAddText, !canAddPayment && styles.splitAddTextDisabled]}>
            {canAddPayment ? "Agregar otro pago" : "Total asignado"}
          </Text>
        </Pressable>
        <View style={styles.paymentSummaryStrip}>
          <View style={styles.paymentSummaryCell}>
            <Text style={styles.paymentSummaryLabel}>Cobrado ahora</Text>
            <Text style={styles.paymentSummaryValue}>${money(paidNowAmount)}</Text>
          </View>
          <View style={styles.paymentSummaryCell}>
            <Text style={styles.paymentSummaryLabel}>A credito</Text>
            <Text style={styles.paymentSummaryValue}>${money(creditAmount)}</Text>
          </View>
          <View style={styles.paymentSummaryCell}>
            <Text style={styles.paymentSummaryLabel}>Por asignar</Text>
            <Text style={[styles.paymentSummaryValue, !overpaid && unassignedAmount <= 0.009 && styles.paymentSummaryOk]}>
              ${money(unassignedAmount)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function PaymentMethodDropdown({
  compact,
  expanded,
  includeCredit = true,
  method,
  onSelect,
  onToggle
}: {
  compact?: boolean;
  expanded: boolean;
  includeCredit?: boolean;
  method: PaymentChoice;
  onSelect: (method: PaymentChoice) => void;
  onToggle: () => void;
}) {
  const options = includeCredit ? PAYMENT_CHOICE_OPTIONS : PAYMENT_CHOICE_OPTIONS.filter((option) => option.value !== "credito");
  const selectedOption =
    options.find((option) => option.value === method) ||
    PAYMENT_CHOICE_OPTIONS.find((option) => option.value === method) ||
    PAYMENT_CHOICE_OPTIONS.find((option) => option.value === "01");
  if (!selectedOption) {
    return null;
  }

  return (
    <View style={[styles.paymentMethodDropdownBox, compact && styles.paymentMethodDropdownCompact]}>
      {compact ? null : <Text style={styles.bankLabel}>Forma de pago</Text>}
      <Pressable style={[styles.paymentMethodSelect, compact && styles.paymentMethodSelectCompact, expanded && styles.bankSelectActive]} onPress={onToggle}>
        <MaterialCommunityIcons name={selectedOption.icon as MaterialIconName} size={18} color="#0f766e" />
        <View style={styles.paymentMethodText}>
          <Text style={styles.paymentMethodTitle} numberOfLines={1}>
            {selectedOption.title}
          </Text>
          <Text style={styles.paymentMethodDetail}>{selectedOption.detail}</Text>
        </View>
        <MaterialCommunityIcons name={expanded ? "chevron-up" : "chevron-down"} size={20} color="#475569" />
      </Pressable>
      {expanded ? (
        <View style={styles.bankDropdownMenu}>
          {options.map((option) => {
            const selected = option.value === method;
            return (
              <Pressable key={option.value} style={styles.bankDropdownOption} onPress={() => onSelect(option.value)}>
                <MaterialCommunityIcons name={option.icon} size={17} color={selected ? "#0f766e" : "#64748b"} />
                <View style={styles.paymentMethodText}>
                  <Text style={[styles.bankDropdownOptionText, selected && styles.bankDropdownOptionTextActive]} numberOfLines={1}>
                    {option.title}
                  </Text>
                  <Text style={styles.paymentMethodDetail}>{option.detail}</Text>
                </View>
                {selected ? <MaterialCommunityIcons name="check" size={18} color="#0f766e" /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function BankDropdown({
  bank,
  expanded,
  onSelect,
  onToggle
}: {
  bank?: string;
  expanded: boolean;
  onSelect: (bank: string) => void;
  onToggle: () => void;
}) {
  return (
    <View style={styles.bankDropdownBox}>
      <Text style={styles.bankLabel}>Banco</Text>
      <Pressable style={[styles.bankSelect, expanded && styles.bankSelectActive]} onPress={onToggle}>
        <Text style={[styles.bankSelectText, !bank && styles.bankSelectPlaceholder]} numberOfLines={1}>
          {bank || "Selecciona un banco..."}
        </Text>
        <MaterialCommunityIcons name={expanded ? "chevron-up" : "chevron-down"} size={20} color="#475569" />
      </Pressable>
      {expanded ? (
        <View style={styles.bankDropdownMenu}>
          {TRANSFER_BANK_OPTIONS.map((option) => {
            const selected = bank === option;
            return (
              <Pressable key={option} style={styles.bankDropdownOption} onPress={() => onSelect(option)}>
                <Text style={[styles.bankDropdownOptionText, selected && styles.bankDropdownOptionTextActive]}>{option}</Text>
                {selected ? <MaterialCommunityIcons name="check" size={18} color="#0f766e" /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function submitActionLabel(documentType: DocumentType, editingSale?: Sale, sourceTicket?: Sale, sourceProforma?: Sale) {
  if (sourceTicket) return "Autorizar ticket";
  if (sourceProforma) return documentType === "factura" ? "Autorizar proforma" : "Crear nota de venta";
  if (editingSale) return editingSale.documentType === "nota_venta" || editingSale.documentType === "proforma" ? "Guardar correccion" : "Guardar y reintentar";
  if (documentType === "proforma") return "Guardar proforma";
  if (documentType === "nota_venta") return "Guardar nota de venta";
  return "Autorizar en SRI";
}

function documentLabel(documentType: DocumentType) {
  if (documentType === "proforma") return "Proforma";
  if (documentType === "nota_venta") return "Nota de venta";
  return "Factura";
}

const styles = StyleSheet.create({
  saleGroup: {
    borderWidth: 1,
    borderColor: "#e2e7f0",
    borderRadius: 8,
    padding: 10,
    gap: 8,
    backgroundColor: "#fbfdff"
  },
  saleGroupCompact: {
    borderWidth: 1,
    borderColor: "#e2e7f0",
    borderRadius: 8,
    padding: 8,
    gap: 7,
    backgroundColor: "#ffffff"
  },
  checkoutOverlay: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: MODAL_SAFE_BOTTOM_PADDING + 20,
    zIndex: 60
  },
  checkoutBreakdown: {
    borderWidth: 1,
    borderColor: "#99f6e4",
    borderRadius: 14,
    backgroundColor: "#ffffff",
    padding: 12,
    gap: 8,
    marginBottom: 8,
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4
  },
  checkoutBreakdownHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  checkoutBreakdownTitle: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "900"
  },
  checkoutSmallToggle: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ecfdf5"
  },
  checkoutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  checkoutRowLabel: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800"
  },
  checkoutRowValue: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "900"
  },
  checkoutDiscountValue: {
    color: "#047857"
  },
  checkoutDock: {
    minHeight: 72,
    borderRadius: 14,
    backgroundColor: "#0f766e",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#0f172a",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6
  },
  checkoutToggle: {
    width: 44,
    height: 52,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center"
  },
  checkoutTotalBlock: {
    flex: 1,
    minWidth: 0
  },
  checkoutLabel: {
    color: "#d1fae5",
    fontSize: 12,
    fontWeight: "900"
  },
  checkoutTotal: {
    color: "#ffffff",
    fontSize: 26,
    fontWeight: "900"
  },
  checkoutMeta: {
    color: "#d1fae5",
    fontSize: 11,
    fontWeight: "800"
  },
  checkoutPayButton: {
    minWidth: 130,
    minHeight: 54,
    borderRadius: 12,
    backgroundColor: "#059669",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12
  },
  checkoutPayButtonDisabled: {
    opacity: 0.7
  },
  checkoutPayTextBlock: {
    minWidth: 0
  },
  checkoutPayTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900"
  },
  checkoutPayAmount: {
    color: "#d1fae5",
    fontSize: 13,
    fontWeight: "900"
  },
  paymentBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.42)",
    justifyContent: "flex-end",
    paddingHorizontal: MODAL_EDGE_PADDING,
    paddingTop: MODAL_EDGE_PADDING,
    paddingBottom: Platform.OS === "android"
      ? MODAL_SAFE_BOTTOM_PADDING
      : Platform.OS === "web"
        ? MODAL_EDGE_PADDING
        : 0
  },
  paymentSheet: {
    maxHeight: "92%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: Platform.OS === "android" || Platform.OS === "web" ? 18 : 0,
    borderBottomRightRadius: Platform.OS === "android" || Platform.OS === "web" ? 18 : 0,
    backgroundColor: "#ffffff",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#dbe4f0",
    paddingBottom: MODAL_SAFE_BOTTOM_PADDING
  },
  sheetHandle: {
    width: 56,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#dbe4ee",
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8
  },
  paymentHeader: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  paymentTitleBlock: {
    flex: 1,
    minWidth: 0
  },
  paymentTitle: {
    color: "#111827",
    fontSize: 22,
    fontWeight: "900"
  },
  paymentSubtitle: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800"
  },
  roundCloseButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center"
  },
  paymentContent: {
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: MODAL_SAFE_BOTTOM_PADDING + 16,
    gap: 12
  },
  amountHero: {
    borderRadius: 18,
    backgroundColor: "#d1fae5",
    minHeight: 104,
    alignItems: "center",
    justifyContent: "center",
    gap: 5
  },
  amountHeroLabel: {
    color: "#0f766e",
    fontSize: 15,
    fontWeight: "900"
  },
  amountHeroValue: {
    color: "#047857",
    fontSize: 34,
    fontWeight: "900"
  },
  conditionBox: {
    gap: 8
  },
  conditionTitle: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "900"
  },
  conditionGrid: {
    flexDirection: "row",
    gap: 8
  },
  conditionCard: {
    flex: 1,
    minHeight: 62,
    borderWidth: 1,
    borderColor: "#d5deea",
    borderRadius: 12,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ffffff"
  },
  conditionCardSelected: {
    borderColor: "#0f766e",
    backgroundColor: "#ecfdf5"
  },
  conditionText: {
    flex: 1,
    minWidth: 0
  },
  conditionName: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900"
  },
  conditionNameSelected: {
    color: "#0f766e"
  },
  conditionDetail: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800"
  },
  creditDueBox: {
    borderWidth: 1,
    borderColor: "#dbeafe",
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#f8fbff",
    gap: 6
  },
  creditDueNote: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800"
  },
  splitBox: {
    borderWidth: 1,
    borderColor: "#dbe4f0",
    borderRadius: 14,
    padding: 10,
    backgroundColor: "#f8fafc",
    gap: 10
  },
  splitHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  splitTitle: {
    color: "#1f2937",
    fontSize: 14,
    fontWeight: "900"
  },
  splitHelp: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 11,
    fontWeight: "800",
    maxWidth: 220
  },
  splitStatus: {
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: "900"
  },
  splitStatusBalanced: {
    color: "#047857",
    backgroundColor: "#dcfce7"
  },
  splitStatusWarning: {
    color: "#92400e",
    backgroundColor: "#fef3c7"
  },
  splitCard: {
    borderWidth: 1,
    borderColor: "#dbe4f0",
    borderRadius: 12,
    padding: 10,
    backgroundColor: "#ffffff",
    gap: 9
  },
  splitCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  splitCardTitle: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "900"
  },
  splitRemoveButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fee2e2"
  },
  paymentCompactCard: {
    borderWidth: 1,
    borderColor: "#dbe4f0",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    overflow: "visible"
  },
  paymentCompactRow: {
    minHeight: 58,
    paddingHorizontal: 7,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 5
  },
  paymentRowNumber: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center"
  },
  paymentRowNumberText: {
    color: "#0f766e",
    fontSize: 11,
    fontWeight: "900"
  },
  paymentRowMethod: {
    flex: 1,
    minWidth: 0
  },
  paymentAmountInput: {
    width: 74,
    minHeight: 40,
    borderWidth: 1,
    borderColor: "#d5deea",
    borderRadius: 10,
    paddingHorizontal: 7,
    color: "#111827",
    fontSize: 13,
    fontWeight: "900",
    textAlign: "right",
    backgroundColor: "#ffffff"
  },
  paymentRowRemove: {
    width: 30,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fee2e2"
  },
  paymentRowSpacer: {
    width: 30,
    height: 38
  },
  paymentCompactExtra: {
    borderTopWidth: 1,
    borderTopColor: "#eef2f7",
    padding: 8,
    gap: 8
  },
  splitMethodGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  splitMethodChip: {
    width: "48%",
    minHeight: 54,
    borderWidth: 1,
    borderColor: "#d5deea",
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff"
  },
  splitMethodChipSelected: {
    borderColor: "#0f766e",
    backgroundColor: "#ecfdf5"
  },
  splitMethodIcon: {
    marginRight: 7
  },
  splitMethodText: {
    flex: 1,
    minWidth: 0
  },
  splitMethodTitle: {
    color: "#334155",
    fontSize: 11,
    fontWeight: "900"
  },
  splitMethodTitleSelected: {
    color: "#0f766e"
  },
  splitMethodDetail: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 9,
    fontWeight: "800"
  },
  splitEmptyBox: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#bfdbfe",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#eff6ff"
  },
  splitEmptyText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center"
  },
  splitFooter: {
    gap: 7
  },
  splitAddButton: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#99f6e4",
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7
  },
  splitAddButtonDisabled: {
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc"
  },
  splitAddText: {
    color: "#0f766e",
    fontSize: 13,
    fontWeight: "900"
  },
  splitAddTextDisabled: {
    color: "#64748b"
  },
  splitAssigned: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "900",
    textAlign: "right"
  },
  bankDropdownBox: {
    gap: 5
  },
  paymentMethodDropdownBox: {
    gap: 5
  },
  paymentMethodDropdownCompact: {
    flex: 1,
    minWidth: 0
  },
  paymentMethodSelect: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#d5deea",
    borderRadius: 10,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ffffff"
  },
  paymentMethodSelectCompact: {
    minHeight: 40,
    paddingHorizontal: 7,
    gap: 5,
    borderColor: "#dbe4f0",
    backgroundColor: "#f8fafc"
  },
  paymentMethodText: {
    flex: 1,
    minWidth: 0
  },
  paymentMethodTitle: {
    color: "#334155",
    fontSize: 10,
    fontWeight: "900"
  },
  paymentMethodDetail: {
    marginTop: 1,
    color: "#64748b",
    fontSize: 8,
    fontWeight: "800"
  },
  bankLabel: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900"
  },
  bankSelect: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#d5deea",
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff"
  },
  bankSelectActive: {
    borderColor: "#0f766e"
  },
  bankSelectText: {
    flex: 1,
    color: "#111827",
    fontSize: 13,
    fontWeight: "800"
  },
  bankSelectPlaceholder: {
    color: "#64748b"
  },
  bankDropdownMenu: {
    borderWidth: 1,
    borderColor: "#dbe4f0",
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#ffffff"
  },
  bankDropdownOption: {
    minHeight: 42,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f7"
  },
  bankDropdownOptionText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "800"
  },
  bankDropdownOptionTextActive: {
    color: "#0f766e",
    fontWeight: "900"
  },
  creditPaymentCard: {
    borderColor: "#bfdbfe",
    backgroundColor: "#f8fbff"
  },
  creditMethodInfo: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  creditMethodTitle: {
    color: "#0f766e",
    fontSize: 13,
    fontWeight: "900"
  },
  creditMethodDetail: {
    marginTop: 1,
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800"
  },
  creditAmountText: {
    minWidth: 76,
    color: "#0f766e",
    fontSize: 16,
    fontWeight: "900",
    textAlign: "right"
  },
  creditInlineFields: {
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    padding: 9,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8
  },
  creditTermColumn: {
    flex: 0.95,
    minWidth: 0,
    gap: 4
  },
  creditTermLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "900"
  },
  creditTermSelect: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: "#dbe4f0",
    borderRadius: 10,
    paddingHorizontal: 10,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6
  },
  creditTermSelectActive: {
    borderColor: "#0f766e",
    backgroundColor: "#ecfdf5"
  },
  creditTermSelectText: {
    flex: 1,
    minWidth: 0,
    color: "#111827",
    fontSize: 12,
    fontWeight: "900"
  },
  creditTermMenu: {
    marginTop: 2,
    borderWidth: 1,
    borderColor: "#dbe4f0",
    borderRadius: 10,
    backgroundColor: "#ffffff",
    overflow: "hidden"
  },
  creditTermOption: {
    minHeight: 34,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f7"
  },
  creditTermOptionText: {
    flex: 1,
    minWidth: 0,
    color: "#475569",
    fontSize: 11,
    fontWeight: "900"
  },
  creditTermOptionTextActive: {
    color: "#0f766e"
  },
  creditDateBox: {
    flex: 1.2,
    minWidth: 0
  },
  creditGeneratedNotice: {
    marginHorizontal: 9,
    marginBottom: 9,
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  creditGeneratedText: {
    flex: 1,
    minWidth: 0,
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: "800"
  },
  paymentSummaryStrip: {
    borderWidth: 1,
    borderColor: "#dbe4f0",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    overflow: "hidden"
  },
  paymentSummaryCell: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: "#e2e8f0"
  },
  paymentSummaryLabel: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "900",
    textAlign: "center"
  },
  paymentSummaryValue: {
    marginTop: 3,
    color: "#111827",
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center"
  },
  paymentSummaryOk: {
    color: "#059669"
  },
  changeBox: {
    borderRadius: 10,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  changeLabel: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "900"
  },
  changeValue: {
    color: "#047857",
    fontSize: 16,
    fontWeight: "900"
  },
  paymentHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 30
  },
  paymentHintText: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center"
  }
});
