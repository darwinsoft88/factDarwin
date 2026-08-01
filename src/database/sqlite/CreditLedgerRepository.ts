import type {
  AppData,
  Client,
  CreditAdjustment,
  CreditPayment,
  Sale,
} from "../../types";
import { reconcileCreditBalances } from "../../utils/credit";
import { roundMoney } from "../../utils/numbers";
import { salePaymentTotal } from "../../utils/salePayments";
import {
  canonicalCreditAdjustment,
  canonicalCreditPayment,
  hashCreditAdjustment,
  hashCreditPayment,
} from "./creditLedgerRecord";
import { CatalogValidationReceiptRepository } from
  "./CatalogValidationReceiptRepository";
import {
  TenantRepository,
  type TenantRepositoryContext,
} from "./repository";
import { SALE_DECIMAL_SCALE } from "./saleRecord";
import type { SQLiteConnection } from "./types";

interface PreparedPayment {
  source: CreditPayment;
  record: ReturnType<typeof canonicalCreditPayment>;
  hash: string;
  sourceIndex: number;
}

interface PreparedAdjustment {
  source: CreditAdjustment;
  record: ReturnType<typeof canonicalCreditAdjustment>;
  hash: string;
  sourceIndex: number;
}

interface HashRow {
  id: string;
  source_index: number;
  record_hash: string;
}

interface PaymentRow {
  id: string;
  source_index: number;
  operation_id: string | null;
  batch_id: string | null;
  batch_operation_id: string | null;
  batch_size: number | null;
  void_operation_id: string | null;
  sale_id: string;
  client_id: string;
  establishment: string | null;
  emission_point: string | null;
  establishment_name: string | null;
  user_id: string;
  user_name: string;
  amount_micros: number;
  payment_method: string;
  note: string | null;
  payment_date: string;
  voided_at: string | null;
  voided_by_user_id: string | null;
  voided_by_user_name: string | null;
  void_reason: string | null;
  compatibility_json: string | null;
}

interface AdjustmentRow {
  id: string;
  source_index: number;
  operation_id: string | null;
  reverse_operation_id: string | null;
  adjustment_type: string;
  credit_note_id: string;
  sale_id: string;
  client_id: string;
  amount_micros: number;
  status: string;
  applied_at: string | null;
  reversed_at: string | null;
  user_id: string;
  reason: string | null;
  compatibility_json: string | null;
}

export interface CreditPaymentQuery {
  saleId?: string;
  clientId?: string;
  operationId?: string;
  batchId?: string;
  batchOperationId?: string;
  createdFrom?: string;
  createdTo?: string;
  paymentMethod?: string;
  voided?: boolean;
}

export interface CreditAdjustmentQuery {
  saleId?: string;
  clientId?: string;
  creditNoteId?: string;
  operationId?: string;
  status?: string;
}

export interface CreditPaymentMetrics {
  grossMicros: number;
  validMicros: number;
  voidedMicros: number;
  validCount: number;
  voidedCount: number;
  modernOperationCount: number;
  legacyWithoutOperationCount: number;
  duplicateOperationCount: number;
  missingSaleCount: number;
  missingClientCount: number;
  completeBatchCount: number;
  partialBatchCount: number;
  duplicateBatchMemberCount: number;
  partiallyVoidedBatchCount: number;
  totalsBySale: Record<string, number>;
  totalsByClient: Record<string, number>;
  totalsByPaymentMethod: Record<string, number>;
}

export interface CreditAdjustmentMetrics {
  appliedCount: number;
  reversedCount: number;
  unknownCount: number;
  appliedMicros: number;
  reversedMicros: number;
  unknownMicros: number;
  effectiveMicros: number;
  duplicateOperationCount: number;
  duplicateReverseOperationCount: number;
  legacyIncompleteCount: number;
  missingSaleCount: number;
  missingClientCount: number;
  missingCreditNoteCount: number;
  totalsBySale: Record<string, number>;
  totalsByCreditNote: Record<string, number>;
}

export interface CreditBalanceMetrics {
  pendingCount: number;
  paidCount: number;
  inconsistentBalanceCount: number;
  negativeBalanceCount: number;
}

export interface CreditLedgerMigrationResult {
  equal: boolean;
  paymentCount: number;
  adjustmentCount: number;
  comparedPaymentHashes: number;
  comparedAdjustmentHashes: number;
  paymentMetrics: CreditPaymentMetrics;
  adjustmentMetrics: CreditAdjustmentMetrics;
  balanceMetrics: CreditBalanceMetrics;
  differences: string[];
  durationMs: number;
}

export interface CreditLedgerMetrics {
  payments: CreditPaymentMetrics;
  adjustments: CreditAdjustmentMetrics;
  balances: CreditBalanceMetrics;
}

export interface CreditLedgerReceiptInput {
  snapshotGeneration: string;
  creditPaymentsHash: string;
  creditAdjustmentsHash: string;
  schemaVersion: number;
  confirmCanonical: () => Promise<boolean>;
}

function add(
  target: Record<string, number>,
  key: string,
  value: number,
): void {
  target[key] = (target[key] ?? 0) + value;
}

function sorted(values: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(values).sort(([left], [right]) =>
      left.localeCompare(right)
    ),
  );
}

function duplicateCount(values: Array<string | null>): number {
  const counts = new Map<string, number>();
  values.filter((value): value is string => Boolean(value))
    .forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.values()].filter((count) => count > 1).length;
}

function paymentMetrics(
  payments: PreparedPayment[],
  sales: Sale[],
  clients: Client[],
): CreditPaymentMetrics {
  const saleIds = new Set(sales.map(({ id }) => id));
  const clientIds = new Set(clients.map(({ id }) => id));
  const batches = new Map<string, PreparedPayment[]>();
  const result: CreditPaymentMetrics = {
    grossMicros: 0,
    validMicros: 0,
    voidedMicros: 0,
    validCount: 0,
    voidedCount: 0,
    modernOperationCount: 0,
    legacyWithoutOperationCount: 0,
    duplicateOperationCount: duplicateCount(
      payments.map(({ record }) => record.operationId),
    ),
    missingSaleCount: 0,
    missingClientCount: 0,
    completeBatchCount: 0,
    partialBatchCount: 0,
    duplicateBatchMemberCount: 0,
    partiallyVoidedBatchCount: 0,
    totalsBySale: {},
    totalsByClient: {},
    totalsByPaymentMethod: {},
  };
  for (const payment of payments) {
    const { record } = payment;
    const amount = record.amountMicros ?? 0;
    result.grossMicros += amount;
    if (record.operationId) result.modernOperationCount += 1;
    else result.legacyWithoutOperationCount += 1;
    if (!saleIds.has(record.saleId)) result.missingSaleCount += 1;
    if (!clientIds.has(record.clientId)) result.missingClientCount += 1;
    if (record.voidedAt) {
      result.voidedCount += 1;
      result.voidedMicros += amount;
    } else {
      result.validCount += 1;
      result.validMicros += amount;
      add(result.totalsBySale, record.saleId, amount);
      add(result.totalsByClient, record.clientId, amount);
      add(result.totalsByPaymentMethod, record.paymentMethod, amount);
    }
    if (record.batchOperationId) {
      const rows = batches.get(record.batchOperationId) ?? [];
      rows.push(payment);
      batches.set(record.batchOperationId, rows);
    }
  }
  for (const rows of batches.values()) {
    const declared = new Set(rows.map(({ record }) => record.batchSize));
    const ids = new Set(rows.map(({ record }) => record.saleId));
    const expected = declared.size === 1 ? [...declared][0] : null;
    if (ids.size !== rows.length) result.duplicateBatchMemberCount += 1;
    if (
      expected !== null &&
      expected === rows.length &&
      ids.size === rows.length
    ) {
      result.completeBatchCount += 1;
    } else {
      result.partialBatchCount += 1;
    }
    const voided = rows.filter(({ record }) => record.voidedAt).length;
    if (voided > 0 && voided < rows.length) {
      result.partiallyVoidedBatchCount += 1;
    }
  }
  result.totalsBySale = sorted(result.totalsBySale);
  result.totalsByClient = sorted(result.totalsByClient);
  result.totalsByPaymentMethod = sorted(result.totalsByPaymentMethod);
  return result;
}

function adjustmentMetrics(
  adjustments: PreparedAdjustment[],
  payments: PreparedPayment[],
  sales: Sale[],
  clients: Client[],
): CreditAdjustmentMetrics {
  const salesById = new Map(sales.map((sale) => [sale.id, sale]));
  const clientIds = new Set(clients.map(({ id }) => id));
  const result: CreditAdjustmentMetrics = {
    appliedCount: 0,
    reversedCount: 0,
    unknownCount: 0,
    appliedMicros: 0,
    reversedMicros: 0,
    unknownMicros: 0,
    effectiveMicros: 0,
    duplicateOperationCount: duplicateCount(
      adjustments.map(({ record }) => record.operationId),
    ),
    duplicateReverseOperationCount: duplicateCount(
      adjustments.map(({ record }) => record.reverseOperationId),
    ),
    legacyIncompleteCount: 0,
    missingSaleCount: 0,
    missingClientCount: 0,
    missingCreditNoteCount: 0,
    totalsBySale: {},
    totalsByCreditNote: {},
  };
  for (const { record } of adjustments) {
    const amount = record.amountMicros ?? 0;
    if (!record.operationId) result.legacyIncompleteCount += 1;
    if (!salesById.has(record.saleId)) result.missingSaleCount += 1;
    if (!clientIds.has(record.clientId)) result.missingClientCount += 1;
    if (
      salesById.get(record.creditNoteId)?.documentType !== "nota_credito"
    ) {
      result.missingCreditNoteCount += 1;
    }
    add(result.totalsBySale, record.saleId, amount);
    add(result.totalsByCreditNote, record.creditNoteId, amount);
    if (record.status === "APPLIED") {
      result.appliedCount += 1;
      result.appliedMicros += amount;
    } else if (record.status === "REVERSED") {
      result.reversedCount += 1;
      result.reversedMicros += amount;
    } else {
      result.unknownCount += 1;
      result.unknownMicros += amount;
    }
  }
  for (const sale of sales.filter(({ paymentCondition }) =>
    paymentCondition === "credito"
  )) {
    const initiallyPaid = salePaymentTotal(sale.payments);
    const externallyPaid = payments
      .filter(({ record }) =>
        record.saleId === sale.id && !record.voidedAt
      )
      .reduce((sum, { record }) => sum + (record.amountMicros ?? 0), 0) /
      SALE_DECIMAL_SCALE;
    let remaining = Math.max(
      0,
      roundMoney(Number(sale.total || 0) - initiallyPaid - externallyPaid),
    );
    adjustments
      .filter(({ record }) =>
        record.saleId === sale.id && record.status === "APPLIED"
      )
      .sort((left, right) =>
        String(left.record.appliedAt || "").localeCompare(
          String(right.record.appliedAt || ""),
        ) || left.record.id.localeCompare(right.record.id)
      )
      .forEach(({ record }) => {
        const amount = (record.amountMicros ?? 0) / SALE_DECIMAL_SCALE;
        const effective = Math.min(amount, remaining);
        result.effectiveMicros += Math.round(
          effective * SALE_DECIMAL_SCALE,
        );
        remaining = Math.max(0, roundMoney(remaining - effective));
      });
  }
  result.totalsBySale = sorted(result.totalsBySale);
  result.totalsByCreditNote = sorted(result.totalsByCreditNote);
  return result;
}

function balanceMetrics(
  sales: Sale[],
  clients: Client[],
  payments: CreditPayment[],
  adjustments: CreditAdjustment[],
): CreditBalanceMetrics {
  const reconciled = reconcileCreditBalances({
    sales,
    clients,
    creditPayments: payments,
    creditAdjustments: adjustments,
  } as AppData);
  const expectedById = new Map(reconciled.sales.map((sale) => [
    sale.id,
    sale.creditBalance,
  ]));
  const result: CreditBalanceMetrics = {
    pendingCount: 0,
    paidCount: 0,
    inconsistentBalanceCount: 0,
    negativeBalanceCount: 0,
  };
  for (const sale of sales.filter(({ paymentCondition }) =>
    paymentCondition === "credito"
  )) {
    const stored = roundMoney(Number(sale.creditBalance ?? sale.total));
    const expected = roundMoney(Number(expectedById.get(sale.id) ?? 0));
    if (stored > 0) result.pendingCount += 1;
    else result.paidCount += 1;
    if (stored < 0) result.negativeBalanceCount += 1;
    if (stored !== expected) result.inconsistentBalanceCount += 1;
  }
  return result;
}

function optional<T>(value: T | null): T | undefined {
  return value === null ? undefined : value;
}

function compatibilityValue(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    throw new Error("CREDIT_LEDGER_COMPATIBILITY_INVALID");
  }
}

function paymentFromRow(row: PaymentRow): CreditPayment {
  return {
    ...compatibilityValue(row.compatibility_json),
    id: row.id,
    operationId: optional(row.operation_id),
    batchId: optional(row.batch_id),
    batchOperationId: optional(row.batch_operation_id),
    batchSize: optional(row.batch_size),
    voidOperationId: optional(row.void_operation_id),
    saleId: row.sale_id,
    clientId: row.client_id,
    establishment: optional(row.establishment),
    emissionPoint: optional(row.emission_point),
    establishmentName: optional(row.establishment_name),
    userId: row.user_id,
    userName: row.user_name,
    amount: Number(row.amount_micros) / SALE_DECIMAL_SCALE,
    paymentMethod: row.payment_method as CreditPayment["paymentMethod"],
    note: optional(row.note),
    createdAt: row.payment_date,
    voidedAt: optional(row.voided_at),
    voidedByUserId: optional(row.voided_by_user_id),
    voidedByUserName: optional(row.voided_by_user_name),
    voidReason: optional(row.void_reason),
  };
}

function adjustmentFromRow(row: AdjustmentRow): CreditAdjustment {
  return {
    ...compatibilityValue(row.compatibility_json),
    id: row.id,
    operationId: optional(row.operation_id),
    reverseOperationId: optional(row.reverse_operation_id),
    type: row.adjustment_type as CreditAdjustment["type"],
    sourceCreditNoteId: row.credit_note_id,
    sourceSaleId: row.sale_id,
    clientId: row.client_id,
    amount: Number(row.amount_micros) / SALE_DECIMAL_SCALE,
    state: row.status as CreditAdjustment["state"],
    appliedAt: optional(row.applied_at),
    reversedAt: optional(row.reversed_at),
    userId: row.user_id,
    reason: optional(row.reason),
  };
}

export function calculateCreditLedgerMetrics(
  payments: CreditPayment[],
  adjustments: CreditAdjustment[],
  sales: Sale[],
  clients: Client[],
): CreditLedgerMetrics {
  const preparedPayments = payments.map((source, sourceIndex) => ({
    source,
    record: canonicalCreditPayment(source),
    hash: "",
    sourceIndex,
  }));
  const preparedAdjustments = adjustments.map((source, sourceIndex) => ({
    source,
    record: canonicalCreditAdjustment(source),
    hash: "",
    sourceIndex,
  }));
  return {
    payments: paymentMetrics(preparedPayments, sales, clients),
    adjustments: adjustmentMetrics(
      preparedAdjustments, preparedPayments, sales, clients,
    ),
    balances: balanceMetrics(sales, clients, payments, adjustments),
  };
}

export class CreditLedgerRepository extends TenantRepository {
  constructor(context: TenantRepositoryContext) {
    super(context);
  }

  private async preparePayments(
    payments: CreditPayment[],
  ): Promise<PreparedPayment[]> {
    return Promise.all(payments.map(async (source, sourceIndex) => ({
      source,
      record: canonicalCreditPayment(source),
      hash: await hashCreditPayment(source),
      sourceIndex,
    })));
  }

  private async prepareAdjustments(
    adjustments: CreditAdjustment[],
  ): Promise<PreparedAdjustment[]> {
    return Promise.all(adjustments.map(async (source, sourceIndex) => ({
      source,
      record: canonicalCreditAdjustment(source),
      hash: await hashCreditAdjustment(source),
      sourceIndex,
    })));
  }

  private async hashRows(
    table: "credit_payments" | "credit_adjustments",
    database: SQLiteConnection,
  ): Promise<HashRow[]> {
    return database.getAllAsync<HashRow>(
      `SELECT id, source_index, record_hash FROM ${table}
       WHERE tenant_id = ? ORDER BY source_index ASC`,
      this.tenantId,
    );
  }

  async listPayments(query: CreditPaymentQuery = {}): Promise<CreditPayment[]> {
    const clauses = ["tenant_id = ?"];
    const values: Array<string | number> = [this.tenantId];
    const equal = (column: string, value: string | undefined) => {
      if (value === undefined) return;
      clauses.push(`${column} = ?`);
      values.push(value);
    };
    equal("sale_id", query.saleId);
    equal("client_id", query.clientId);
    equal("operation_id", query.operationId);
    equal("batch_id", query.batchId);
    equal("batch_operation_id", query.batchOperationId);
    equal("payment_method", query.paymentMethod);
    if (query.createdFrom) {
      clauses.push("payment_date >= ?");
      values.push(query.createdFrom);
    }
    if (query.createdTo) {
      clauses.push("payment_date <= ?");
      values.push(query.createdTo);
    }
    if (query.voided !== undefined) {
      clauses.push(query.voided ? "voided_at IS NOT NULL" : "voided_at IS NULL");
    }
    const rows = await this.database.getAllAsync<PaymentRow>(
      `SELECT id, source_index, operation_id, batch_id, batch_operation_id,
        batch_size, void_operation_id, sale_id, client_id, establishment,
        emission_point, establishment_name, user_id, user_name, amount_micros,
        payment_method, note, payment_date, voided_at, voided_by_user_id,
        voided_by_user_name, void_reason, compatibility_json
       FROM credit_payments
       WHERE ${clauses.join(" AND ")}
       ORDER BY source_index ASC`,
      ...values,
    );
    return rows.map(paymentFromRow);
  }

  async listAdjustments(
    query: CreditAdjustmentQuery = {},
  ): Promise<CreditAdjustment[]> {
    const clauses = ["tenant_id = ?"];
    const values: string[] = [this.tenantId];
    const equal = (column: string, value: string | undefined) => {
      if (value === undefined) return;
      clauses.push(`${column} = ?`);
      values.push(value);
    };
    equal("sale_id", query.saleId);
    equal("client_id", query.clientId);
    equal("credit_note_id", query.creditNoteId);
    equal("operation_id", query.operationId);
    equal("status", query.status);
    const rows = await this.database.getAllAsync<AdjustmentRow>(
      `SELECT id, source_index, operation_id, reverse_operation_id,
        adjustment_type, credit_note_id, sale_id, client_id, amount_micros,
        status, applied_at, reversed_at, user_id, reason, compatibility_json
       FROM credit_adjustments
       WHERE ${clauses.join(" AND ")}
       ORDER BY source_index ASC`,
      ...values,
    );
    return rows.map(adjustmentFromRow);
  }

  async migrateMirror(
    payments: CreditPayment[],
    adjustments: CreditAdjustment[],
    sales: Sale[],
    clients: Client[],
    receipt: CreditLedgerReceiptInput,
  ): Promise<CreditLedgerMigrationResult> {
    const startedAt = Date.now();
    const preparedPayments = await this.preparePayments(payments);
    const preparedAdjustments = await this.prepareAdjustments(adjustments);
    const paymentSummary = paymentMetrics(
      preparedPayments, sales, clients,
    );
    const adjustmentSummary = adjustmentMetrics(
      preparedAdjustments, preparedPayments, sales, clients,
    );
    const balanceSummary = balanceMetrics(
      sales, clients, payments, adjustments,
    );
    const differences: string[] = [];
    if (paymentSummary.duplicateOperationCount) {
      differences.push("DUPLICATE_PAYMENT_OPERATION");
    }
    if (paymentSummary.missingSaleCount) {
      differences.push("PAYMENT_SALE_MISSING");
    }
    if (paymentSummary.missingClientCount) {
      differences.push("PAYMENT_CLIENT_MISSING");
    }
    if (
      paymentSummary.partialBatchCount ||
      paymentSummary.duplicateBatchMemberCount
    ) {
      differences.push("PAYMENT_BATCH_INCOMPLETE");
    }
    if (
      adjustmentSummary.duplicateOperationCount ||
      adjustmentSummary.duplicateReverseOperationCount
    ) {
      differences.push("DUPLICATE_ADJUSTMENT_OPERATION");
    }
    if (adjustmentSummary.missingSaleCount) {
      differences.push("ADJUSTMENT_SALE_MISSING");
    }
    if (adjustmentSummary.missingClientCount) {
      differences.push("ADJUSTMENT_CLIENT_MISSING");
    }
    if (adjustmentSummary.missingCreditNoteCount) {
      differences.push("ADJUSTMENT_CREDIT_NOTE_MISSING");
    }
    if (balanceSummary.inconsistentBalanceCount) {
      differences.push("CREDIT_BALANCE_MISMATCH");
    }
    if (balanceSummary.negativeBalanceCount) {
      differences.push("NEGATIVE_CREDIT_BALANCE");
    }
    for (const { record } of preparedPayments) {
      if (record.amountMicros === null || record.amountMicros <= 0) {
        differences.push("INVALID_PAYMENT_AMOUNT");
        break;
      }
    }
    for (const { record } of preparedAdjustments) {
      if (record.amountMicros === null || record.amountMicros <= 0) {
        differences.push("INVALID_ADJUSTMENT_AMOUNT");
        break;
      }
    }
    if (differences.length) {
      throw new Error(`CREDIT_LEDGER_VALIDATION_FAILED:${differences.join(",")}`);
    }

    let comparedPaymentHashes = 0;
    let comparedAdjustmentHashes = 0;
    await this.database.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync(
        "DELETE FROM credit_payments WHERE tenant_id = ?",
        this.tenantId,
      );
      await transaction.runAsync(
        "DELETE FROM credit_adjustments WHERE tenant_id = ?",
        this.tenantId,
      );
      for (const item of preparedPayments) {
        const value = item.record;
        await transaction.runAsync(
          `INSERT INTO credit_payments (
            tenant_id, id, source_index, operation_id, batch_id,
            batch_operation_id, batch_size, void_operation_id, sale_id,
            client_id, establishment, emission_point, establishment_name,
            user_id, user_name, amount_micros, payment_method, note,
            payment_date, voided_at, voided_by_user_id, voided_by_user_name,
            void_reason, compatibility_json, record_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?)`,
          this.tenantId, value.id, item.sourceIndex, value.operationId,
          value.batchId, value.batchOperationId, value.batchSize,
          value.voidOperationId, value.saleId, value.clientId,
          value.establishment, value.emissionPoint, value.establishmentName,
          value.userId, value.userName, value.amountMicros,
          value.paymentMethod, value.note, value.paymentDate, value.voidedAt,
          value.voidedByUserId, value.voidedByUserName, value.voidReason,
          JSON.stringify(value.compatibility), item.hash,
        );
      }
      for (const item of preparedAdjustments) {
        const value = item.record;
        await transaction.runAsync(
          `INSERT INTO credit_adjustments (
            tenant_id, id, source_index, operation_id, reverse_operation_id,
            adjustment_type, credit_note_id, sale_id, client_id,
            amount_micros, status, applied_at, reversed_at, user_id, reason,
            compatibility_json, record_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          this.tenantId, value.id, item.sourceIndex, value.operationId,
          value.reverseOperationId, value.adjustmentType, value.creditNoteId,
          value.saleId, value.clientId, value.amountMicros, value.status,
          value.appliedAt, value.reversedAt, value.userId, value.reason,
          JSON.stringify(value.compatibility), item.hash,
        );
      }
      const paymentRows = await this.hashRows("credit_payments", transaction);
      const adjustmentRows = await this.hashRows(
        "credit_adjustments", transaction,
      );
      if (paymentRows.length !== preparedPayments.length) {
        throw new Error("PAYMENT_COUNT_MISMATCH");
      }
      if (adjustmentRows.length !== preparedAdjustments.length) {
        throw new Error("ADJUSTMENT_COUNT_MISMATCH");
      }
      preparedPayments.forEach((expected, index) => {
        const actual = paymentRows[index];
        if (
          !actual ||
          actual.id !== expected.record.id ||
          Number(actual.source_index) !== index ||
          actual.record_hash !== expected.hash
        ) {
          throw new Error(`PAYMENT_HASH_OR_ORDER_MISMATCH:${index}`);
        }
        comparedPaymentHashes += 1;
      });
      preparedAdjustments.forEach((expected, index) => {
        const actual = adjustmentRows[index];
        if (
          !actual ||
          actual.id !== expected.record.id ||
          Number(actual.source_index) !== index ||
          actual.record_hash !== expected.hash
        ) {
          throw new Error(`ADJUSTMENT_HASH_OR_ORDER_MISMATCH:${index}`);
        }
        comparedAdjustmentHashes += 1;
      });
      if (!(await receipt.confirmCanonical())) {
        throw new Error("STALE_SNAPSHOT_GENERATION");
      }
      const receipts = new CatalogValidationReceiptRepository({
        database: transaction,
        tenantId: this.tenantId,
      });
      await receipts.saveValidatedWithinTransaction(transaction, {
        catalogType: "credit_payments",
        snapshotGeneration: receipt.snapshotGeneration,
        sourceHash: receipt.creditPaymentsHash,
        rowCount: payments.length,
        schemaVersion: receipt.schemaVersion,
        validationDetails: {
          ...paymentSummary,
          balanceValidation: balanceSummary,
          pairedCatalog: "credit_adjustments",
        },
      });
      await receipts.saveValidatedWithinTransaction(transaction, {
        catalogType: "credit_adjustments",
        snapshotGeneration: receipt.snapshotGeneration,
        sourceHash: receipt.creditAdjustmentsHash,
        rowCount: adjustments.length,
        schemaVersion: receipt.schemaVersion,
        validationDetails: {
          ...adjustmentSummary,
          balanceValidation: balanceSummary,
          pairedCatalog: "credit_payments",
        },
      });
    });
    return {
      equal: true,
      paymentCount: payments.length,
      adjustmentCount: adjustments.length,
      comparedPaymentHashes,
      comparedAdjustmentHashes,
      paymentMetrics: paymentSummary,
      adjustmentMetrics: adjustmentSummary,
      balanceMetrics: balanceSummary,
      differences,
      durationMs: Date.now() - startedAt,
    };
  }
}
