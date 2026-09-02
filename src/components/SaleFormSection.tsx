import React, { useEffect, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { LIST_BATCH_SIZE } from "../constants/app";
import {
  KEYBOARD_AVOIDING_BEHAVIOR,
  MODAL_EDGE_PADDING,
  MODAL_KEYBOARD_CONTENT_BOTTOM_PADDING,
  MODAL_SAFE_BOTTOM_PADDING
} from "../constants/layout";
import { useKeyboardInset } from "../hooks/useKeyboardInset";
import { AdditionalInfoField, Client, DocumentType, PaymentMethod, Product, Sale, SaleItem, SalePaymentSplit, SalePriceTier } from "../types";
import { PaymentCondition } from "../types";
import { money } from "../sri";
import { toInputDate } from "../utils/format";
import { documentTypeLabel } from "../utils/sales";
import { documentCollectsPayment } from "../utils/documentWorkflow";
import { showWarning } from "../utils/dialogs";
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
import { useAppTheme } from "../theme/AppTheme";

import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  backendUrl: string;
  backendToken: string;
  addProductById: (productId: string) => boolean;
  addProductSearchSubmit: () => void;
  additionalInfo: AdditionalInfoField[];
  adjustSaleLineQuantity: (index: number, delta: number) => void;
  changeLinePriceTier: (index: number, tier: SalePriceTier) => boolean;
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
  selectedClient?: Client;
  selectedProduct?: Product;
  selectedProductLowStock: boolean;
  salePriceTier: SalePriceTier;
  onSalePriceTierChange: (tier: SalePriceTier) => void;
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
  products: Product[];
};

export function SaleFormSection({
  backendUrl,
  backendToken,
  addProductById,
  addProductSearchSubmit,
  additionalInfo,
  adjustSaleLineQuantity,
  changeLinePriceTier,
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
  selectedClient,
  selectedProduct,
  selectedProductLowStock,
  salePriceTier,
  onSalePriceTierChange,
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
  visibleProductsForSale,
  products
}: SaleFormSectionProps) {
  const { theme } = useAppTheme();
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [checkoutSummaryOpen, setCheckoutSummaryOpen] = useState(false);
  const { setOverlay } = useFloatingOverlay();
  const creditAllowed = Boolean(selectedClient && !isConsumerFinalClient(selectedClient));
  const paymentActionLabel = submitActionLabel(documentType, editingSale, sourceTicket, sourceProforma);
  const effectiveDocumentType = sourceTicket || sourceProforma ? documentType : editingSale?.documentType || documentType;
  const collectsPayment = documentCollectsPayment(effectiveDocumentType);
  const itemCount = items.length;
  const unitCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const openPaymentModal = React.useCallback(() => {
    if (issuing) return;
    if (!collectsPayment) {
      issue();
      return;
    }
    setSalePayments((current) =>
      paymentCondition === "credito"
        ? normalizePartialSalePayments(current, paymentMethod)
        : normalizeSalePayments(current, paymentMethod, saleSummaryTotals.total)
    );
    setPaymentModalVisible(true);
  }, [collectsPayment, issue, issuing, paymentCondition, paymentMethod, saleSummaryTotals.total, setSalePayments]);
  const showCreditClientRequired = React.useCallback(() => {
    setPaymentModalVisible(false);
    setTimeout(() => {
      showWarning("Cliente requerido para crédito", "Para vender a crédito, seleccione o agregue un cliente identificado. Consumidor Final no puede utilizar esta forma de pago.");
    }, 100);
  }, []);
  const confirmPayment = () => {
    const resolvedPayments =
      paymentCondition === "credito"
        ? normalizePartialSalePayments(salePayments, paymentMethod)
        : normalizeSalePayments(salePayments, paymentMethod, saleSummaryTotals.total);
    const balance = salePaymentBalance(saleSummaryTotals.total, resolvedPayments);

    if (paymentCondition === "credito") {
      if (!creditAllowed) {
        showCreditClientRequired();
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
        proformaMode={effectiveDocumentType === "proforma"}
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
    effectiveDocumentType,
    issuing,
    itemCount,
    openPaymentModal,
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
      <View style={[styles.saleGroupCompact, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
        <DocumentTypeSelector
          value={documentType}
          editingSale={editingSale}
          nextDocumentLabel={nextDocumentLabel}
          sourceTicket={sourceTicket}
          sourceProforma={sourceProforma}
          onChange={setDocumentType}
        />
      </View>
      <View style={[styles.saleGroup, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
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

      <View style={[styles.saleGroup, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
        <SaleProductPicker
          backendUrl={backendUrl}
          backendToken={backendToken}
          search={productSearch}
          selectedProductId={productId}
          visibleProducts={visibleProductsForSale}
          filteredProductCount={filteredProductCount}
          canLoadMore={visibleProductsForSale.length < filteredProductCount}
          onSearchChange={setProductSearch}
          onSearchSubmit={addProductSearchSubmit}
          onOpenScanner={onOpenScanner}
          onLoadMore={() => setVisibleProductCount((count) => count + LIST_BATCH_SIZE)}
          onAddProduct={addProductById}
          priceTier={salePriceTier}
          onPriceTierChange={onSalePriceTierChange}
        />
        <SaleProductControls
          product={selectedProduct}
          lowStock={selectedProductLowStock}
          projectedStock={projectedStock}
        />
      </View>

      <SaleItemsList
        backendUrl={backendUrl}
        backendToken={backendToken}
        items={items}
        products={products}
        onAdjustQuantity={adjustSaleLineQuantity}
        onChangePriceTier={changeLinePriceTier}
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
        visible={paymentModalVisible && collectsPayment}
        actionLabel={paymentActionLabel}
        creditAllowed={creditAllowed}
        creditDueDate={creditDueDate}
        documentType={documentType}
        issuing={issuing}
        onClose={() => setPaymentModalVisible(false)}
        onConfirm={confirmPayment}
        onCreditClientRequired={showCreditClientRequired}
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
  onCreditClientRequired: () => void;
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
  onCreditClientRequired,
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
  const { theme } = useAppTheme();
  const [cashShortfall, setCashShortfall] = useState(0);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const keyboardInset = useKeyboardInset();
  const androidKeyboardInset = Platform.OS === "android" ? keyboardInset : 0;
  const safeTopPadding = Platform.OS === "web" ? MODAL_EDGE_PADDING : Math.max(insets.top, MODAL_EDGE_PADDING);
  const safeBottomPadding = Platform.OS === "web" ? MODAL_EDGE_PADDING : Math.max(insets.bottom, MODAL_SAFE_BOTTOM_PADDING);
  const adaptiveMaxHeight = Math.max(320, windowHeight - safeTopPadding - safeBottomPadding);
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
  const confirmWithCashValidation = () => {
    if (cashShortfall > 0.009) {
      Alert.alert("Efectivo insuficiente", `Faltan $${money(cashShortfall)} del efectivo aplicado.`);
      return;
    }
    onConfirm();
  };

  useEffect(() => {
    if (!visible) setCashShortfall(0);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.paymentKeyboardAvoiding} behavior={KEYBOARD_AVOIDING_BEHAVIOR} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
      <View style={[styles.paymentBackdrop, { backgroundColor: theme.colors.backdrop }, Platform.OS !== "web" && { paddingTop: safeTopPadding, paddingBottom: safeBottomPadding }, androidKeyboardInset > 0 && { paddingBottom: androidKeyboardInset + safeBottomPadding }]}>
        <View style={[styles.paymentSheet, { backgroundColor: theme.colors.surface, shadowColor: theme.colors.shadow }, Platform.OS !== "web" && { maxHeight: adaptiveMaxHeight, flexShrink: 1 }]}>
          <View style={[styles.sheetHandle, { backgroundColor: theme.colors.borderStrong }]} />
          <View style={styles.paymentHeader}>
            <View style={styles.paymentTitleBlock}>
              <Text style={[styles.paymentTitle, { color: theme.colors.text }]}>Cobro de la venta</Text>
              <Text style={[styles.paymentSubtitle, { color: theme.colors.textMuted }]}>{documentLabel(documentType)}</Text>
            </View>
            <Pressable style={[styles.roundCloseButton, { backgroundColor: theme.colors.primarySoft }]} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={22} color={theme.colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={[styles.paymentContent, androidKeyboardInset > 0 && { paddingBottom: androidKeyboardInset + MODAL_KEYBOARD_CONTENT_BOTTOM_PADDING }]} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"} showsVerticalScrollIndicator={false}>
            <View style={[styles.amountHero, { backgroundColor: theme.colors.successSoft }]}>
              <Text style={[styles.amountHeroLabel, { color: theme.colors.success }]}>Total a cobrar</Text>
              <Text style={[styles.amountHeroValue, { color: theme.colors.success }]}>${money(total)}</Text>
            </View>
            <SaleSplitPaymentsEditor
              creditAllowed={creditAllowed}
              creditDueDate={creditDueDate}
              fallbackMethod={paymentMethod}
              onChange={onSalePaymentsChange}
              onCreditClientRequired={onCreditClientRequired}
              onCreditDueDateChange={onCreditDueDateChange}
              onPaymentConditionChange={handlePaymentConditionChange}
              onPrimaryMethodChange={onPaymentMethodChange}
              onCashShortfallChange={setCashShortfall}
              paymentCondition={paymentCondition}
              payments={salePayments}
              total={total}
            />
            <View style={styles.paymentHint}>
              <MaterialCommunityIcons name={isInvoice ? "shield-check-outline" : "file-check-outline"} size={18} color={theme.colors.primary} />
              <Text style={[styles.paymentHintText, { color: theme.colors.textMuted }]}>{helperText}</Text>
            </View>
            <SaleSubmitButton
              issuing={issuing}
              documentType={documentType}
              total={total}
              labelOverride={actionLabel}
              onSubmit={confirmWithCashValidation}
            />
          </ScrollView>
        </View>
      </View>
      </KeyboardAvoidingView>
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
  proformaMode,
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
  proformaMode: boolean;
  subtotal: number;
  tax: number;
  total: number;
  unitCount: number;
}) {
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();

  return (
    <View
  pointerEvents="box-none"
  style={[
    styles.checkoutOverlay,
    {
      bottom: 63 + Math.max(insets.bottom, 8) + 2
    }
  ]}
>

      {expanded ? (
        <View style={[styles.checkoutBreakdown, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, shadowColor: theme.colors.shadow }]}>
          <View style={styles.checkoutBreakdownHeader}>
            <View>
              <Text style={[styles.checkoutBreakdownTitle, { color: theme.colors.text }]}>Desglose</Text>
              <Text style={[styles.checkoutBreakdownMeta, { color: theme.colors.textMuted }]}>{itemCount} líneas | {unitCount} unidades</Text>
            </View>
            <Pressable style={[styles.checkoutSmallToggle, { backgroundColor: theme.colors.primarySoft }]} onPress={onToggle}>
              <MaterialCommunityIcons name="chevron-down" size={20} color={theme.colors.primary} />
            </Pressable>
          </View>
          <View style={styles.checkoutRow}>
            <Text style={[styles.checkoutRowLabel, { color: theme.colors.textMuted }]}>Subtotal</Text>
            <Text style={[styles.checkoutRowValue, { color: theme.colors.text }]}>${money(subtotal)}</Text>
          </View>
          <View style={styles.checkoutRow}>
            <Text style={[styles.checkoutRowLabel, { color: theme.colors.textMuted }]}>Descuento</Text>
            <Text style={[styles.checkoutRowValue, { color: discount > 0 ? theme.colors.success : theme.colors.text }]}>${money(discount)}</Text>
          </View>
          <View style={styles.checkoutRow}>
            <Text style={[styles.checkoutRowLabel, { color: theme.colors.textMuted }]}>IVA</Text>
            <Text style={[styles.checkoutRowValue, { color: theme.colors.text }]}>${money(tax)}</Text>
          </View>
        </View>
      ) : null}
      <View style={styles.checkoutDock}>
        <Pressable style={styles.checkoutToggle} onPress={onToggle}>
          <MaterialCommunityIcons name={expanded ? "chevron-down" : "chevron-up"} size={24} color="#d1fae5" />
        </Pressable>
        <View style={styles.checkoutTotalBlock}>
          <Text style={styles.checkoutLabel}>{proformaMode ? "Total proforma" : "Total a cobrar"}</Text>
          <Text style={styles.checkoutTotal}>${money(total)}</Text>
        </View>
        <Pressable style={[styles.checkoutPayButton, issuing && styles.checkoutPayButtonDisabled]} onPress={issuing ? undefined : onSubmit}>
          <MaterialCommunityIcons name={proformaMode ? "file-document-check-outline" : "wallet-outline"} size={21} color="#ffffff" />
          <View style={styles.checkoutPayTextBlock}>
            <Text style={styles.checkoutPayTitle}>{issuing ? "Procesando..." : proformaMode ? "Guardar proforma" : "Cobrar"}</Text>
            {!proformaMode ? <Text style={styles.checkoutPayAmount}>${money(total)}</Text> : null}
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
  onCreditClientRequired,
  onCreditDueDateChange,
  onPaymentConditionChange,
  onPrimaryMethodChange,
  onCashShortfallChange,
  paymentCondition,
  payments,
  total
}: {
  creditAllowed: boolean;
  creditDueDate: string;
  fallbackMethod: PaymentMethod;
  onChange: React.Dispatch<React.SetStateAction<SalePaymentSplit[]>>;
  onCreditClientRequired: () => void;
  onCreditDueDateChange: (value: string) => void;
  onPaymentConditionChange: (value: PaymentCondition) => void;
  onPrimaryMethodChange?: (method: PaymentMethod) => void;
  onCashShortfallChange: (value: number) => void;
  paymentCondition: PaymentCondition;
  payments: SalePaymentSplit[];
  total: number;
}) {
  const { theme } = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const stackedPaymentLayout = windowWidth < 520;
  const [openBankPickerId, setOpenBankPickerId] = useState<string | null>(null);
  const [openMethodPickerId, setOpenMethodPickerId] = useState<string | null>(null);
  const [creditTermExpanded, setCreditTermExpanded] = useState(false);
  const creditTermTriggerRef = React.useRef<View | null>(null);
  const [creditTermAnchor, setCreditTermAnchor] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const creditTermMenuWidth = Math.min(220, windowWidth - 16);
  const [expandedTransferReferences, setExpandedTransferReferences] = useState<Record<string, boolean>>({});
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [cashTenderDrafts, setCashTenderDrafts] = useState<Record<string, string>>({});
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
  const usedPaymentMethods = new Set(normalizedPayments.map((payment) => payment.paymentMethod));
  const nextAvailablePaymentMethod = SPLIT_PAYMENT_METHOD_OPTIONS.find((option) => !usedPaymentMethods.has(option.value))?.value;
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
    total > 0.009 && !overpaid && Boolean(nextAvailablePaymentMethod) && (isCredit ? creditAmount > 0.009 : balance > 0.009 || canAddEmptySplitPayment);
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
  const cashShortfall = displayedPayments.reduce((sum, payment) => {
    if (payment.paymentMethod !== "01") return sum;
    const applied = parsePaymentAmount(payment.amount);
    const tendered = parsePaymentAmount(cashTenderDrafts[payment.id] ?? applied);
    return sum + Math.max(0, applied - tendered);
  }, 0);

  useEffect(() => {
    onCashShortfallChange(cashShortfall);
  }, [cashShortfall, onCashShortfallChange]);

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
        if (!nextAvailablePaymentMethod) return source;
        return [...source, createSalePayment(nextAvailablePaymentMethod, 0)];
      }
      if (!nextAvailablePaymentMethod) return source;
      return [...source, createSalePayment(nextAvailablePaymentMethod, pending)];
    });
  };

  const updatePaymentAmount = (payment: SalePaymentSplit, rawValue: string) => {
    const sanitized = normalizePaymentAmountInput(rawValue);
    setManualPaymentAmounts((current) => ({ ...current, [payment.id]: true }));
    setAmountDrafts((current) => ({ ...current, [payment.id]: sanitized }));
    updatePayment(payment.id, { amount: parsePaymentAmount(sanitized) });
  };

  const updateCashTendered = (paymentId: string, rawValue: string) => {
    const sanitized = normalizePaymentAmountInput(rawValue);
    setCashTenderDrafts((current) => ({ ...current, [paymentId]: sanitized }));
  };

  const selectPaymentMethod = (payment: SalePaymentSplit, index: number, method: PaymentChoice) => {
    if (method === "credito") {
      if (!creditAllowed) {
        setOpenMethodPickerId(null);
        onCreditClientRequired();
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
    setCashTenderDrafts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setExpandedTransferReferences((current) => {
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
    <View style={[styles.splitBox, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted }]}>
      <View style={styles.splitHeader}>
        <View>
          <Text style={[styles.splitTitle, { color: theme.colors.text }]}>Metodos de pago</Text>
          <Text style={[styles.splitHelp, { color: theme.colors.textMuted }]}>Distribuye el total entre uno o varios metodos.</Text>
        </View>
        <Text style={[styles.splitStatus, { backgroundColor: balanced ? theme.colors.successSoft : theme.colors.warningSoft, color: balanced ? theme.colors.success : theme.colors.warning }]}>{statusLabel}</Text>
      </View>

      {displayedPayments.map((payment, index) => {
        const selectedChoice: PaymentChoice = payment.paymentMethod;
        const isTransfer = payment.paymentMethod === "20";
        const isCash = payment.paymentMethod === "01";
        const appliedAmount = parsePaymentAmount(payment.amount);
        const cashTenderedValue = cashTenderDrafts[payment.id] ?? (appliedAmount ? money(appliedAmount) : "");
        const cashTenderedAmount = parsePaymentAmount(cashTenderedValue);
        const cashChange = Math.max(0, cashTenderedAmount - appliedAmount);
        const transferReferenceVisible = Boolean(payment.reference) || Boolean(expandedTransferReferences[payment.id]);
        const amountInput = (
          <TextInput
            style={[styles.paymentAmountInput, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, color: theme.colors.text }, stackedPaymentLayout && styles.paymentAmountInputStacked]}
            value={amountDrafts[payment.id] ?? (payment.amount ? String(payment.amount) : "")}
            onChangeText={(value) => updatePaymentAmount(payment, value)}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={theme.colors.textSubtle}
            selectTextOnFocus
          />
        );
        return (
          <View key={payment.id} style={[styles.paymentCompactCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
            <View style={[styles.paymentCompactRow, stackedPaymentLayout && styles.paymentCompactRowStacked]}>
              <View style={[styles.paymentRowNumber, { backgroundColor: theme.colors.primarySoft }]}>
                <Text style={[styles.paymentRowNumberText, { color: theme.colors.primary }]}>{index + 1}</Text>
              </View>
              <View style={styles.paymentRowMethod}>
                <PaymentMethodDropdown
                  compact
                  expanded={openMethodPickerId === payment.id}
                  excludedMethods={[
                    ...displayedPayments.filter((item) => item.id !== payment.id).map((item) => item.paymentMethod),
                    ...(isCredit ? ["credito" as const] : [])
                  ]}
                  includeCredit
                  method={selectedChoice}
                  onSelect={(method) => selectPaymentMethod(payment, index, method)}
                  onToggle={() => setOpenMethodPickerId((current) => (current === payment.id ? null : payment.id))}
                />
              </View>
              {!stackedPaymentLayout ? amountInput : null}
              {displayedPayments.length > 1 || isCredit ? (
                <Pressable style={[styles.paymentRowRemove, { backgroundColor: theme.colors.dangerSoft }]} onPress={() => removePayment(payment.id)}>
                  <MaterialCommunityIcons name="trash-can-outline" size={17} color={theme.colors.danger} />
                </Pressable>
              ) : (
                <View style={styles.paymentRowSpacer} />
              )}
            </View>
            {stackedPaymentLayout ? (
              isCash ? (
                <View style={styles.cashPaymentSummaryRow}>
                  <View style={styles.cashPaymentColumn}>
                    <Text style={[styles.cashPaymentLabel, { color: theme.colors.textMuted }]}>Aplicado</Text>
                    {amountInput}
                  </View>
                  <View style={styles.cashPaymentColumn}>
                    <Text style={[styles.cashPaymentLabel, { color: theme.colors.textMuted }]}>Cliente entrega</Text>
                    <TextInput
                      style={[styles.paymentAmountInput, styles.paymentAmountInputStacked, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, color: theme.colors.text }]}
                      value={cashTenderedValue}
                      onChangeText={(value) => updateCashTendered(payment.id, value)}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={theme.colors.textSubtle}
                      selectTextOnFocus
                    />
                  </View>
                  <View style={styles.cashChangeColumn}>
                    <Text style={[styles.cashPaymentLabel, { color: theme.colors.textMuted }]}>{cashTenderedAmount + 0.009 < appliedAmount ? "Falta" : "Cambio"}</Text>
                    <Text style={[styles.cashChangeValue, { color: theme.colors.success }, cashTenderedAmount + 0.009 < appliedAmount && { color: theme.colors.danger }]}>
                      ${money(cashTenderedAmount + 0.009 < appliedAmount ? appliedAmount - cashTenderedAmount : cashChange)}
                    </Text>
                  </View>
                </View>
              ) : isTransfer ? null : (
                <View style={styles.paymentAmountRow}>
                  <Text style={styles.paymentAmountLabel}>Valor a cobrar</Text>
                  {amountInput}
                </View>
              )
            ) : null}
            {!stackedPaymentLayout && isCash ? (
              <View style={styles.cashWideRow}>
                <Text style={styles.paymentAmountLabel}>Cliente entrega</Text>
                <TextInput
                  style={styles.paymentAmountInput}
                  value={cashTenderedValue}
                  onChangeText={(value) => updateCashTendered(payment.id, value)}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor="#94a3b8"
                  selectTextOnFocus
                />
                <Text style={styles.cashWideChange}>{cashTenderedAmount + 0.009 < appliedAmount ? "Falta" : "Cambio"} ${money(cashTenderedAmount + 0.009 < appliedAmount ? appliedAmount - cashTenderedAmount : cashChange)}</Text>
              </View>
            ) : null}
            {isTransfer ? (
              <View style={styles.paymentCompactExtra}>
                <View style={stackedPaymentLayout ? styles.paymentCompactExtraInline : undefined}>
                  {stackedPaymentLayout ? (
                    <View style={[styles.paymentExtraField, styles.paymentAppliedField]}>
                      <Text style={styles.bankLabel}>Aplicado</Text>
                      {amountInput}
                    </View>
                  ) : null}
                  <View style={styles.paymentExtraField}>
                    <BankDropdown
                      bank={payment.bank}
                      expanded={openBankPickerId === payment.id}
                      onToggle={() => setOpenBankPickerId((current) => (current === payment.id ? null : payment.id))}
                      onSelect={(bank) => {
                        updatePayment(payment.id, { bank });
                        setOpenBankPickerId(null);
                      }}
                    />
                  </View>
                  {!stackedPaymentLayout ? (
                    <View style={styles.paymentExtraField}>
                      <Input
                        label="Referencia (opcional)"
                        value={payment.reference || ""}
                        onChangeText={(value) => updatePayment(payment.id, { reference: value })}
                        placeholder="Comprobante"
                      />
                    </View>
                  ) : null}
                </View>
                {stackedPaymentLayout && transferReferenceVisible ? (
                  <Input
                    label="Referencia (opcional)"
                    value={payment.reference || ""}
                    onChangeText={(value) => updatePayment(payment.id, { reference: value })}
                    placeholder="Numero de comprobante"
                  />
                ) : null}
                {stackedPaymentLayout && !payment.reference ? (
                  <Pressable
                    style={styles.transferReferenceToggle}
                    onPress={() => setExpandedTransferReferences((current) => ({ ...current, [payment.id]: !current[payment.id] }))}
                  >
                    <MaterialCommunityIcons name={transferReferenceVisible ? "chevron-up" : "plus"} size={15} color="#0f766e" />
                    <Text style={styles.transferReferenceToggleText}>{transferReferenceVisible ? "Ocultar referencia" : "Agregar referencia"}</Text>
                  </Pressable>
                ) : null}
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
                ref={creditTermTriggerRef}
                style={[styles.creditTermSelect, creditTermExpanded && styles.creditTermSelectActive]}
                onPress={() => {
                  if (creditTermExpanded) {
                    setCreditTermExpanded(false);
                    return;
                  }
                  creditTermTriggerRef.current?.measureInWindow((x, y, width, height) => {
                    setCreditTermAnchor({ x, y, width, height });
                    setCreditTermExpanded(true);
                  });
                }}
              >
                <Text style={styles.creditTermSelectText} numberOfLines={1}>
                  {creditTermLabel}
                </Text>
                <MaterialCommunityIcons name={creditTermExpanded ? "chevron-up" : "chevron-down"} size={18} color="#475569" />
              </Pressable>
              {creditTermExpanded ? (
                <Modal transparent animationType="fade" visible onRequestClose={() => setCreditTermExpanded(false)}>
                  <Pressable style={styles.paymentMethodBackdrop} onPress={() => setCreditTermExpanded(false)}>
                    <Pressable style={[styles.paymentMethodFloatingMenu, { width: creditTermMenuWidth, left: Math.max(8, Math.min(creditTermAnchor.x, windowWidth - creditTermMenuWidth - 8)), top: creditTermAnchor.y + creditTermAnchor.height + 4, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]} onPress={(event) => event.stopPropagation()}>
                      {CREDIT_TERM_OPTIONS.map((option) => {
                        const selected = selectedCreditTerm?.days === option.days;
                        return (
                          <Pressable key={option.days} accessibilityRole="button" accessibilityState={{ selected }} style={[styles.creditTermOption, selected && { backgroundColor: theme.colors.primarySoft }]} onPress={() => changeCreditDueDate(dateForCreditTerm(option.days))}>
                            <Text style={[styles.creditTermOptionText, selected && styles.creditTermOptionTextActive]}>{option.label}</Text>
                            {selected ? <MaterialCommunityIcons name="check" size={17} color="#0f766e" /> : null}
                          </Pressable>
                        );
                      })}
                    </Pressable>
                  </Pressable>
                </Modal>
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
  excludedMethods = [],
  includeCredit = true,
  method,
  onSelect,
  onToggle
}: {
  compact?: boolean;
  expanded: boolean;
  excludedMethods?: PaymentChoice[];
  includeCredit?: boolean;
  method: PaymentChoice;
  onSelect: (method: PaymentChoice) => void;
  onToggle: () => void;
}) {
  const { theme } = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const triggerRef = React.useRef<View | null>(null);
  const [anchor, setAnchor] = React.useState({ x: 0, y: 0, width: 0, height: 0 });
  const menuWidth = Math.min(240, windowWidth - 16);
  const options = PAYMENT_CHOICE_OPTIONS.filter(
    (option) =>
      (includeCredit || option.value !== "credito") &&
      (option.value === method || !excludedMethods.includes(option.value))
  );
  const selectedOption =
    options.find((option) => option.value === method) ||
    PAYMENT_CHOICE_OPTIONS.find((option) => option.value === method) ||
    PAYMENT_CHOICE_OPTIONS.find((option) => option.value === "01");
  if (!selectedOption) {
    return null;
  }
  const toggle = () => {
    if (expanded) {
      onToggle();
      return;
    }
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      onToggle();
    });
  };

  return (
    <View style={[styles.paymentMethodDropdownBox, compact && styles.paymentMethodDropdownCompact]}>
      {compact ? null : <Text style={[styles.bankLabel, { color: theme.colors.textMuted }]}>Forma de pago</Text>}
      <Pressable ref={triggerRef} style={[styles.paymentMethodSelect, compact && styles.paymentMethodSelectCompact, { borderColor: expanded ? theme.colors.primary : theme.colors.border, backgroundColor: theme.colors.surface }]} onPress={toggle}>
        <MaterialCommunityIcons name={selectedOption.icon as MaterialIconName} size={18} color={theme.colors.primary} />
        <View style={styles.paymentMethodText}>
          <Text style={[styles.paymentMethodTitle, { color: theme.colors.text }]} numberOfLines={1}>
            {selectedOption.title}
          </Text>
          <Text style={[styles.paymentMethodDetail, { color: theme.colors.textMuted }]}>{selectedOption.detail}</Text>
        </View>
        <MaterialCommunityIcons name={expanded ? "chevron-up" : "chevron-down"} size={20} color={theme.colors.textMuted} />
      </Pressable>
      {expanded ? (
        <Modal transparent animationType="fade" visible onRequestClose={onToggle}>
          <Pressable style={styles.paymentMethodBackdrop} onPress={onToggle}>
            <Pressable style={[styles.paymentMethodFloatingMenu, { width: menuWidth, left: Math.max(8, Math.min(anchor.x, windowWidth - menuWidth - 8)), top: anchor.y + anchor.height + 4, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]} onPress={(event) => event.stopPropagation()}>
              {options.map((option) => {
                const selected = option.value === method;
                return (
                  <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected }} style={[styles.bankDropdownOption, { borderBottomColor: theme.colors.border }, selected && { backgroundColor: theme.colors.primarySoft }]} onPress={() => onSelect(option.value)}>
                    <MaterialCommunityIcons name={option.icon} size={17} color={selected ? theme.colors.primary : theme.colors.textMuted} />
                    <View style={styles.paymentMethodText}>
                      <Text style={[styles.bankDropdownOptionText, { color: selected ? theme.colors.primary : theme.colors.text }]} numberOfLines={1}>{option.title}</Text>
                      <Text style={[styles.paymentMethodDetail, { color: theme.colors.textMuted }]}>{option.detail}</Text>
                    </View>
                    {selected ? <MaterialCommunityIcons name="check" size={18} color={theme.colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </Pressable>
          </Pressable>
        </Modal>
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
  const { theme } = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const triggerRef = React.useRef<View | null>(null);
  const [anchor, setAnchor] = React.useState({ x: 0, y: 0, width: 0, height: 0 });
  const menuWidth = Math.min(220, windowWidth - 16);
  const toggle = () => {
    if (expanded) {
      onToggle();
      return;
    }
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      onToggle();
    });
  };
  return (
    <View style={styles.bankDropdownBox}>
      <Text style={[styles.bankLabel, { color: theme.colors.textMuted }]}>Banco</Text>
      <Pressable ref={triggerRef} style={[styles.bankSelect, { borderColor: expanded ? theme.colors.primary : theme.colors.border, backgroundColor: theme.colors.surface }]} onPress={toggle}>
        <Text style={[styles.bankSelectText, { color: bank ? theme.colors.text : theme.colors.textSubtle }]} numberOfLines={1}>
          {bank || "Selecciona un banco..."}
        </Text>
        <MaterialCommunityIcons name={expanded ? "chevron-up" : "chevron-down"} size={20} color={theme.colors.textMuted} />
      </Pressable>
      {expanded ? (
        <Modal transparent animationType="fade" visible onRequestClose={onToggle}>
          <Pressable style={styles.paymentMethodBackdrop} onPress={onToggle}>
            <Pressable style={[styles.paymentMethodFloatingMenu, { width: menuWidth, left: Math.max(8, Math.min(anchor.x, windowWidth - menuWidth - 8)), top: anchor.y + anchor.height + 4, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]} onPress={(event) => event.stopPropagation()}>
              {TRANSFER_BANK_OPTIONS.map((option) => {
                const selected = bank === option;
                return (
                  <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected }} style={[styles.bankDropdownOption, { borderBottomColor: theme.colors.border }, selected && { backgroundColor: theme.colors.primarySoft }]} onPress={() => onSelect(option)}>
                    <Text style={[styles.bankDropdownOptionText, { color: selected ? theme.colors.primary : theme.colors.text }]}>{option}</Text>
                    {selected ? <MaterialCommunityIcons name="check" size={18} color={theme.colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </Pressable>
          </Pressable>
        </Modal>
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
  paymentKeyboardAvoiding: {
    flex: 1
  },
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
  checkoutBreakdownMeta: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2
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
    minHeight: 62,
    borderRadius: 14,
    backgroundColor: "#0f766e",
    paddingHorizontal: 8,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: "#0f172a",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6
  },
  checkoutToggle: {
    width: 42,
    height: 46,
    borderRadius: 11,
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
    fontSize: 11,
    fontWeight: "900"
  },
  checkoutTotal: {
    color: "#ffffff",
    fontSize: 23,
    fontWeight: "900"
  },
  checkoutPayButton: {
    minWidth: 120,
    minHeight: 46,
    borderRadius: 11,
    backgroundColor: "#059669",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 10
  },
  checkoutPayButtonDisabled: {
    opacity: 0.7
  },
  checkoutPayTextBlock: {
    minWidth: 0
  },
  checkoutPayTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  checkoutPayAmount: {
    color: "#d1fae5",
    fontSize: 12,
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
    minHeight: 52,
    paddingHorizontal: 7,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 5
  },
  paymentCompactRowStacked: {
    alignItems: "flex-start",
    paddingBottom: 5
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
  paymentAmountInputStacked: {
    width: "auto",
    flex: 1,
    minHeight: 44,
    fontSize: 15,
    paddingHorizontal: 12
  },
  paymentAmountRow: {
    minHeight: 48,
    borderTopWidth: 1,
    borderTopColor: "#eef2f7",
    paddingHorizontal: 12,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  paymentAmountLabel: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "800"
  },
  cashPaymentSummaryRow: {
    borderTopWidth: 1,
    borderTopColor: "#eef2f7",
    paddingHorizontal: 11,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6
  },
  cashPaymentColumn: {
    flex: 1,
    minWidth: 0,
    gap: 3
  },
  cashChangeColumn: {
    width: 72,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    gap: 3,
    borderRadius: 9,
    backgroundColor: "#f0fdfa",
    paddingHorizontal: 5,
    marginLeft: 2
  },
  cashPaymentLabel: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "800"
  },
  cashChangeValue: {
    color: "#047857",
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center"
  },
  cashShortfallValue: {
    color: "#b45309"
  },
  cashWideRow: {
    minHeight: 48,
    borderTopWidth: 1,
    borderTopColor: "#eef2f7",
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  cashWideChange: {
    minWidth: 105,
    color: "#047857",
    fontSize: 12,
    fontWeight: "900",
    textAlign: "right"
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
  paymentCompactExtraInline: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7
  },
  paymentExtraField: {
    flex: 1,
    minWidth: 0
  },
  paymentAppliedField: {
    gap: 5
  },
  transferReferenceToggle: {
    alignSelf: "flex-start",
    minHeight: 28,
    borderRadius: 8,
    backgroundColor: "#f0fdfa",
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  transferReferenceToggleText: {
    color: "#0f766e",
    fontSize: 10,
    fontWeight: "800"
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
  paymentMethodBackdrop: {
    backgroundColor: "transparent",
    flex: 1
  },
  paymentMethodFloatingMenu: {
    borderRadius: 10,
    borderWidth: 1,
    elevation: 10,
    overflow: "hidden",
    position: "absolute",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 10
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
    minHeight: 46,
    paddingHorizontal: 9,
    gap: 7,
    borderColor: "#dbe4f0",
    backgroundColor: "#f8fafc"
  },
  paymentMethodText: {
    flex: 1,
    minWidth: 0
  },
  paymentMethodTitle: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900"
  },
  paymentMethodDetail: {
    marginTop: 1,
    color: "#64748b",
    fontSize: 9,
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
    minHeight: 46,
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
