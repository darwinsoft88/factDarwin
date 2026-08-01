import type { PendingSyncItem } from "../../types";
import { CatalogValidationReceiptRepository } from
  "./CatalogValidationReceiptRepository";
import {
  canonicalPendingSyncItem,
  hashPendingSyncItem,
} from "./pendingSyncRecord";
import {
  TenantRepository,
  type TenantRepositoryContext,
} from "./repository";

interface ReceiptInput {
  snapshotGeneration: string;
  sourceHash: string;
  schemaVersion: number;
  confirmCanonical: () => Promise<boolean>;
}

export interface PendingSyncMetrics {
  operationCount: number;
  totalAttempts: number;
  operationsWithError: number;
  uniqueRequestIds: number;
  patchBytes: number;
}

interface PendingSyncRow {
  id: string;
  source_index: number;
  request_id: string;
  created_at: string;
  attempts: number;
  title: string;
  last_error: string | null;
  patch_json: string;
  record_hash: string;
}

export class PendingSyncRepository extends TenantRepository {
  constructor(context: TenantRepositoryContext) {
    super(context);
  }

  async count(): Promise<number> {
    const row = await this.database.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM pending_sync_operations
       WHERE tenant_id = ?`,
      this.tenantId,
    );
    return Number(row?.count ?? 0);
  }

  async list(): Promise<PendingSyncItem[]> {
    const rows = await this.database.getAllAsync<PendingSyncRow>(
      `SELECT id, source_index, request_id, created_at, attempts, title,
        last_error, patch_json, record_hash
       FROM pending_sync_operations
       WHERE tenant_id = ?
       ORDER BY source_index ASC`,
      this.tenantId,
    );
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      attempts: Number(row.attempts),
      title: row.title,
      ...(row.last_error === null ? {} : { lastError: row.last_error }),
      patch: JSON.parse(row.patch_json) as unknown,
    }));
  }

  async migrateMirror(
    operations: PendingSyncItem[],
    receipt: ReceiptInput,
  ) {
    const startedAt = Date.now();
    const prepared = await Promise.all(operations.map(
      async (operation, index) => {
        const value = canonicalPendingSyncItem(operation);
        if (
          !value.id ||
          !value.createdAt ||
          !value.title ||
          !Number.isInteger(value.attempts) ||
          value.attempts < 0 ||
          !value.requestId
        ) {
          throw new Error(`PENDING_SYNC_INVALID_MODELED_DATA:${index}`);
        }
        const patchJson = JSON.stringify(operation.patch);
        return {
          index,
          value,
          patchJson,
          hash: await hashPendingSyncItem(operation),
        };
      },
    ));
    const requestIds = new Set<string>();
    prepared.forEach(({ value }, index) => {
      if (requestIds.has(value.requestId as string)) {
        throw new Error(`PENDING_SYNC_DUPLICATE_REQUEST_ID:${index}`);
      }
      requestIds.add(value.requestId as string);
    });
    const metrics: PendingSyncMetrics = {
      operationCount: prepared.length,
      totalAttempts: prepared.reduce(
        (sum, item) => sum + item.value.attempts, 0,
      ),
      operationsWithError: prepared.filter(
        ({ value }) => Boolean(value.lastError),
      ).length,
      uniqueRequestIds: requestIds.size,
      patchBytes: prepared.reduce(
        (sum, item) => sum + item.patchJson.length, 0,
      ),
    };
    let comparedHashes = 0;
    await this.database.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync(
        "DELETE FROM pending_sync_operations WHERE tenant_id = ?",
        this.tenantId,
      );
      for (const item of prepared) {
        await transaction.runAsync(
          `INSERT INTO pending_sync_operations (
            tenant_id, id, source_index, request_id, created_at, attempts,
            title, last_error, patch_json, record_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          this.tenantId,
          item.value.id,
          item.index,
          item.value.requestId,
          item.value.createdAt,
          item.value.attempts,
          item.value.title,
          item.value.lastError,
          item.patchJson,
          item.hash,
        );
      }
      const rows = await transaction.getAllAsync<{
        id: string;
        source_index: number;
        request_id: string;
        attempts: number;
        patch_json: string;
        record_hash: string;
      }>(
        `SELECT id, source_index, request_id, attempts, patch_json, record_hash
         FROM pending_sync_operations
         WHERE tenant_id = ?
         ORDER BY source_index ASC`,
        this.tenantId,
      );
      if (rows.length !== prepared.length) {
        throw new Error("PENDING_SYNC_COUNT_MISMATCH");
      }
      let actualAttempts = 0;
      let actualPatchBytes = 0;
      prepared.forEach((expected, index) => {
        const actual = rows[index];
        if (
          !actual ||
          actual.id !== expected.value.id ||
          Number(actual.source_index) !== index ||
          actual.request_id !== expected.value.requestId ||
          actual.record_hash !== expected.hash ||
          actual.patch_json !== expected.patchJson
        ) {
          throw new Error(`PENDING_SYNC_HASH_OR_ORDER_MISMATCH:${index}`);
        }
        actualAttempts += Number(actual.attempts);
        actualPatchBytes += actual.patch_json.length;
        comparedHashes += 1;
      });
      if (
        actualAttempts !== metrics.totalAttempts ||
        actualPatchBytes !== metrics.patchBytes
      ) {
        throw new Error("PENDING_SYNC_AGGREGATE_MISMATCH");
      }
      if (!(await receipt.confirmCanonical())) {
        throw new Error("STALE_SNAPSHOT_GENERATION");
      }
      await new CatalogValidationReceiptRepository({
        database: transaction,
        tenantId: this.tenantId,
      }).saveValidatedWithinTransaction(transaction, {
        catalogType: "pending_sync_operations",
        snapshotGeneration: receipt.snapshotGeneration,
        sourceHash: receipt.sourceHash,
        rowCount: operations.length,
        schemaVersion: receipt.schemaVersion,
        validationDetails: { ...metrics },
      });
    });
    return {
      equal: true as const,
      rowCount: operations.length,
      comparedHashes,
      metrics,
      durationMs: Date.now() - startedAt,
    };
  }
}
