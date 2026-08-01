import type {
  Client,
  CreditAdjustment,
  CreditPayment,
  Sale,
} from "../../types";
import { readMainSnapshotFastDescriptor } from "../mainSnapshotStorage";
import { AppMetadataRepository } from "./appMetadataRepository";
import { CatalogValidationReceiptRepository } from
  "./CatalogValidationReceiptRepository";
import { openFactuDarwinDatabase } from "./client";
import {
  calculateCreditLedgerMetrics,
  CreditLedgerRepository,
  type CreditAdjustmentMetrics,
  type CreditAdjustmentQuery,
  type CreditBalanceMetrics,
  type CreditPaymentMetrics,
  type CreditPaymentQuery,
} from "./CreditLedgerRepository";
import { sqliteCreditLedgerReadsEnabled } from "./creditLedgerReadFeature";
import { SQLITE_SCHEMA_VERSION } from "./schema";
import type { SQLiteConnection } from "./types";

export type CreditLedgerFallbackReason =
  | "FEATURE_DISABLED"
  | "WEB_USES_FILE"
  | "TENANT_MISSING"
  | "TENANT_MISMATCH"
  | "SCHEMA_NOT_READY"
  | "PAYMENT_RECEIPT_MISSING"
  | "ADJUSTMENT_RECEIPT_MISSING"
  | "PAYMENT_RECEIPT_NOT_VALIDATED"
  | "ADJUSTMENT_RECEIPT_NOT_VALIDATED"
  | "PAYMENT_MIRROR_DIRTY"
  | "ADJUSTMENT_MIRROR_DIRTY"
  | "RECEIPT_GENERATION_MISMATCH"
  | "SNAPSHOT_GENERATION_MISMATCH"
  | "PAYMENT_SOURCE_HASH_MISMATCH"
  | "ADJUSTMENT_SOURCE_HASH_MISMATCH"
  | "PAYMENT_ROW_COUNT_MISMATCH"
  | "ADJUSTMENT_ROW_COUNT_MISMATCH"
  | "PAYMENT_AGGREGATE_MISMATCH"
  | "ADJUSTMENT_AGGREGATE_MISMATCH"
  | "CREDIT_BALANCE_MISMATCH"
  | "SQLITE_OPEN_FAILED"
  | "SQLITE_PAYMENT_READ_FAILED"
  | "SQLITE_ADJUSTMENT_READ_FAILED";

export interface CreditLedgerReadDiagnostic {
  source: "sqlite" | "file";
  reason: CreditLedgerFallbackReason | null;
  detail: string;
  tenantId: string;
  checkedAt: string;
  validationDurationMs: number;
  paymentReadDurationMs: number;
  adjustmentReadDurationMs: number;
  totalDurationMs: number;
  filePaymentCount: number;
  sqlitePaymentCount: number;
  fileAdjustmentCount: number;
  sqliteAdjustmentCount: number;
}

export interface ControlledCreditLedgerRead {
  source: "sqlite" | "file";
  payments: CreditPayment[];
  adjustments: CreditAdjustment[];
  diagnostic: CreditLedgerReadDiagnostic;
}

export interface CreditLedgerReadQuery {
  payments?: CreditPaymentQuery;
  adjustments?: CreditAdjustmentQuery;
}

type RepositoryReader = Pick<
  CreditLedgerRepository,
  "listPayments" | "listAdjustments"
>;

interface Dependencies {
  openDatabase?: () => Promise<SQLiteConnection | null>;
  readDescriptor?: typeof readMainSnapshotFastDescriptor;
  createRepository?: (
    database: SQLiteConnection,
    tenantId: string,
  ) => RepositoryReader;
  platform?: string;
}

const lastLogKeys = new Map<string, string>();
const lastSuccessKeys = new Map<string, string>();
let lastDiagnostic: CreditLedgerReadDiagnostic | null = null;

function filterPayments(
  payments: CreditPayment[],
  query: CreditPaymentQuery = {},
): CreditPayment[] {
  return payments.filter((payment) =>
    (!query.saleId || payment.saleId === query.saleId) &&
    (!query.clientId || payment.clientId === query.clientId) &&
    (!query.operationId || payment.operationId === query.operationId) &&
    (!query.batchId || payment.batchId === query.batchId) &&
    (!query.batchOperationId ||
      payment.batchOperationId === query.batchOperationId) &&
    (!query.createdFrom || payment.createdAt >= query.createdFrom) &&
    (!query.createdTo || payment.createdAt <= query.createdTo) &&
    (!query.paymentMethod || payment.paymentMethod === query.paymentMethod) &&
    (query.voided === undefined ||
      Boolean(payment.voidedAt) === query.voided)
  );
}

function filterAdjustments(
  adjustments: CreditAdjustment[],
  query: CreditAdjustmentQuery = {},
): CreditAdjustment[] {
  return adjustments.filter((adjustment) =>
    (!query.saleId || adjustment.sourceSaleId === query.saleId) &&
    (!query.clientId || adjustment.clientId === query.clientId) &&
    (!query.creditNoteId ||
      adjustment.sourceCreditNoteId === query.creditNoteId) &&
    (!query.operationId || adjustment.operationId === query.operationId) &&
    (!query.status || adjustment.state === query.status)
  );
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function paymentMetrics(
  details: Record<string, unknown> | null,
): CreditPaymentMetrics | null {
  if (!details) return null;
  return Object.fromEntries(Object.entries(details).filter(([key]) =>
    key !== "balanceValidation" && key !== "pairedCatalog"
  )) as unknown as CreditPaymentMetrics;
}

function adjustmentMetrics(
  details: Record<string, unknown> | null,
): CreditAdjustmentMetrics | null {
  if (!details) return null;
  return Object.fromEntries(Object.entries(details).filter(([key]) =>
    key !== "balanceValidation" && key !== "pairedCatalog"
  )) as unknown as CreditAdjustmentMetrics;
}

function balanceMetrics(
  details: Record<string, unknown> | null,
): CreditBalanceMetrics | null {
  const value = details?.balanceValidation;
  return value && typeof value === "object"
    ? value as CreditBalanceMetrics
    : null;
}

function logFallback(diagnostic: CreditLedgerReadDiagnostic): void {
  const key = `${diagnostic.reason}:${diagnostic.detail}`;
  if (lastLogKeys.get(diagnostic.tenantId) === key) return;
  lastLogKeys.set(diagnostic.tenantId, key);
  // eslint-disable-next-line no-console
  console.info(JSON.stringify({
    event: "sqlite_credit_ledger_fallback",
    tenantId: diagnostic.tenantId,
    reason: diagnostic.reason,
    detail: diagnostic.detail,
    filePaymentCount: diagnostic.filePaymentCount,
    sqlitePaymentCount: diagnostic.sqlitePaymentCount,
    fileAdjustmentCount: diagnostic.fileAdjustmentCount,
    sqliteAdjustmentCount: diagnostic.sqliteAdjustmentCount,
  }));
}

function fallback(
  tenantId: string,
  payments: CreditPayment[],
  adjustments: CreditAdjustment[],
  startedAt: number,
  reason: CreditLedgerFallbackReason,
  detail: string,
  counts: { payments?: number; adjustments?: number } = {},
): ControlledCreditLedgerRead {
  const diagnostic: CreditLedgerReadDiagnostic = {
    source: "file",
    reason,
    detail,
    tenantId,
    checkedAt: new Date().toISOString(),
    validationDurationMs: Date.now() - startedAt,
    paymentReadDurationMs: 0,
    adjustmentReadDurationMs: 0,
    totalDurationMs: Date.now() - startedAt,
    filePaymentCount: payments.length,
    sqlitePaymentCount: counts.payments ?? 0,
    fileAdjustmentCount: adjustments.length,
    sqliteAdjustmentCount: counts.adjustments ?? 0,
  };
  lastDiagnostic = diagnostic;
  logFallback(diagnostic);
  return { source: "file", payments, adjustments, diagnostic };
}

function markDirty(
  database: SQLiteConnection,
  tenantId: string,
  catalogs: Array<"credit_payments" | "credit_adjustments">,
  reason: CreditLedgerFallbackReason,
  detail: string,
): void {
  const receipts = new CatalogValidationReceiptRepository({
    database, tenantId,
  });
  void Promise.all(catalogs.map((catalog) => receipts.markDirty(
    catalog,
    `SQLITE_CREDIT_LEDGER_READ_${reason}`,
    detail,
  ))).catch(() => undefined);
}

export function getLastCreditLedgerReadDiagnostic():
  CreditLedgerReadDiagnostic | null {
  return lastDiagnostic;
}

export function invalidateCreditLedgerReadContext(tenantId?: string): void {
  if (tenantId) {
    lastLogKeys.delete(tenantId);
    lastSuccessKeys.delete(tenantId);
  } else {
    lastLogKeys.clear();
    lastSuccessKeys.clear();
  }
  lastDiagnostic = null;
}

export async function readCreditLedgerControlled(
  tenantValue: string,
  canonicalPayments: CreditPayment[],
  canonicalAdjustments: CreditAdjustment[],
  sales: Sale[],
  clients: Client[],
  query: CreditLedgerReadQuery = {},
  options: { enabled?: boolean; dependencies?: Dependencies } = {},
): Promise<ControlledCreditLedgerRead> {
  const startedAt = Date.now();
  const tenantId = tenantValue.trim();
  const filePayments = filterPayments(canonicalPayments, query.payments);
  const fileAdjustments = filterAdjustments(
    canonicalAdjustments, query.adjustments,
  );
  const platform = options.dependencies?.platform ??
    (await import("react-native")).Platform.OS;
  if (platform !== "android" && platform !== "ios") {
    return fallback(tenantId, filePayments, fileAdjustments, startedAt,
      "WEB_USES_FILE", "La PWA siempre consulta el archivo canónico.");
  }
  if (!(options.enabled ?? sqliteCreditLedgerReadsEnabled())) {
    return fallback(tenantId, filePayments, fileAdjustments, startedAt,
      "FEATURE_DISABLED", "La lectura SQLite de cartera está desactivada.");
  }
  if (!tenantId) {
    return fallback(tenantId, filePayments, fileAdjustments, startedAt,
      "TENANT_MISSING", "No existe una empresa activa.");
  }

  let database: SQLiteConnection | null;
  try {
    database = await (
      options.dependencies?.openDatabase ?? openFactuDarwinDatabase
    )();
  } catch (error) {
    return fallback(tenantId, filePayments, fileAdjustments, startedAt,
      "SQLITE_OPEN_FAILED",
      error instanceof Error ? error.message : "No se pudo abrir SQLite.");
  }
  if (!database) {
    return fallback(tenantId, filePayments, fileAdjustments, startedAt,
      "SQLITE_OPEN_FAILED", "SQLite no está disponible.");
  }

  const dirtyFallback = (
    reason: CreditLedgerFallbackReason,
    detail: string,
    catalogs: Array<"credit_payments" | "credit_adjustments">,
    counts: { payments?: number; adjustments?: number } = {},
  ) => {
    markDirty(database!, tenantId, catalogs, reason, detail);
    return fallback(
      tenantId, filePayments, fileAdjustments, startedAt,
      reason, detail, counts,
    );
  };

  try {
    const descriptor = await (
      options.dependencies?.readDescriptor ?? readMainSnapshotFastDescriptor
    )();
    if (!descriptor || descriptor.companyId !== tenantId) {
      return fallback(tenantId, filePayments, fileAdjustments, startedAt,
        "TENANT_MISMATCH",
        "El snapshot no pertenece exactamente a la empresa activa.");
    }
    const metadata = await new AppMetadataRepository({
      database, tenantId,
    }).read();
    if (
      !metadata ||
      metadata.tenantId !== tenantId ||
      metadata.schemaVersion !== SQLITE_SCHEMA_VERSION ||
      SQLITE_SCHEMA_VERSION < 8
    ) {
      return fallback(tenantId, filePayments, fileAdjustments, startedAt,
        "SCHEMA_NOT_READY", "SQLite no corresponde al esquema v8.");
    }
    const receiptRepository = new CatalogValidationReceiptRepository({
      database, tenantId,
    });
    const [paymentsReceipt, adjustmentsReceipt] = await Promise.all([
      receiptRepository.read("credit_payments"),
      receiptRepository.read("credit_adjustments"),
    ]);
    if (!paymentsReceipt) {
      return fallback(tenantId, filePayments, fileAdjustments, startedAt,
        "PAYMENT_RECEIPT_MISSING", "No existe recibo de pagos.");
    }
    if (!adjustmentsReceipt) {
      return fallback(tenantId, filePayments, fileAdjustments, startedAt,
        "ADJUSTMENT_RECEIPT_MISSING", "No existe recibo de ajustes.");
    }
    if (paymentsReceipt.tenantId !== tenantId ||
        adjustmentsReceipt.tenantId !== tenantId) {
      return fallback(tenantId, filePayments, fileAdjustments, startedAt,
        "TENANT_MISMATCH", "Los recibos pertenecen a otra empresa.");
    }
    if (paymentsReceipt.status === "dirty") {
      return fallback(tenantId, filePayments, fileAdjustments, startedAt,
        "PAYMENT_MIRROR_DIRTY",
        paymentsReceipt.lastErrorCode || "El espejo de pagos está dirty.");
    }
    if (adjustmentsReceipt.status === "dirty") {
      return fallback(tenantId, filePayments, fileAdjustments, startedAt,
        "ADJUSTMENT_MIRROR_DIRTY",
        adjustmentsReceipt.lastErrorCode || "El espejo de ajustes está dirty.");
    }
    if (paymentsReceipt.status !== "validated") {
      return fallback(tenantId, filePayments, fileAdjustments, startedAt,
        "PAYMENT_RECEIPT_NOT_VALIDATED",
        "El recibo de pagos no está validado.");
    }
    if (adjustmentsReceipt.status !== "validated") {
      return fallback(tenantId, filePayments, fileAdjustments, startedAt,
        "ADJUSTMENT_RECEIPT_NOT_VALIDATED",
        "El recibo de ajustes no está validado.");
    }
    if (
      paymentsReceipt.schemaVersion < 8 ||
      adjustmentsReceipt.schemaVersion < 8 ||
      paymentsReceipt.schemaVersion > SQLITE_SCHEMA_VERSION ||
      adjustmentsReceipt.schemaVersion > SQLITE_SCHEMA_VERSION
    ) {
      return fallback(tenantId, filePayments, fileAdjustments, startedAt,
        "SCHEMA_NOT_READY", "Los recibos no pertenecen al esquema v8.");
    }
    if (paymentsReceipt.snapshotGeneration !==
        adjustmentsReceipt.snapshotGeneration) {
      return fallback(tenantId, filePayments, fileAdjustments, startedAt,
        "RECEIPT_GENERATION_MISMATCH",
        "Los recibos pertenecen a generaciones diferentes.");
    }
    if (paymentsReceipt.snapshotGeneration !==
        descriptor.snapshotGeneration) {
      return fallback(tenantId, filePayments, fileAdjustments, startedAt,
        "SNAPSHOT_GENERATION_MISMATCH",
        "El snapshot canónico es más reciente que el espejo.");
    }
    if (paymentsReceipt.sourceHash !==
        descriptor.catalogHashes.creditPayments) {
      return fallback(tenantId, filePayments, fileAdjustments, startedAt,
        "PAYMENT_SOURCE_HASH_MISMATCH",
        "El hash de pagos no coincide con el snapshot.");
    }
    if (adjustmentsReceipt.sourceHash !==
        descriptor.catalogHashes.creditAdjustments) {
      return fallback(tenantId, filePayments, fileAdjustments, startedAt,
        "ADJUSTMENT_SOURCE_HASH_MISMATCH",
        "El hash de ajustes no coincide con el snapshot.");
    }
    if (paymentsReceipt.rowCount !== canonicalPayments.length) {
      return dirtyFallback("PAYMENT_ROW_COUNT_MISMATCH",
        "El recibo y el archivo tienen cantidades de pagos distintas.",
        ["credit_payments"], { payments: paymentsReceipt.rowCount });
    }
    if (adjustmentsReceipt.rowCount !== canonicalAdjustments.length) {
      return dirtyFallback("ADJUSTMENT_ROW_COUNT_MISMATCH",
        "El recibo y el archivo tienen cantidades de ajustes distintas.",
        ["credit_adjustments"], {
          adjustments: adjustmentsReceipt.rowCount,
        });
    }

    const repository = options.dependencies?.createRepository?.(
      database, tenantId,
    ) ?? new CreditLedgerRepository({ database, tenantId });
    const paymentReadStartedAt = Date.now();
    let allPayments: CreditPayment[];
    try {
      allPayments = await repository.listPayments();
    } catch (error) {
      const detail = error instanceof Error
        ? error.message : "No se pudieron leer pagos.";
      return dirtyFallback("SQLITE_PAYMENT_READ_FAILED", detail,
        ["credit_payments"]);
    }
    const paymentReadDurationMs = Date.now() - paymentReadStartedAt;
    const adjustmentReadStartedAt = Date.now();
    let allAdjustments: CreditAdjustment[];
    try {
      allAdjustments = await repository.listAdjustments();
    } catch (error) {
      const detail = error instanceof Error
        ? error.message : "No se pudieron leer ajustes.";
      return dirtyFallback("SQLITE_ADJUSTMENT_READ_FAILED", detail,
        ["credit_adjustments"], { payments: allPayments.length });
    }
    const adjustmentReadDurationMs = Date.now() - adjustmentReadStartedAt;
    if (allPayments.length !== paymentsReceipt.rowCount) {
      return dirtyFallback("PAYMENT_ROW_COUNT_MISMATCH",
        "SQLite devolvió otra cantidad de pagos.", ["credit_payments"],
        { payments: allPayments.length, adjustments: allAdjustments.length });
    }
    if (allAdjustments.length !== adjustmentsReceipt.rowCount) {
      return dirtyFallback("ADJUSTMENT_ROW_COUNT_MISMATCH",
        "SQLite devolvió otra cantidad de ajustes.", ["credit_adjustments"],
        { payments: allPayments.length, adjustments: allAdjustments.length });
    }
    const actual = calculateCreditLedgerMetrics(
      allPayments, allAdjustments, sales, clients,
    );
    const expectedPayments = paymentMetrics(
      paymentsReceipt.validationDetails,
    );
    const expectedAdjustments = adjustmentMetrics(
      adjustmentsReceipt.validationDetails,
    );
    const expectedPaymentBalances = balanceMetrics(
      paymentsReceipt.validationDetails,
    );
    const expectedAdjustmentBalances = balanceMetrics(
      adjustmentsReceipt.validationDetails,
    );
    if (!expectedPayments || !same(expectedPayments, actual.payments)) {
      return dirtyFallback("PAYMENT_AGGREGATE_MISMATCH",
        "Los agregados de pagos no coinciden.", ["credit_payments"],
        { payments: allPayments.length, adjustments: allAdjustments.length });
    }
    if (!expectedAdjustments ||
        !same(expectedAdjustments, actual.adjustments)) {
      return dirtyFallback("ADJUSTMENT_AGGREGATE_MISMATCH",
        "Los agregados de ajustes no coinciden.", ["credit_adjustments"],
        { payments: allPayments.length, adjustments: allAdjustments.length });
    }
    if (!expectedPaymentBalances || !expectedAdjustmentBalances ||
        !same(expectedPaymentBalances, expectedAdjustmentBalances) ||
        !same(expectedPaymentBalances, actual.balances)) {
      return dirtyFallback("CREDIT_BALANCE_MISMATCH",
        "La validación de saldos no coincide.",
        ["credit_payments", "credit_adjustments"],
        { payments: allPayments.length, adjustments: allAdjustments.length });
    }
    const payments = filterPayments(allPayments, query.payments);
    const adjustments = filterAdjustments(
      allAdjustments, query.adjustments,
    );
    const diagnostic: CreditLedgerReadDiagnostic = {
      source: "sqlite",
      reason: null,
      detail: "",
      tenantId,
      checkedAt: new Date().toISOString(),
      validationDurationMs:
        paymentReadStartedAt - startedAt,
      paymentReadDurationMs,
      adjustmentReadDurationMs,
      totalDurationMs: Date.now() - startedAt,
      filePaymentCount: filePayments.length,
      sqlitePaymentCount: payments.length,
      fileAdjustmentCount: fileAdjustments.length,
      sqliteAdjustmentCount: adjustments.length,
    };
    lastLogKeys.delete(tenantId);
    const successKey = [
      descriptor.snapshotGeneration,
      payments.length,
      adjustments.length,
    ].join(":");
    if (lastSuccessKeys.get(tenantId) !== successKey) {
      lastSuccessKeys.set(tenantId, successKey);
      // eslint-disable-next-line no-console
      console.info(JSON.stringify({
        event: "sqlite_credit_ledger_read",
        tenantId,
        generation: descriptor.snapshotGeneration,
        validationDurationMs: diagnostic.validationDurationMs,
        paymentReadDurationMs,
        adjustmentReadDurationMs,
        totalDurationMs: diagnostic.totalDurationMs,
        filePaymentCount: diagnostic.filePaymentCount,
        sqlitePaymentCount: diagnostic.sqlitePaymentCount,
        fileAdjustmentCount: diagnostic.fileAdjustmentCount,
        sqliteAdjustmentCount: diagnostic.sqliteAdjustmentCount,
      }));
    }
    lastDiagnostic = diagnostic;
    return { source: "sqlite", payments, adjustments, diagnostic };
  } catch (error) {
    const detail = error instanceof Error
      ? error.message : "Error leyendo la cartera.";
    return dirtyFallback("SQLITE_PAYMENT_READ_FAILED", detail,
      ["credit_payments", "credit_adjustments"]);
  }
}
