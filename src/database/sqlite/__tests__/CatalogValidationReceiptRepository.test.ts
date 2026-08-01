import {
  CatalogValidationReceiptRepository,
} from "../CatalogValidationReceiptRepository";
import type {
  SQLiteBindValue,
  SQLiteConnection,
  SQLiteRunResult,
} from "../types";

class ReceiptDatabase implements SQLiteConnection {
  rows = new Map<string, Record<string, unknown>>();

  async execAsync(): Promise<void> {}

  async runAsync(
    source: string,
    ...params: SQLiteBindValue[]
  ): Promise<SQLiteRunResult> {
    const key = `${params[0]}:${params[1]}`;
    if (source.includes("'validated'")) {
      this.rows.set(key, {
        tenant_id: params[0],
        catalog_type: params[1],
        snapshot_generation: params[2],
        source_hash: params[3],
        row_count: params[4],
        status: "validated",
        schema_version: params[5],
        validated_at: params[6],
        updated_at: params[7],
        last_error_code: null,
        last_error_detail: null,
      });
    } else {
      const previous = this.rows.get(key) ?? {};
      this.rows.set(key, {
        ...previous,
        tenant_id: params[0],
        catalog_type: params[1],
        snapshot_generation: previous.snapshot_generation ?? "",
        source_hash: previous.source_hash ?? "",
        row_count: previous.row_count ?? 0,
        status: "dirty",
        schema_version: previous.schema_version ?? 0,
        validated_at: null,
        updated_at: params[2],
        last_error_code: params[3],
        last_error_detail: params[4],
      });
    }
    return { changes: 1, lastInsertRowId: 0 };
  }

  async getFirstAsync<T>(
    _source: string,
    ...params: SQLiteBindValue[]
  ): Promise<T | null> {
    return (this.rows.get(`${params[0]}:${params[1]}`) as T) ?? null;
  }

  async getAllAsync<T>(
    _source: string,
    ...params: SQLiteBindValue[]
  ): Promise<T[]> {
    return [...this.rows.values()]
      .filter((row) => row.tenant_id === params[0]) as T[];
  }

  async withExclusiveTransactionAsync(
    task: (transaction: SQLiteConnection) => Promise<void>,
  ): Promise<void> {
    await task(this);
  }

  async closeAsync(): Promise<void> {}
}

describe("CatalogValidationReceiptRepository", () => {
  it("aísla recibos por tenant y catálogo y conserva la generación", async () => {
    const database = new ReceiptDatabase();
    const first = new CatalogValidationReceiptRepository({
      database,
      tenantId: "company-1",
    });
    const second = new CatalogValidationReceiptRepository({
      database,
      tenantId: "company-2",
    });

    await database.withExclusiveTransactionAsync((transaction) =>
      first.saveValidatedWithinTransaction(transaction, {
        catalogType: "clients",
        snapshotGeneration: "generation-2",
        sourceHash: "clients-hash-2",
        rowCount: 3,
        schemaVersion: 4,
      }));
    await database.withExclusiveTransactionAsync((transaction) =>
      second.saveValidatedWithinTransaction(transaction, {
        catalogType: "clients",
        snapshotGeneration: "generation-other",
        sourceHash: "other",
        rowCount: 1,
        schemaVersion: 4,
      }));

    await expect(first.read("clients")).resolves.toMatchObject({
      tenantId: "company-1",
      snapshotGeneration: "generation-2",
      sourceHash: "clients-hash-2",
      status: "validated",
    });
    await expect(first.readAll()).resolves.toHaveLength(1);
  });

  it("marca dirty sin borrar la identidad de la última fuente validada", async () => {
    const database = new ReceiptDatabase();
    const repository = new CatalogValidationReceiptRepository({
      database,
      tenantId: "company-1",
    });
    await database.withExclusiveTransactionAsync((transaction) =>
      repository.saveValidatedWithinTransaction(transaction, {
        catalogType: "products",
        snapshotGeneration: "generation-1",
        sourceHash: "products-hash",
        rowCount: 8,
        schemaVersion: 4,
      }));

    await repository.markDirty(
      "products",
      "SQLITE_MIRROR_UPDATE_FAILED",
      "fallo simulado",
    );

    await expect(repository.read("products")).resolves.toMatchObject({
      snapshotGeneration: "generation-1",
      sourceHash: "products-hash",
      status: "dirty",
      lastErrorCode: "SQLITE_MIRROR_UPDATE_FAILED",
    });
  });
});
