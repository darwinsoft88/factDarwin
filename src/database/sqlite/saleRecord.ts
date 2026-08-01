import type {
  AdditionalInfoField,
  Sale,
  SaleItem,
  SalePaymentSplit,
} from "../../types";

export const SALE_DECIMAL_SCALE = 1_000_000;

const SALE_KEYS = new Set([
  "id", "documentType", "establishment", "emissionPoint",
  "establishmentName", "clientId", "userId", "createdAt", "sequence",
  "accessKey", "authorizationNumber", "authorizationDate",
  "sriEnvironment", "sriMessage", "retryHistory", "emailHistory",
  "sourceSaleId", "inventoryState", "inventoryOperationId",
  "creditNoteInventoryState", "creditNoteInventoryOperationId",
  "autoInvoiceOnSync", "autoInvoiceAttemptedAt", "autoInvoiceLastError",
  "convertedAt", "convertedToSaleId", "convertedToSequence",
  "supportDocumentType", "supportDocumentNumber",
  "supportAuthorizationNumber", "supportIssueDate", "creditReason",
  "voidReason", "voidedAt", "signedXml", "authorizedXml", "subtotal",
  "tax", "total", "paymentMethod", "payments", "paymentCondition",
  "creditDueDate", "creditBalance", "creditStatus", "additionalInfo",
  "status", "items",
]);
const ITEM_KEYS = new Set([
  "productId", "itemType", "code", "name", "quantity", "unitPrice",
  "cost", "discount", "ivaRate", "sourceLineKey",
]);
const PAYMENT_KEYS = new Set([
  "id", "paymentMethod", "amount", "bank", "reference",
]);
const ADDITIONAL_INFO_KEYS = new Set(["id", "name", "value"]);
const EMAIL_KEYS = new Set(["to", "sentAt", "status", "error"]);

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function compatibility(
  source: Record<string, unknown>,
  known: Set<string>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(source)
      .filter(([key]) => !known.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, stableValue(value)]),
  );
}

export function decimalToScaled(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.round(numeric * SALE_DECIMAL_SCALE)
    : 0;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function optionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export interface CanonicalSaleItem {
  productId: string;
  itemType: string | null;
  code: string;
  name: string;
  quantityMicros: number;
  unitPriceMicros: number;
  costMicros: number | null;
  discountMicros: number;
  ivaRateMicros: number;
  sourceLineKey: string | null;
  compatibility: Record<string, unknown>;
}

export interface CanonicalSalePayment {
  id: string | null;
  paymentMethod: string;
  amountMicros: number;
  bank: string | null;
  reference: string | null;
  compatibility: Record<string, unknown>;
}

export interface CanonicalAdditionalInfo {
  id: string | null;
  name: string;
  value: string;
  compatibility: Record<string, unknown>;
}

export interface CanonicalEmailHistory {
  to: string;
  sentAt: string;
  status: string;
  error: string | null;
  compatibility: Record<string, unknown>;
}

export interface CanonicalSaleRecord {
  id: string;
  documentType: string | null;
  establishment: string | null;
  emissionPoint: string | null;
  establishmentName: string | null;
  clientId: string;
  userId: string;
  createdAt: string;
  sequence: string;
  accessKey: string;
  authorizationNumber: string | null;
  authorizationDate: string | null;
  sriEnvironment: string | null;
  sriMessage: string | null;
  sourceSaleId: string | null;
  inventoryState: string | null;
  inventoryOperationId: string | null;
  creditNoteInventoryState: string | null;
  creditNoteInventoryOperationId: string | null;
  autoInvoiceOnSync: boolean | null;
  autoInvoiceAttemptedAt: string | null;
  autoInvoiceLastError: string | null;
  convertedAt: string | null;
  convertedToSaleId: string | null;
  convertedToSequence: string | null;
  supportDocumentType: string | null;
  supportDocumentNumber: string | null;
  supportAuthorizationNumber: string | null;
  supportIssueDate: string | null;
  creditReason: string | null;
  voidReason: string | null;
  voidedAt: string | null;
  subtotalMicros: number;
  taxMicros: number;
  totalMicros: number;
  paymentMethod: string;
  paymentCondition: string | null;
  creditDueDate: string | null;
  creditBalanceMicros: number | null;
  creditStatus: string | null;
  status: string;
  paymentsPresent: boolean;
  additionalInfoPresent: boolean;
  retryHistoryPresent: boolean;
  emailHistoryPresent: boolean;
  signedXml: string | null;
  authorizedXml: string | null;
  retryHistory: string[];
  emailHistory: CanonicalEmailHistory[];
  items: CanonicalSaleItem[];
  payments: CanonicalSalePayment[];
  additionalInfo: CanonicalAdditionalInfo[];
  compatibility: Record<string, unknown>;
}

function canonicalItem(item: SaleItem): CanonicalSaleItem {
  const source = item as SaleItem & Record<string, unknown>;
  return {
    productId: String(item.productId ?? ""),
    itemType: optionalString(source.itemType),
    code: String(item.code ?? ""),
    name: String(item.name ?? ""),
    quantityMicros: decimalToScaled(item.quantity),
    unitPriceMicros: decimalToScaled(item.unitPrice),
    costMicros: source.cost === undefined
      ? null
      : decimalToScaled(source.cost),
    discountMicros: decimalToScaled(item.discount),
    ivaRateMicros: decimalToScaled(item.ivaRate),
    sourceLineKey: optionalString(source.sourceLineKey),
    compatibility: compatibility(source, ITEM_KEYS),
  };
}

function canonicalPayment(payment: SalePaymentSplit): CanonicalSalePayment {
  const source = payment as SalePaymentSplit & Record<string, unknown>;
  return {
    id: optionalString(source.id),
    paymentMethod: String(payment.paymentMethod ?? ""),
    amountMicros: decimalToScaled(payment.amount),
    bank: optionalString(source.bank),
    reference: optionalString(source.reference),
    compatibility: compatibility(source, PAYMENT_KEYS),
  };
}

function canonicalAdditionalInfo(
  field: AdditionalInfoField,
): CanonicalAdditionalInfo {
  const source = field as AdditionalInfoField & Record<string, unknown>;
  return {
    id: optionalString(source.id),
    name: String(field.name ?? ""),
    value: String(field.value ?? ""),
    compatibility: compatibility(source, ADDITIONAL_INFO_KEYS),
  };
}

export function canonicalSaleRecord(sale: Sale): CanonicalSaleRecord {
  const source = sale as Sale & Record<string, unknown>;
  const emailHistory = Array.isArray(sale.emailHistory)
    ? sale.emailHistory.map((entry) => {
      const email = entry as typeof entry & Record<string, unknown>;
      return {
        to: String(entry.to ?? ""),
        sentAt: String(entry.sentAt ?? ""),
        status: String(entry.status ?? ""),
        error: optionalString(email.error),
        compatibility: compatibility(email, EMAIL_KEYS),
      };
    })
    : [];
  return {
    id: String(sale.id),
    documentType: optionalString(source.documentType),
    establishment: optionalString(source.establishment),
    emissionPoint: optionalString(source.emissionPoint),
    establishmentName: optionalString(source.establishmentName),
    clientId: String(sale.clientId ?? ""),
    userId: String(sale.userId ?? ""),
    createdAt: String(sale.createdAt ?? ""),
    sequence: String(sale.sequence ?? ""),
    accessKey: String(sale.accessKey ?? ""),
    authorizationNumber: optionalString(source.authorizationNumber),
    authorizationDate: optionalString(source.authorizationDate),
    sriEnvironment: optionalString(source.sriEnvironment),
    sriMessage: optionalString(source.sriMessage),
    sourceSaleId: optionalString(source.sourceSaleId),
    inventoryState: optionalString(source.inventoryState),
    inventoryOperationId: optionalString(source.inventoryOperationId),
    creditNoteInventoryState:
      optionalString(source.creditNoteInventoryState),
    creditNoteInventoryOperationId:
      optionalString(source.creditNoteInventoryOperationId),
    autoInvoiceOnSync: optionalBoolean(source.autoInvoiceOnSync),
    autoInvoiceAttemptedAt: optionalString(source.autoInvoiceAttemptedAt),
    autoInvoiceLastError: optionalString(source.autoInvoiceLastError),
    convertedAt: optionalString(source.convertedAt),
    convertedToSaleId: optionalString(source.convertedToSaleId),
    convertedToSequence: optionalString(source.convertedToSequence),
    supportDocumentType: optionalString(source.supportDocumentType),
    supportDocumentNumber: optionalString(source.supportDocumentNumber),
    supportAuthorizationNumber:
      optionalString(source.supportAuthorizationNumber),
    supportIssueDate: optionalString(source.supportIssueDate),
    creditReason: optionalString(source.creditReason),
    voidReason: optionalString(source.voidReason),
    voidedAt: optionalString(source.voidedAt),
    subtotalMicros: decimalToScaled(sale.subtotal),
    taxMicros: decimalToScaled(sale.tax),
    totalMicros: decimalToScaled(sale.total),
    paymentMethod: String(sale.paymentMethod ?? ""),
    paymentCondition: optionalString(source.paymentCondition),
    creditDueDate: optionalString(source.creditDueDate),
    creditBalanceMicros: source.creditBalance === undefined
      ? null
      : decimalToScaled(source.creditBalance),
    creditStatus: optionalString(source.creditStatus),
    status: String(sale.status ?? ""),
    paymentsPresent: Array.isArray(sale.payments),
    additionalInfoPresent: Array.isArray(sale.additionalInfo),
    retryHistoryPresent: Array.isArray(sale.retryHistory),
    emailHistoryPresent: Array.isArray(sale.emailHistory),
    signedXml: optionalString(source.signedXml),
    authorizedXml: optionalString(source.authorizedXml),
    retryHistory: Array.isArray(sale.retryHistory)
      ? sale.retryHistory.map(String)
      : [],
    emailHistory,
    items: Array.isArray(sale.items) ? sale.items.map(canonicalItem) : [],
    payments: Array.isArray(sale.payments)
      ? sale.payments.map(canonicalPayment)
      : [],
    additionalInfo: Array.isArray(sale.additionalInfo)
      ? sale.additionalInfo.map(canonicalAdditionalInfo)
      : [],
    compatibility: compatibility(source, SALE_KEYS),
  };
}

export function serializeCanonicalSale(sale: Sale): string {
  return JSON.stringify(canonicalSaleRecord(sale));
}

function scaledToDecimal(value: number): number {
  return value / SALE_DECIMAL_SCALE;
}

export function saleFromCanonicalRecord(record: CanonicalSaleRecord): Sale {
  const sale = {
    ...record.compatibility,
    id: record.id,
    clientId: record.clientId,
    userId: record.userId,
    createdAt: record.createdAt,
    sequence: record.sequence,
    accessKey: record.accessKey,
    subtotal: scaledToDecimal(record.subtotalMicros),
    tax: scaledToDecimal(record.taxMicros),
    total: scaledToDecimal(record.totalMicros),
    paymentMethod: record.paymentMethod,
    status: record.status,
    items: record.items.map((item) => ({
      ...item.compatibility,
      productId: item.productId,
      code: item.code,
      name: item.name,
      quantity: scaledToDecimal(item.quantityMicros),
      unitPrice: scaledToDecimal(item.unitPriceMicros),
      discount: scaledToDecimal(item.discountMicros),
      ivaRate: scaledToDecimal(item.ivaRateMicros),
      ...(item.itemType ? { itemType: item.itemType } : {}),
      ...(item.costMicros === null
        ? {}
        : { cost: scaledToDecimal(item.costMicros) }),
      ...(item.sourceLineKey
        ? { sourceLineKey: item.sourceLineKey }
        : {}),
    })),
  } as Sale;
  const optionalStrings: Array<[keyof Sale, string | null]> = [
    ["documentType", record.documentType],
    ["establishment", record.establishment],
    ["emissionPoint", record.emissionPoint],
    ["establishmentName", record.establishmentName],
    ["authorizationNumber", record.authorizationNumber],
    ["authorizationDate", record.authorizationDate],
    ["sriEnvironment", record.sriEnvironment],
    ["sriMessage", record.sriMessage],
    ["sourceSaleId", record.sourceSaleId],
    ["inventoryState", record.inventoryState],
    ["inventoryOperationId", record.inventoryOperationId],
    ["creditNoteInventoryState", record.creditNoteInventoryState],
    ["creditNoteInventoryOperationId",
      record.creditNoteInventoryOperationId],
    ["autoInvoiceAttemptedAt", record.autoInvoiceAttemptedAt],
    ["autoInvoiceLastError", record.autoInvoiceLastError],
    ["convertedAt", record.convertedAt],
    ["convertedToSaleId", record.convertedToSaleId],
    ["convertedToSequence", record.convertedToSequence],
    ["supportDocumentType", record.supportDocumentType],
    ["supportDocumentNumber", record.supportDocumentNumber],
    ["supportAuthorizationNumber", record.supportAuthorizationNumber],
    ["supportIssueDate", record.supportIssueDate],
    ["creditReason", record.creditReason],
    ["voidReason", record.voidReason],
    ["voidedAt", record.voidedAt],
    ["paymentCondition", record.paymentCondition],
    ["creditDueDate", record.creditDueDate],
    ["creditStatus", record.creditStatus],
  ];
  for (const [key, value] of optionalStrings) {
    if (value !== null) {
      (sale as unknown as Record<string, unknown>)[key] = value;
    }
  }
  if (record.autoInvoiceOnSync !== null) {
    sale.autoInvoiceOnSync = record.autoInvoiceOnSync;
  }
  if (record.creditBalanceMicros !== null) {
    sale.creditBalance = scaledToDecimal(record.creditBalanceMicros);
  }
  if (record.signedXml !== null) sale.signedXml = record.signedXml;
  if (record.authorizedXml !== null) sale.authorizedXml = record.authorizedXml;
  if (record.retryHistoryPresent) {
    sale.retryHistory = [...record.retryHistory];
  }
  if (record.emailHistoryPresent) {
    sale.emailHistory = record.emailHistory.map((email) => ({
      ...email.compatibility,
      to: email.to,
      sentAt: email.sentAt,
      status: email.status,
      ...(email.error === null ? {} : { error: email.error }),
    })) as Sale["emailHistory"];
  }
  if (record.paymentsPresent) {
    sale.payments = record.payments.map((payment) => ({
      ...payment.compatibility,
      ...(payment.id === null ? {} : { id: payment.id }),
      paymentMethod: payment.paymentMethod,
      amount: scaledToDecimal(payment.amountMicros),
      ...(payment.bank === null ? {} : { bank: payment.bank }),
      ...(payment.reference === null
        ? {}
        : { reference: payment.reference }),
    })) as Sale["payments"];
  }
  if (record.additionalInfoPresent) {
    sale.additionalInfo = record.additionalInfo.map((field) => ({
      ...field.compatibility,
      ...(field.id === null ? {} : { id: field.id }),
      name: field.name,
      value: field.value,
    })) as Sale["additionalInfo"];
  }
  return sale;
}

export async function hashSaleRecord(sale: Sale): Promise<string> {
  const { CryptoDigestAlgorithm, digestStringAsync } =
    await import("expo-crypto");
  return digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    serializeCanonicalSale(sale),
  );
}

export interface SalesFinancialMetrics {
  subtotalMicros: number;
  taxMicros: number;
  discountMicros: number;
  totalMicros: number;
  creditBalanceMicros: number;
  lineCount: number;
  paymentCount: number;
  signedXmlCount: number;
  authorizedXmlCount: number;
}

export function saleFinancialMetrics(
  record: CanonicalSaleRecord,
): SalesFinancialMetrics {
  return {
    subtotalMicros: record.subtotalMicros,
    taxMicros: record.taxMicros,
    discountMicros: record.items.reduce(
      (sum, item) => sum + item.discountMicros,
      0,
    ),
    totalMicros: record.totalMicros,
    creditBalanceMicros: record.creditBalanceMicros ?? 0,
    lineCount: record.items.length,
    paymentCount: record.payments.length,
    signedXmlCount: record.signedXml === null ? 0 : 1,
    authorizedXmlCount: record.authorizedXml === null ? 0 : 1,
  };
}
