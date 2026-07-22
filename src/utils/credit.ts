import { AppData, CreditAdjustment, CreditAdjustmentState, CreditPayment, PaymentMethod, Sale, User } from "../types";
import { appendAudit } from "./audit";
import { activeEstablishment, normalizedEstablishments } from "./establishments";
import { isTicketOffline } from "./invoiceStatus";
import { isInvoiceSale } from "./sales";
import { roundMoney } from "./numbers";
import { documentScopeId } from "./documents";
import { salePaymentTotal } from "./salePayments";

const MAX_CREDIT_OPERATION_ID_LENGTH = 200;
type CreditOperationIdentityKind = "payment" | "void" | "batch";

export type CreditClientSummary = {
  clientId: string;
  clientName: string;
  pendingCount: number;
  pendingTotal: number;
  overdueCount: number;
  overdueTotal: number;
  nextDueDate: string;
};

export type CreditAdjustmentErrorCode =
  | "CREDIT_ADJUSTMENT_NOTE_NOT_FOUND"
  | "CREDIT_ADJUSTMENT_INVALID_NOTE"
  | "CREDIT_ADJUSTMENT_SOURCE_SALE_NOT_FOUND"
  | "CREDIT_ADJUSTMENT_SOURCE_NOT_CREDIT"
  | "CREDIT_ADJUSTMENT_UNKNOWN"
  | "CREDIT_ADJUSTMENT_INVALID_AMOUNT"
  | "CREDIT_ADJUSTMENT_OPERATION_MISMATCH";

export type CreditPaymentOperationErrorCode =
  | "CREDIT_PAYMENT_INVALID_OPERATION_ID"
  | "CREDIT_PAYMENT_INVALID_VOID_OPERATION_ID"
  | "CREDIT_PAYMENT_INVALID_BATCH_OPERATION_ID"
  | "CREDIT_PAYMENT_OPERATION_MISMATCH"
  | "CREDIT_PAYMENT_VOID_OPERATION_MISMATCH"
  | "CREDIT_PAYMENT_BATCH_MISMATCH"
  | "CREDIT_PAYMENT_BATCH_PARTIAL";

export class CreditPaymentOperationError extends Error {
  readonly code: CreditPaymentOperationErrorCode;
  readonly operationId?: string;
  readonly batchOperationId?: string;
  readonly paymentId?: string;
  readonly saleId?: string;

  constructor(code: CreditPaymentOperationErrorCode, details: {
    operationId?: string;
    batchOperationId?: string;
    paymentId?: string;
    saleId?: string;
  } = {}) {
    super("La operacion de pago requiere revision antes de continuar.");
    this.name = "CreditPaymentOperationError";
    this.code = code;
    this.operationId = details.operationId;
    this.batchOperationId = details.batchOperationId;
    this.paymentId = details.paymentId;
    this.saleId = details.saleId;
  }
}

export class CreditAdjustmentError extends Error {
  readonly code: CreditAdjustmentErrorCode;
  readonly creditNoteId: string;
  readonly operationId: string;

  constructor(code: CreditAdjustmentErrorCode, creditNoteId: string, operationId: string) {
    super("El ajuste de cartera requiere revision antes de continuar.");
    this.name = "CreditAdjustmentError";
    this.code = code;
    this.creditNoteId = creditNoteId;
    this.operationId = operationId;
  }
}

export type CreditAdjustmentOperationOptions = {
  data: AppData;
  creditNoteId: string;
  userId: string;
  occurredAt: string;
  reason?: string;
};

export type CreditAdjustmentOperationResult = {
  data: AppData;
  adjustment: CreditAdjustment;
  appliedAmount: number;
  refundableAmount: number;
  changed: boolean;
};

function creditAdjustmentId(creditNoteId: string) {
  return `credit-adjustment:${creditNoteId}`;
}

function creditAdjustmentOperationId(creditNoteId: string) {
  return `credit-note-account-adjustment:${creditNoteId}`;
}

function originalCreditAmount(sale: Sale) {
  if (sale.paymentCondition !== "credito") return 0;
  const initialPayments = Array.isArray(sale.payments) ? salePaymentTotal(sale.payments) : 0;
  return Math.max(0, roundMoney(Number(sale.total || 0) - initialPayments));
}

function validCreditPaymentsTotal(data: AppData, saleId: string) {
  return roundMoney((data.creditPayments || [])
    .filter((payment) => payment.saleId === saleId && !isCreditPaymentVoided(payment))
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
}

function appliedAdjustmentsForSale(data: AppData, saleId: string) {
  return (data.creditAdjustments || [])
    .filter((adjustment) => adjustment.sourceSaleId === saleId && resolveCreditAdjustmentState(adjustment) === "APPLIED")
    .sort((a, b) => {
      const dateOrder = new Date(a.appliedAt || "").getTime() - new Date(b.appliedAt || "").getTime();
      return Number.isFinite(dateOrder) && dateOrder !== 0 ? dateOrder : a.id.localeCompare(b.id);
    });
}

function reconcileSaleCredit(data: AppData, sale: Sale) {
  if (sale.paymentCondition !== "credito") return { balance: 0, allocations: new Map<string, { appliedAmount: number; refundableAmount: number }>() };
  const paymentsTotal = validCreditPaymentsTotal(data, sale.id);
  let remainingBalance = Math.max(0, roundMoney(originalCreditAmount(sale) - paymentsTotal));
  const allocations = new Map<string, { appliedAmount: number; refundableAmount: number }>();

  appliedAdjustmentsForSale(data, sale.id).forEach((adjustment) => {
    const amount = roundMoney(Number(adjustment.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new CreditAdjustmentError("CREDIT_ADJUSTMENT_INVALID_AMOUNT", adjustment.sourceCreditNoteId, adjustment.operationId);
    }
    const appliedAmount = roundMoney(Math.min(amount, remainingBalance));
    const refundableAmount = roundMoney(amount - appliedAmount);
    allocations.set(adjustment.id, { appliedAmount, refundableAmount });
    remainingBalance = Math.max(0, roundMoney(remainingBalance - appliedAmount));
  });

  return { balance: remainingBalance, allocations };
}

export function resolveCreditAdjustmentState(adjustment?: CreditAdjustment): CreditAdjustmentState {
  if (!adjustment) return "UNKNOWN";
  return adjustment.state === "APPLIED" || adjustment.state === "REVERSED" ? adjustment.state : "UNKNOWN";
}

export function reconcileCreditBalances(data: AppData): AppData {
  const sales = (data.sales || []).map((sale) => {
    if (sale.paymentCondition !== "credito") return sale;
    const { balance } = reconcileSaleCredit(data, sale);
    return {
      ...sale,
      creditBalance: balance,
      creditStatus: balance <= 0 ? "pagado" as const : "pendiente" as const
    };
  });
  return { ...data, sales };
}

function adjustmentAllocation(data: AppData, adjustment: CreditAdjustment) {
  const sale = data.sales.find((item) => item.id === adjustment.sourceSaleId);
  if (!sale) {
    throw new CreditAdjustmentError("CREDIT_ADJUSTMENT_SOURCE_SALE_NOT_FOUND", adjustment.sourceCreditNoteId, adjustment.operationId);
  }
  return reconcileSaleCredit(data, sale).allocations.get(adjustment.id) || {
    appliedAmount: 0,
    refundableAmount: roundMoney(adjustment.amount)
  };
}

export function applyCreditAdjustmentOnce(options: CreditAdjustmentOperationOptions): CreditAdjustmentOperationResult {
  const { data, creditNoteId, userId, occurredAt, reason } = options;
  const id = creditAdjustmentId(creditNoteId);
  const operationId = creditAdjustmentOperationId(creditNoteId);
  const creditNote = data.sales.find((sale) => sale.id === creditNoteId);
  if (!creditNote) throw new CreditAdjustmentError("CREDIT_ADJUSTMENT_NOTE_NOT_FOUND", creditNoteId, operationId);
  if (creditNote.documentType !== "nota_credito" || creditNote.status !== "AUTORIZADA") {
    throw new CreditAdjustmentError("CREDIT_ADJUSTMENT_INVALID_NOTE", creditNoteId, operationId);
  }
  const sourceSale = creditNote.sourceSaleId ? data.sales.find((sale) => sale.id === creditNote.sourceSaleId) : undefined;
  if (!sourceSale) throw new CreditAdjustmentError("CREDIT_ADJUSTMENT_SOURCE_SALE_NOT_FOUND", creditNoteId, operationId);
  if (sourceSale.paymentCondition !== "credito") {
    throw new CreditAdjustmentError("CREDIT_ADJUSTMENT_SOURCE_NOT_CREDIT", creditNoteId, operationId);
  }

  const existing = (data.creditAdjustments || []).find((adjustment) => adjustment.id === id || adjustment.operationId === operationId || adjustment.sourceCreditNoteId === creditNoteId);
  if (existing) {
    if (existing.id !== id || existing.operationId !== operationId || existing.sourceSaleId !== sourceSale.id || existing.clientId !== sourceSale.clientId || existing.type !== "CREDIT_NOTE") {
      throw new CreditAdjustmentError("CREDIT_ADJUSTMENT_OPERATION_MISMATCH", creditNoteId, operationId);
    }
    const state = resolveCreditAdjustmentState(existing);
    if (state === "UNKNOWN") throw new CreditAdjustmentError("CREDIT_ADJUSTMENT_UNKNOWN", creditNoteId, operationId);
    const reconciled = reconcileCreditBalances(data);
    if (state === "REVERSED") {
      return { data: reconciled, adjustment: existing, appliedAmount: 0, refundableAmount: 0, changed: false };
    }
    const allocation = adjustmentAllocation(reconciled, existing);
    return { data: reconciled, adjustment: existing, ...allocation, changed: false };
  }

  const amount = roundMoney(Number(creditNote.total));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new CreditAdjustmentError("CREDIT_ADJUSTMENT_INVALID_AMOUNT", creditNoteId, operationId);
  }
  const adjustment: CreditAdjustment = {
    id,
    operationId,
    type: "CREDIT_NOTE",
    sourceCreditNoteId: creditNote.id,
    sourceSaleId: sourceSale.id,
    clientId: sourceSale.clientId,
    amount,
    state: "APPLIED",
    appliedAt: occurredAt,
    userId,
    reason: reason?.trim() || creditNote.creditReason || "Nota de credito autorizada"
  };
  const reconciled = reconcileCreditBalances({ ...data, creditAdjustments: [...(data.creditAdjustments || []), adjustment] });
  const allocation = adjustmentAllocation(reconciled, adjustment);
  return { data: reconciled, adjustment, ...allocation, changed: true };
}

export function reverseCreditAdjustmentOnce(options: CreditAdjustmentOperationOptions): CreditAdjustmentOperationResult {
  const { data, creditNoteId, occurredAt } = options;
  const id = creditAdjustmentId(creditNoteId);
  const operationId = creditAdjustmentOperationId(creditNoteId);
  const existing = (data.creditAdjustments || []).find((adjustment) => adjustment.id === id || adjustment.operationId === operationId || adjustment.sourceCreditNoteId === creditNoteId);
  if (!existing) throw new CreditAdjustmentError("CREDIT_ADJUSTMENT_UNKNOWN", creditNoteId, operationId);
  if (existing.id !== id || existing.operationId !== operationId || existing.sourceCreditNoteId !== creditNoteId || existing.type !== "CREDIT_NOTE") {
    throw new CreditAdjustmentError("CREDIT_ADJUSTMENT_OPERATION_MISMATCH", creditNoteId, operationId);
  }
  const state = resolveCreditAdjustmentState(existing);
  if (state === "UNKNOWN") throw new CreditAdjustmentError("CREDIT_ADJUSTMENT_UNKNOWN", creditNoteId, operationId);
  if (state === "REVERSED") {
    const reconciled = reconcileCreditBalances(data);
    return { data: reconciled, adjustment: existing, appliedAmount: 0, refundableAmount: 0, changed: false };
  }

  const allocation = adjustmentAllocation(data, existing);
  const reversedAdjustment: CreditAdjustment = { ...existing, state: "REVERSED", reversedAt: occurredAt };
  const creditAdjustments = (data.creditAdjustments || []).map((adjustment) => adjustment.id === existing.id ? reversedAdjustment : adjustment);
  const reconciled = reconcileCreditBalances({ ...data, creditAdjustments });
  return { data: reconciled, adjustment: reversedAdjustment, ...allocation, changed: true };
}

export function creditBalance(sale: Sale) {
  if (sale.paymentCondition !== "credito") return 0;
  const storedBalance = sale.creditBalance;
  return Math.max(0, roundMoney(storedBalance !== undefined && Number.isFinite(Number(storedBalance)) ? Number(storedBalance) : sale.total));
}

export function reconcileCreditBalancesFromPayments(data: AppData): AppData {
  return reconcileCreditBalances(data);
}

export function isCreditReceivableSale(sale: Sale) {
  return sale.paymentCondition === "credito"
    && (isInvoiceSale(sale) || sale.documentType === "nota_venta")
    && (sale.status === "AUTORIZADA" || isTicketOffline(sale.status))
    && creditBalance(sale) > 0;
}

export function creditReceivableSales(data: AppData) {
  return (data.sales || [])
    .filter(isCreditReceivableSale)
    .sort((a, b) => new Date(a.creditDueDate || a.createdAt).getTime() - new Date(b.creditDueDate || b.createdAt).getTime());
}

export function creditTotals(data: AppData) {
  const receivables = creditReceivableSales(data);
  const totalPending = receivables.reduce((sum, sale) => sum + creditBalance(sale), 0);
  const overdue = receivables.filter((sale) => isCreditOverdue(sale));
  return {
    receivables,
    totalPending: roundMoney(totalPending),
    overdueCount: overdue.length,
    overdueTotal: roundMoney(overdue.reduce((sum, sale) => sum + creditBalance(sale), 0))
  };
}

export function creditClientSummaries(data: AppData): CreditClientSummary[] {
  const clientsById = new Map((data.clients || []).map((client) => [client.id, client]));
  const summaries = new Map<string, CreditClientSummary>();

  for (const sale of creditReceivableSales(data)) {
    const balance = creditBalance(sale);
    const client = clientsById.get(sale.clientId);
    const current = summaries.get(sale.clientId) || {
      clientId: sale.clientId,
      clientName: client?.name || "Cliente",
      pendingCount: 0,
      pendingTotal: 0,
      overdueCount: 0,
      overdueTotal: 0,
      nextDueDate: ""
    };
    current.pendingCount += 1;
    current.pendingTotal = roundMoney(current.pendingTotal + balance);
    if (!current.nextDueDate || dueTimestamp(sale.creditDueDate || sale.createdAt) < dueTimestamp(current.nextDueDate)) {
      current.nextDueDate = sale.creditDueDate || sale.createdAt;
    }
    if (isCreditOverdue(sale)) {
      current.overdueCount += 1;
      current.overdueTotal = roundMoney(current.overdueTotal + balance);
    }
    summaries.set(sale.clientId, current);
  }

  return Array.from(summaries.values()).sort((a, b) => b.pendingTotal - a.pendingTotal);
}

export function creditPaymentsForClient(data: AppData, clientId: string) {
  return (data.creditPayments || [])
    .filter((payment) => payment.clientId === clientId)
    .sort((a, b) => dueTimestamp(b.createdAt) - dueTimestamp(a.createdAt));
}

export function creditSaleScopeText(sale: Sale, data: AppData) {
  const scopeId = documentScopeId(sale, data.issuer);
  return creditScopeLabel(data, scopeId);
}

export function creditPaymentScopeText(payment: CreditPayment, data: AppData) {
  const paymentScopeId = payment.establishment && payment.emissionPoint ? `${payment.establishment}-${payment.emissionPoint}` : "";
  if (paymentScopeId) return creditScopeLabel(data, paymentScopeId);
  const sale = data.sales.find((item) => item.id === payment.saleId);
  return sale ? creditSaleScopeText(sale, data) : "Punto sin registrar";
}

export function isCreditPaymentVoided(payment: CreditPayment) {
  return Boolean(payment.voidedAt);
}

export function isCreditOverdue(sale: Sale, now = new Date()) {
  if (!sale.creditDueDate) return false;
  const due = dueTimestamp(`${sale.creditDueDate}T23:59:59`);
  return due > 0 && due < now.getTime() && creditBalance(sale) > 0;
}

function dueTimestamp(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function creditScopeLabel(data: AppData, scopeId: string) {
  const establishment = normalizedEstablishments(data.issuer).find((item) => item.id === scopeId);
  return `${establishment?.name || "Punto"} ${scopeId}`;
}

function operationIdentityPrefix(kind: CreditOperationIdentityKind) {
  if (kind === "void") return "payment-void-operation:";
  if (kind === "batch") return "payment-batch-operation:";
  return "payment-operation:";
}

function secureRandomUuid() {
  const cryptoProvider = globalThis.crypto;
  if (typeof cryptoProvider?.randomUUID === "function") return cryptoProvider.randomUUID();
  if (typeof cryptoProvider?.getRandomValues !== "function") {
    throw new CreditPaymentOperationError("CREDIT_PAYMENT_INVALID_OPERATION_ID");
  }
  const bytes = cryptoProvider.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function createCreditOperationId(kind: CreditOperationIdentityKind) {
  return `${operationIdentityPrefix(kind)}${secureRandomUuid()}`;
}

function validateOperationId(
  value: string,
  code: CreditPaymentOperationErrorCode,
  details: { operationId?: string; batchOperationId?: string } = {}
) {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > MAX_CREDIT_OPERATION_ID_LENGTH) {
    throw new CreditPaymentOperationError(code, details);
  }
  return value;
}

function normalizePaymentNote(note?: string) {
  return note?.trim() || "";
}

function normalizePaymentMethod(paymentMethod: PaymentMethod) {
  return paymentMethod.trim() as PaymentMethod;
}

function paymentMatches(payment: CreditPayment, expected: {
  id: string;
  operationId: string;
  saleId: string;
  clientId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  note: string;
  userId: string;
  userName: string;
}) {
  return payment.id === expected.id
    && payment.operationId === expected.operationId
    && payment.saleId === expected.saleId
    && payment.clientId === expected.clientId
    && roundMoney(Number(payment.amount)) === expected.amount
    && normalizePaymentMethod(payment.paymentMethod) === expected.paymentMethod
    && normalizePaymentNote(payment.note) === expected.note
    && payment.userId === expected.userId
    && payment.userName === expected.userName;
}

function paymentDueTimestamp(sale: Sale) {
  const due = new Date(sale.creditDueDate || "").getTime();
  if (Number.isFinite(due)) return due;
  const created = new Date(sale.createdAt).getTime();
  return Number.isFinite(created) ? created : 0;
}

export function registerCreditPayment({
  amount,
  data,
  note,
  operationId,
  paymentMethod,
  saleId,
  user
}: {
  amount: number;
  data: AppData;
  note?: string;
  operationId: string;
  paymentMethod: PaymentMethod;
  saleId: string;
  user: User;
}) {
  const normalizedOperationId = validateOperationId(operationId, "CREDIT_PAYMENT_INVALID_OPERATION_ID", { operationId });
  const paymentId = `credit-payment:${normalizedOperationId}`;
  const paymentAmount = roundMoney(amount);
  const normalizedMethod = normalizePaymentMethod(paymentMethod);
  const normalizedNote = normalizePaymentNote(note);
  const existing = (data.creditPayments || []).find((payment) => payment.id === paymentId || payment.operationId === normalizedOperationId);
  if (existing) {
    const existingSale = data.sales.find((item) => item.id === saleId);
    if (!existingSale || !paymentMatches(existing, {
      id: paymentId,
      operationId: normalizedOperationId,
      saleId,
      clientId: existingSale.clientId,
      amount: paymentAmount,
      paymentMethod: normalizedMethod,
      note: normalizedNote,
      userId: user.id,
      userName: user.name
    })) {
      throw new CreditPaymentOperationError("CREDIT_PAYMENT_OPERATION_MISMATCH", {
        operationId: normalizedOperationId,
        paymentId: existing.id,
        saleId
      });
    }
    return reconcileCreditBalances(data);
  }

  const sale = data.sales.find((item) => item.id === saleId);
  if (!sale) throw new Error("No se encontro la factura a credito.");
  const balance = creditBalance(sale);
  if (balance <= 0) throw new Error("Este credito ya esta pagado.");
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) throw new Error("Ingrese un valor de abono valido.");
  if (paymentAmount > balance) throw new Error(`El abono no puede superar el saldo pendiente de $${balance.toFixed(2)}.`);

  const createdAt = new Date().toISOString();
  const nextBalance = roundMoney(balance - paymentAmount);
  const paymentEstablishment = activeEstablishment(data.issuer);
  const payment: CreditPayment = {
    id: paymentId,
    operationId: normalizedOperationId,
    saleId: sale.id,
    clientId: sale.clientId,
    establishment: paymentEstablishment.establishment,
    emissionPoint: paymentEstablishment.emissionPoint,
    establishmentName: paymentEstablishment.name,
    userId: user.id,
    userName: user.name,
    amount: paymentAmount,
    paymentMethod: normalizedMethod,
    note: normalizedNote,
    createdAt
  };
  const sales = data.sales.map((item) =>
    item.id === sale.id
      ? {
          ...item,
          creditBalance: nextBalance,
          creditStatus: nextBalance <= 0 ? "pagado" as const : "pendiente" as const
        }
      : item
  );

  return reconcileCreditBalances(appendAudit({
    ...data,
    sales,
    creditPayments: [payment, ...(data.creditPayments || [])]
  }, user, "CREDIT_PAYMENT_CREATED", "sale", sale.id, `Abono a credito ${sale.sequence}: $${paymentAmount.toFixed(2)}`, {
    saleId: sale.id,
    amount: paymentAmount,
    balanceBefore: balance,
    balanceAfter: nextBalance,
    paymentMethod
  }));
}

export function registerCreditPayments({
  amount,
  batchId,
  batchOperationId,
  data,
  note,
  paymentMethod,
  saleIds,
  user
}: {
  amount?: number;
  batchId: string;
  batchOperationId: string;
  data: AppData;
  note?: string;
  paymentMethod: PaymentMethod;
  saleIds: string[];
  user: User;
}) {
  const normalizedBatchId = validateOperationId(batchId, "CREDIT_PAYMENT_INVALID_BATCH_OPERATION_ID", { batchOperationId });
  const normalizedBatchOperationId = validateOperationId(batchOperationId, "CREDIT_PAYMENT_INVALID_BATCH_OPERATION_ID", { batchOperationId });
  const uniqueSaleIds = Array.from(new Set(saleIds));
  if (uniqueSaleIds.length === 0) throw new Error("Seleccione al menos una factura pendiente.");

  const existingBatchPayments = (data.creditPayments || []).filter((payment) =>
    payment.batchId === normalizedBatchId
    || payment.batchOperationId === normalizedBatchOperationId
  );
  if (existingBatchPayments.some((payment) =>
    payment.batchId !== normalizedBatchId
    || payment.batchOperationId !== normalizedBatchOperationId
  )) {
    throw new CreditPaymentOperationError("CREDIT_PAYMENT_BATCH_MISMATCH", { batchOperationId: normalizedBatchOperationId });
  }
  const declaredBatchSizes = new Set(existingBatchPayments.map((payment) => payment.batchSize));
  if (existingBatchPayments.length > 0 && (declaredBatchSizes.size !== 1 || !declaredBatchSizes.has(existingBatchPayments.length))) {
    throw new CreditPaymentOperationError("CREDIT_PAYMENT_BATCH_PARTIAL", { batchOperationId: normalizedBatchOperationId });
  }

  const selectedSales = uniqueSaleIds
    .map((saleId) => data.sales.find((item) => item.id === saleId))
    .filter((sale): sale is Sale => Boolean(sale))
    .sort((a, b) => paymentDueTimestamp(a) - paymentDueTimestamp(b) || a.id.localeCompare(b.id));
  if (selectedSales.length !== uniqueSaleIds.length) throw new Error("No se encontro una factura seleccionada.");
  const existingAmounts = new Map(existingBatchPayments.map((payment) => [payment.saleId, roundMoney(payment.amount)]));
  const effectiveBalances = new Map(selectedSales.map((sale) => [
    sale.id,
    roundMoney(creditBalance(sale) + (existingAmounts.get(sale.id) || 0))
  ]));
  const selectedTotal = roundMoney(selectedSales.reduce((sum, sale) => sum + (effectiveBalances.get(sale.id) || 0), 0));
  const targetAmount = amount === undefined ? selectedTotal : roundMoney(amount);
  if (existingBatchPayments.length > 0) {
    const existingTotal = roundMoney(existingBatchPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
    if (targetAmount !== existingTotal) {
      throw new CreditPaymentOperationError("CREDIT_PAYMENT_BATCH_MISMATCH", { batchOperationId: normalizedBatchOperationId });
    }
  }
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) throw new Error("Ingrese un valor de cobro valido.");
  if (targetAmount > selectedTotal) throw new Error(`El cobro no puede superar el saldo seleccionado de $${selectedTotal.toFixed(2)}.`);
  let remainingAmount = targetAmount;
  const distribution: Array<{ sale: Sale; amount: number; id: string; operationId: string }> = [];
  for (const sale of selectedSales) {
    const balance = effectiveBalances.get(sale.id) || 0;
    if (balance <= 0) continue;
    const paymentAmount = roundMoney(Math.min(balance, remainingAmount));
    if (paymentAmount <= 0) break;
    const operationId = validateOperationId(
      `${normalizedBatchOperationId}:${sale.id}`,
      "CREDIT_PAYMENT_INVALID_OPERATION_ID",
      { batchOperationId: normalizedBatchOperationId }
    );
    distribution.push({ sale, amount: paymentAmount, id: `credit-payment:${operationId}`, operationId });
    remainingAmount = roundMoney(remainingAmount - paymentAmount);
  }
  if (distribution.length === 0) throw new Error("Las facturas seleccionadas ya estan pagadas.");

  const normalizedMethod = normalizePaymentMethod(paymentMethod);
  const normalizedNote = normalizePaymentNote(note);
  const batchSize = distribution.length;
  if (existingBatchPayments.length > 0) {
    const matches = existingBatchPayments.length === batchSize && distribution.every((expected) => {
      const payment = existingBatchPayments.find((item) => item.id === expected.id || item.operationId === expected.operationId);
      return Boolean(payment
        && paymentMatches(payment, {
          id: expected.id,
          operationId: expected.operationId,
          saleId: expected.sale.id,
          clientId: expected.sale.clientId,
          amount: expected.amount,
          paymentMethod: normalizedMethod,
          note: normalizedNote,
          userId: user.id,
          userName: user.name
        })
        && payment!.batchId === normalizedBatchId
        && payment!.batchOperationId === normalizedBatchOperationId
        && payment!.batchSize === batchSize);
    });
    if (!matches) {
      throw new CreditPaymentOperationError("CREDIT_PAYMENT_BATCH_MISMATCH", { batchOperationId: normalizedBatchOperationId });
    }
    const reconciled = reconcileCreditBalances(data);
    return {
      nextData: reconciled,
      payments: distribution.map((expected) => existingBatchPayments.find((payment) => payment.id === expected.id)!),
      sales: reconciled.sales.filter((sale) => uniqueSaleIds.includes(sale.id))
    };
  }

  const conflictingPayment = (data.creditPayments || []).find((payment) =>
    distribution.some((expected) => payment.id === expected.id || payment.operationId === expected.operationId)
  );
  if (conflictingPayment) {
    throw new CreditPaymentOperationError("CREDIT_PAYMENT_BATCH_MISMATCH", {
      batchOperationId: normalizedBatchOperationId,
      paymentId: conflictingPayment.id,
      saleId: conflictingPayment.saleId
    });
  }

  const createdAt = new Date().toISOString();
  const paymentEstablishment = activeEstablishment(data.issuer);
  const payments: CreditPayment[] = distribution.map(({ sale, amount: paymentAmount, id, operationId }) => ({
    id,
    operationId,
    batchId: normalizedBatchId,
    batchOperationId: normalizedBatchOperationId,
    batchSize,
    saleId: sale.id,
    clientId: sale.clientId,
    establishment: paymentEstablishment.establishment,
    emissionPoint: paymentEstablishment.emissionPoint,
    establishmentName: paymentEstablishment.name,
    userId: user.id,
    userName: user.name,
    amount: paymentAmount,
    paymentMethod: normalizedMethod,
    note: normalizedNote,
    createdAt
  }));
  let nextData: AppData = { ...data, creditPayments: [...payments, ...(data.creditPayments || [])] };
  for (const payment of payments) {
    const sale = distribution.find((item) => item.sale.id === payment.saleId)!.sale;
    nextData = appendAudit(nextData, user, "CREDIT_PAYMENT_CREATED", "sale", sale.id, `Abono a credito ${sale.sequence}: $${payment.amount.toFixed(2)}`, {
      saleId: sale.id,
      amount: payment.amount,
      paymentMethod: payment.paymentMethod,
      batchId: normalizedBatchId,
      batchOperationId: normalizedBatchOperationId
    });
  }
  nextData = reconcileCreditBalances(nextData);

  return {
    nextData,
    payments,
    sales: nextData.sales.filter((sale) => uniqueSaleIds.includes(sale.id))
  };
}

export function voidCreditPayment({
  data,
  paymentId,
  reason,
  voidOperationId,
  user
}: {
  data: AppData;
  paymentId: string;
  reason?: string;
  voidOperationId: string;
  user: User;
}) {
  const payment = (data.creditPayments || []).find((item) => item.id === paymentId);
  if (!payment) throw new Error("No se encontro el abono.");
  const normalizedVoidOperationId = validateOperationId(voidOperationId, "CREDIT_PAYMENT_INVALID_VOID_OPERATION_ID", {
    operationId: voidOperationId
  });
  if (payment.voidOperationId && payment.voidOperationId !== normalizedVoidOperationId) {
    throw new CreditPaymentOperationError("CREDIT_PAYMENT_VOID_OPERATION_MISMATCH", {
      operationId: normalizedVoidOperationId,
      paymentId,
      saleId: payment.saleId
    });
  }
  const normalizedReason = reason?.trim() || "Abono anulado por correccion";
  if (isCreditPaymentVoided(payment)) {
    const sameVoid = payment.voidOperationId === normalizedVoidOperationId
      && payment.voidedByUserId === user.id
      && payment.voidedByUserName === user.name
      && payment.voidReason === normalizedReason;
    if (!sameVoid) {
      throw new CreditPaymentOperationError("CREDIT_PAYMENT_VOID_OPERATION_MISMATCH", {
        operationId: normalizedVoidOperationId,
        paymentId,
        saleId: payment.saleId
      });
    }
    return reconcileCreditBalances(data);
  }
  const sale = data.sales.find((item) => item.id === payment.saleId);
  if (!sale) throw new Error("No se encontro la factura del abono.");

  const currentBalance = creditBalance(sale);
  const voidedAt = new Date().toISOString();
  const voidedPayment: CreditPayment = {
    ...payment,
    voidOperationId: normalizedVoidOperationId,
    voidedAt,
    voidedByUserId: user.id,
    voidedByUserName: user.name,
    voidReason: normalizedReason
  };
  const creditPayments = (data.creditPayments || []).map((item) => item.id === payment.id ? voidedPayment : item);
  const reconciled = reconcileCreditBalances({ ...data, creditPayments });
  const nextBalance = creditBalance(reconciled.sales.find((item) => item.id === sale.id)!);
  return reconcileCreditBalances(appendAudit({
    ...data,
    sales: reconciled.sales,
    creditPayments
  }, user, "CREDIT_PAYMENT_VOIDED", "sale", sale.id, `Abono anulado ${sale.sequence}: $${payment.amount.toFixed(2)}`, {
    paymentId: payment.id,
    saleId: sale.id,
    amount: payment.amount,
    balanceBefore: currentBalance,
    balanceAfter: nextBalance,
    reason: voidedPayment.voidReason
  }));
}
