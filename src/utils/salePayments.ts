import { PaymentMethod, Sale, SalePaymentSplit } from "../types";
import { generateId } from "./id";
import { roundMoney } from "./numbers";

export const TRANSFER_BANK_OPTIONS = ["Banco Pichincha", "Banco Guayaquil", "Banco Internacional", "Otro"] as const;

export const SPLIT_PAYMENT_METHOD_OPTIONS: {
  value: PaymentMethod;
  title: string;
  detail: string;
  icon: string;
}[] = [
  { value: "01", title: "Efectivo", detail: "Codigo 01", icon: "cash" },
  { value: "20", title: "Transferencia", detail: "Codigo 20", icon: "bank-outline" },
  { value: "16", title: "Tarjeta debito", detail: "Codigo 16", icon: "credit-card-outline" },
  { value: "19", title: "Tarjeta credito", detail: "Codigo 19", icon: "credit-card-check-outline" }
];

export function paymentMethodLabel(value?: PaymentMethod | string) {
  switch (value) {
    case "01":
      return "01 - sin sistema financiero";
    case "15":
      return "15 - compensacion de deudas";
    case "16":
      return "16 - tarjeta de debito";
    case "17":
      return "17 - dinero electronico";
    case "18":
      return "18 - tarjeta prepago";
    case "19":
      return "19 - tarjeta de credito";
    case "20":
      return "20 - otros sistema financiero";
    case "21":
      return "21 - endoso de titulos";
    default:
      return value ? String(value) : "01 - sin sistema financiero";
  }
}

export function parsePaymentAmount(value: string | number | null | undefined) {
  if (typeof value === "number") return roundMoney(Math.max(0, value));
  const parsed = Number(String(value || "").replace(",", "."));
  return roundMoney(Math.max(0, Number.isFinite(parsed) ? parsed : 0));
}

export function createSalePayment(paymentMethod: PaymentMethod, amount = 0): SalePaymentSplit {
  return { id: generateId(), paymentMethod, amount: roundMoney(Math.max(0, amount)) };
}

export function salePaymentTotal(payments?: SalePaymentSplit[]) {
  return roundMoney((payments || []).reduce((sum, payment) => sum + parsePaymentAmount(payment.amount), 0));
}

export function salePaymentBalance(total: number, payments?: SalePaymentSplit[]) {
  return roundMoney(roundMoney(total || 0) - salePaymentTotal(payments));
}

export function normalizeSalePayments(payments: SalePaymentSplit[] | undefined, fallbackMethod: PaymentMethod, total: number) {
  const source = payments || [];
  const clean = source
    .map((payment) => ({
      ...payment,
      amount: parsePaymentAmount(payment.amount),
      paymentMethod: payment.paymentMethod || fallbackMethod
    }))
    .filter((payment) => payment.amount > 0 || source.length === 1);

  if (!clean.length) {
    return [createSalePayment(fallbackMethod || "01", roundMoney(Math.max(0, total || 0)))];
  }

  return clean.map((payment, index) => ({
    ...payment,
    id: payment.id || `${Date.now()}-${index}`
  }));
}

export function normalizePartialSalePayments(payments: SalePaymentSplit[] | undefined, fallbackMethod: PaymentMethod) {
  const source = payments || [];
  return source
    .map((payment) => ({
      ...payment,
      amount: parsePaymentAmount(payment.amount),
      paymentMethod: payment.paymentMethod || fallbackMethod
    }))
    .filter((payment) => payment.amount > 0)
    .map((payment, index) => ({
      ...payment,
      id: payment.id || `${Date.now()}-${index}`
    }));
}

export function salePaymentsForDisplay(sale: Sale): SalePaymentSplit[] {
  if (sale.paymentCondition === "credito") {
    return [createSalePayment("20", sale.total || 0)];
  }

  return normalizeSalePayments(sale.payments, sale.paymentMethod || "01", sale.total || 0);
}

export function paymentSplitLabel(payment: SalePaymentSplit) {
  return payment.bank ? `${paymentMethodLabel(payment.paymentMethod)} - ${payment.bank}` : paymentMethodLabel(payment.paymentMethod);
}
