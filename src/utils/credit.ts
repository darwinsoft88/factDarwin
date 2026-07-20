import { AppData, CreditPayment, PaymentMethod, Sale, User } from "../types";
import { appendAudit } from "./audit";
import { activeEstablishment, normalizedEstablishments } from "./establishments";
import { generateId } from "./id";
import { isTicketOffline } from "./invoiceStatus";
import { isInvoiceSale } from "./sales";
import { roundMoney } from "./numbers";
import { documentScopeId } from "./documents";

export type CreditClientSummary = {
  clientId: string;
  clientName: string;
  pendingCount: number;
  pendingTotal: number;
  overdueCount: number;
  overdueTotal: number;
  nextDueDate: string;
};

export function creditBalance(sale: Sale) {
  if (sale.paymentCondition !== "credito") return 0;
  return Math.max(0, roundMoney(Number.isFinite(Number(sale.creditBalance)) ? Number(sale.creditBalance) : sale.total));
}

export function reconcileCreditBalancesFromPayments(data: AppData): AppData {
  const paidBySale = new Map<string, number>();
  (data.creditPayments || []).forEach((payment) => {
    if (!payment?.saleId || isCreditPaymentVoided(payment)) return;
    paidBySale.set(payment.saleId, roundMoney((paidBySale.get(payment.saleId) || 0) + Number(payment.amount || 0)));
  });

  const sales = (data.sales || []).map((sale) => {
    if (sale.paymentCondition !== "credito") return sale;
    const paidAmount = paidBySale.get(sale.id) || 0;
    const nextBalance = Math.max(0, roundMoney(Number(sale.total || 0) - paidAmount));
    return {
      ...sale,
      creditBalance: nextBalance,
      creditStatus: nextBalance <= 0 ? "pagado" as const : "pendiente" as const
    };
  });

  return { ...data, sales };
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

export function registerCreditPayment({
  amount,
  data,
  note,
  paymentMethod,
  saleId,
  user
}: {
  amount: number;
  data: AppData;
  note?: string;
  paymentMethod: PaymentMethod;
  saleId: string;
  user: User;
}) {
  const sale = data.sales.find((item) => item.id === saleId);
  if (!sale) throw new Error("No se encontro la factura a credito.");
  const balance = creditBalance(sale);
  const paymentAmount = roundMoney(amount);
  if (balance <= 0) throw new Error("Este credito ya esta pagado.");
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) throw new Error("Ingrese un valor de abono valido.");
  if (paymentAmount > balance) throw new Error(`El abono no puede superar el saldo pendiente de $${balance.toFixed(2)}.`);

  const createdAt = new Date().toISOString();
  const nextBalance = roundMoney(balance - paymentAmount);
  const paymentEstablishment = activeEstablishment(data.issuer);
  const payment: CreditPayment = {
    id: generateId(),
    saleId: sale.id,
    clientId: sale.clientId,
    establishment: paymentEstablishment.establishment,
    emissionPoint: paymentEstablishment.emissionPoint,
    establishmentName: paymentEstablishment.name,
    userId: user.id,
    userName: user.name,
    amount: paymentAmount,
    paymentMethod,
    note: note?.trim() || "",
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

  return appendAudit({
    ...data,
    sales,
    creditPayments: [payment, ...(data.creditPayments || [])]
  }, user, "CREDIT_PAYMENT_CREATED", "sale", sale.id, `Abono a credito ${sale.sequence}: $${paymentAmount.toFixed(2)}`, {
    saleId: sale.id,
    amount: paymentAmount,
    balanceBefore: balance,
    balanceAfter: nextBalance,
    paymentMethod
  });
}

export function registerCreditPayments({
  amount,
  data,
  note,
  paymentMethod,
  saleIds,
  user
}: {
  amount?: number;
  data: AppData;
  note?: string;
  paymentMethod: PaymentMethod;
  saleIds: string[];
  user: User;
}) {
  const uniqueSaleIds = Array.from(new Set(saleIds));
  if (uniqueSaleIds.length === 0) throw new Error("Seleccione al menos una factura pendiente.");

  let nextData = data;
  const payments: CreditPayment[] = [];
  const selectedSales = uniqueSaleIds
    .map((saleId) => nextData.sales.find((item) => item.id === saleId))
    .filter((sale): sale is Sale => Boolean(sale))
    .sort((a, b) => new Date(a.creditDueDate || a.createdAt).getTime() - new Date(b.creditDueDate || b.createdAt).getTime());
  if (selectedSales.length !== uniqueSaleIds.length) throw new Error("No se encontro una factura seleccionada.");
  const selectedTotal = roundMoney(selectedSales.reduce((sum, sale) => sum + creditBalance(sale), 0));
  const targetAmount = amount === undefined ? selectedTotal : roundMoney(amount);
  if (!Number.isFinite(targetAmount) || targetAmount <= 0) throw new Error("Ingrese un valor de cobro valido.");
  if (targetAmount > selectedTotal) throw new Error(`El cobro no puede superar el saldo seleccionado de $${selectedTotal.toFixed(2)}.`);
  let remainingAmount = targetAmount;

  for (const sale of selectedSales) {
    const balance = creditBalance(sale);
    if (balance <= 0) continue;
    const paymentAmount = roundMoney(Math.min(balance, remainingAmount));
    if (paymentAmount <= 0) break;
    nextData = registerCreditPayment({
      amount: paymentAmount,
      data: nextData,
      note,
      paymentMethod,
      saleId: sale.id,
      user
    });
    const payment = nextData.creditPayments[0];
    if (payment) payments.push(payment);
    remainingAmount = roundMoney(remainingAmount - paymentAmount);
  }

  if (payments.length === 0) throw new Error("Las facturas seleccionadas ya estan pagadas.");

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
  user
}: {
  data: AppData;
  paymentId: string;
  reason?: string;
  user: User;
}) {
  const payment = (data.creditPayments || []).find((item) => item.id === paymentId);
  if (!payment) throw new Error("No se encontro el abono.");
  if (isCreditPaymentVoided(payment)) throw new Error("Este abono ya esta anulado.");
  const sale = data.sales.find((item) => item.id === payment.saleId);
  if (!sale) throw new Error("No se encontro la factura del abono.");

  const currentBalance = creditBalance(sale);
  const nextBalance = Math.min(roundMoney(sale.total), roundMoney(currentBalance + payment.amount));
  const voidedAt = new Date().toISOString();
  const voidedPayment: CreditPayment = {
    ...payment,
    voidedAt,
    voidedByUserId: user.id,
    voidedByUserName: user.name,
    voidReason: reason?.trim() || "Abono anulado por correccion"
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
  const creditPayments = (data.creditPayments || []).map((item) => item.id === payment.id ? voidedPayment : item);

  return appendAudit({
    ...data,
    sales,
    creditPayments
  }, user, "CREDIT_PAYMENT_VOIDED", "sale", sale.id, `Abono anulado ${sale.sequence}: $${payment.amount.toFixed(2)}`, {
    paymentId: payment.id,
    saleId: sale.id,
    amount: payment.amount,
    balanceBefore: currentBalance,
    balanceAfter: nextBalance,
    reason: voidedPayment.voidReason
  });
}
