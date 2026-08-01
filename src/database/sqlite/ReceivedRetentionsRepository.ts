import type { Client, ReceivedRetention, Sale } from "../../types";
import { CatalogValidationReceiptRepository } from
  "./CatalogValidationReceiptRepository";
import {
  canonicalReceivedRetention,
  hashReceivedRetention,
} from "./receivedRetentionRecord";
import {
  TenantRepository,
  type TenantRepositoryContext,
} from "./repository";
import type { SQLiteConnection } from "./types";

interface ReceiptInput {
  snapshotGeneration: string;
  sourceHash: string;
  schemaVersion: number;
  confirmCanonical: () => Promise<boolean>;
}

interface HashRow {
  id: string;
  source_index: number;
  record_hash: string;
}

interface AggregateRow {
  row_count: number;
  total_base_micros: number;
  total_percentage_micros: number;
  total_amount_micros: number;
}

interface RetentionRow {
  id: string;
  sale_id: string;
  client_id: string;
  user_id: string;
  created_at: string;
  received_at: string;
  document_number: string;
  authorization_number: string | null;
  tax_type: ReceivedRetention["taxType"];
  retention_code: string | null;
  base_micros: number;
  percentage_micros: number;
  amount_micros: number;
  notes: string | null;
  compatibility_json: string;
}

export interface ReceivedRetentionMetrics {
  totalBaseMicros: number;
  totalPercentageMicros: number;
  totalAmountMicros: number;
  missingSaleCount: number;
  missingClientCount: number;
  missingDocumentCount: number;
  duplicateDocumentCount: number;
  byTaxType: Record<string, { count: number; amountMicros: number }>;
  byCode: Record<string, { count: number; amountMicros: number }>;
}

export interface ReceivedRetentionsMigrationResult {
  equal: true;
  rowCount: number;
  comparedHashes: number;
  metrics: ReceivedRetentionMetrics;
  durationMs: number;
}

export function calculateReceivedRetentionMetrics(
  retentions: ReceivedRetention[],
  sales: Sale[],
  clients: Client[],
): ReceivedRetentionMetrics {
  const saleIds = new Set(sales.map(({ id }) => id));
  const clientIds = new Set(clients.map(({ id }) => id));
  const documents = new Map<string, number>();
  const result: ReceivedRetentionMetrics = {
    totalBaseMicros: 0,
    totalPercentageMicros: 0,
    totalAmountMicros: 0,
    missingSaleCount: 0,
    missingClientCount: 0,
    missingDocumentCount: 0,
    duplicateDocumentCount: 0,
    byTaxType: {},
    byCode: {},
  };
  for (const retention of retentions) {
    const value = canonicalReceivedRetention(retention);
    result.totalBaseMicros += value.baseMicros ?? 0;
    result.totalPercentageMicros += value.percentageMicros ?? 0;
    result.totalAmountMicros += value.amountMicros ?? 0;
    if (!saleIds.has(value.saleId)) result.missingSaleCount += 1;
    if (!clientIds.has(value.clientId)) result.missingClientCount += 1;
    if (!value.documentNumber) result.missingDocumentCount += 1;
    else documents.set(
      value.documentNumber,
      (documents.get(value.documentNumber) ?? 0) + 1,
    );
    const tax = value.taxType || "UNAVAILABLE";
    const code = value.code || "UNAVAILABLE";
    result.byTaxType[tax] ??= { count: 0, amountMicros: 0 };
    result.byTaxType[tax].count += 1;
    result.byTaxType[tax].amountMicros += value.amountMicros ?? 0;
    result.byCode[code] ??= { count: 0, amountMicros: 0 };
    result.byCode[code].count += 1;
    result.byCode[code].amountMicros += value.amountMicros ?? 0;
  }
  result.duplicateDocumentCount = [...documents.values()]
    .filter((count) => count > 1)
    .reduce((sum, count) => sum + count, 0);
  return result;
}

export class ReceivedRetentionsRepository extends TenantRepository {
  constructor(context: TenantRepositoryContext) {
    super(context);
  }

  private async hashRows(
    database: SQLiteConnection = this.database,
  ): Promise<HashRow[]> {
    return database.getAllAsync<HashRow>(
      `SELECT id, source_index, record_hash
       FROM received_retentions
       WHERE tenant_id = ?
       ORDER BY source_index ASC`,
      this.tenantId,
    );
  }

  async count(): Promise<number> {
    const row = await this.database.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM received_retentions WHERE tenant_id = ?",
      this.tenantId,
    );
    return Number(row?.count ?? 0);
  }

  async list(): Promise<ReceivedRetention[]> {
    const rows = await this.database.getAllAsync<RetentionRow>(
      `SELECT id, sale_id, client_id, user_id, created_at, received_at,
        document_number, authorization_number, tax_type, retention_code,
        base_micros, percentage_micros, amount_micros, notes,
        compatibility_json
       FROM received_retentions
       WHERE tenant_id = ?
       ORDER BY source_index ASC`,
      this.tenantId,
    );
    return rows.map((row) => ({
      ...(JSON.parse(row.compatibility_json || "{}") as
        Record<string, unknown>),
      id: row.id,
      saleId: row.sale_id,
      clientId: row.client_id,
      userId: row.user_id,
      createdAt: row.created_at,
      receivedAt: row.received_at,
      documentNumber: row.document_number,
      ...(row.authorization_number === null
        ? {} : { authorizationNumber: row.authorization_number }),
      taxType: row.tax_type,
      ...(row.retention_code === null ? {} : { code: row.retention_code }),
      base: Number(row.base_micros) / 1_000_000,
      percentage: Number(row.percentage_micros) / 1_000_000,
      amount: Number(row.amount_micros) / 1_000_000,
      ...(row.notes === null ? {} : { notes: row.notes }),
    } as ReceivedRetention));
  }

  async migrateMirror(
    retentions: ReceivedRetention[],
    sales: Sale[],
    clients: Client[],
    receipt: ReceiptInput,
  ): Promise<ReceivedRetentionsMigrationResult> {
    const startedAt = Date.now();
    const prepared = await Promise.all(retentions.map(async (retention, index) => ({
      sourceIndex: index,
      value: canonicalReceivedRetention(retention),
      hash: await hashReceivedRetention(retention),
    })));
    const summary = calculateReceivedRetentionMetrics(
      retentions, sales, clients,
    );
    for (const { value } of prepared) {
      if (
        !value.id || value.baseMicros === null ||
        value.percentageMicros === null || value.amountMicros === null
      ) {
        throw new Error("RECEIVED_RETENTION_INVALID_MODELED_DATA");
      }
    }
    let comparedHashes = 0;
    await this.database.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync(
        "DELETE FROM received_retentions WHERE tenant_id = ?",
        this.tenantId,
      );
      for (const item of prepared) {
        const value = item.value;
        await transaction.runAsync(
          `INSERT INTO received_retentions (
            tenant_id, id, source_index, sale_id, client_id, user_id,
            created_at, received_at, document_number, authorization_number,
            tax_type, retention_code, base_micros, percentage_micros,
            amount_micros, notes, compatibility_json, record_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          this.tenantId, value.id, item.sourceIndex, value.saleId,
          value.clientId, value.userId, value.createdAt, value.receivedAt,
          value.documentNumber, value.authorizationNumber, value.taxType,
          value.code, value.baseMicros, value.percentageMicros,
          value.amountMicros, value.notes, JSON.stringify(value.compatibility),
          item.hash,
        );
      }
      const rows = await this.hashRows(transaction);
      if (rows.length !== prepared.length) {
        throw new Error("RECEIVED_RETENTION_COUNT_MISMATCH");
      }
      prepared.forEach((expected, index) => {
        const actual = rows[index];
        if (
          !actual ||
          actual.id !== expected.value.id ||
          Number(actual.source_index) !== index ||
          actual.record_hash !== expected.hash
        ) {
          throw new Error(`RECEIVED_RETENTION_HASH_OR_ORDER_MISMATCH:${index}`);
        }
        comparedHashes += 1;
      });
      const aggregate = await transaction.getFirstAsync<AggregateRow>(
        `SELECT COUNT(*) AS row_count,
          COALESCE(SUM(base_micros), 0) AS total_base_micros,
          COALESCE(SUM(percentage_micros), 0) AS total_percentage_micros,
          COALESCE(SUM(amount_micros), 0) AS total_amount_micros
         FROM received_retentions
         WHERE tenant_id = ?`,
        this.tenantId,
      );
      if (
        Number(aggregate?.row_count ?? 0) !== retentions.length ||
        Number(aggregate?.total_base_micros ?? 0) !==
          summary.totalBaseMicros ||
        Number(aggregate?.total_percentage_micros ?? 0) !==
          summary.totalPercentageMicros ||
        Number(aggregate?.total_amount_micros ?? 0) !==
          summary.totalAmountMicros
      ) {
        throw new Error("RECEIVED_RETENTION_AGGREGATE_MISMATCH");
      }
      if (!(await receipt.confirmCanonical())) {
        throw new Error("STALE_SNAPSHOT_GENERATION");
      }
      await new CatalogValidationReceiptRepository({
        database: transaction,
        tenantId: this.tenantId,
      }).saveValidatedWithinTransaction(transaction, {
        catalogType: "received_retentions",
        snapshotGeneration: receipt.snapshotGeneration,
        sourceHash: receipt.sourceHash,
        rowCount: retentions.length,
        schemaVersion: receipt.schemaVersion,
        validationDetails: { ...summary },
      });
    });
    return {
      equal: true,
      rowCount: retentions.length,
      comparedHashes,
      metrics: summary,
      durationMs: Date.now() - startedAt,
    };
  }
}
