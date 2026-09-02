jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: jest.fn(
    async (_algorithm: string, value: string) => `hash:${value}`,
  ),
}));

import type { PendingSyncItem } from "../../../types";
import { PendingSyncRepository } from "../PendingSyncRepository";
import type {
  SQLiteBindValue,
  SQLiteConnection,
  SQLiteRunResult,
} from "../types";

interface StoredOperation {
  tenantId: string;
  id: string;
  sourceIndex: number;
  requestId: string;
  createdAt: string;
  attempts: number;
  title: string;
  lastError: string | null;
  patchJson: string;
  hash: string;
}

class PendingSyncDatabase implements SQLiteConnection {
  operations: StoredOperation[] = [];
  receipts = 0;

  async execAsync(): Promise<void> {}
  async runAsync(
    sql: string,
    ...params: SQLiteBindValue[]
  ): Promise<SQLiteRunResult> {
    if (sql.startsWith("DELETE FROM pending_sync_operations")) {
      const tenantId = String(params[0]);
      this.operations = this.operations.filter(
        (operation) => operation.tenantId !== tenantId,
      );
    } else if (sql.includes("INSERT INTO pending_sync_operations")) {
      this.operations.push({
        tenantId: String(params[0]),
        id: String(params[1]),
        sourceIndex: Number(params[2]),
        requestId: String(params[3]),
        createdAt: String(params[4]),
        attempts: Number(params[5]),
        title: String(params[6]),
        lastError: params[7] === null ? null : String(params[7]),
        patchJson: String(params[8]),
        hash: String(params[9]),
      });
    } else if (sql.includes("catalog_validation_receipts")) {
      this.receipts += 1;
    }
    return { changes: 1, lastInsertRowId: 0 };
  }
  async getFirstAsync<T>(sql: string, ...params: SQLiteBindValue[]) {
    if (sql.includes("COUNT(*)")) {
      const tenantId = String(params[0]);
      return {
        count: this.operations.filter(
          (operation) => operation.tenantId === tenantId,
        ).length,
      } as T;
    }
    return null;
  }
  async getAllAsync<T>(sql: string, ...params: SQLiteBindValue[]) {
    if (!sql.includes("FROM pending_sync_operations")) return [];
    const tenantId = String(params[0]);
    return this.operations
      .filter((operation) => operation.tenantId === tenantId)
      .sort((left, right) => left.sourceIndex - right.sourceIndex)
      .map((operation) => ({
        id: operation.id,
        source_index: operation.sourceIndex,
        request_id: operation.requestId,
        created_at: operation.createdAt,
        attempts: operation.attempts,
        title: operation.title,
        last_error: operation.lastError,
        patch_json: operation.patchJson,
        record_hash: operation.hash,
      })) as T[];
  }
  async withExclusiveTransactionAsync(
    task: (transaction: SQLiteConnection) => Promise<void>,
  ): Promise<void> {
    const previous = this.operations.map((operation) => ({ ...operation }));
    const receipts = this.receipts;
    try {
      await task(this);
    } catch (error) {
      this.operations = previous;
      this.receipts = receipts;
      throw error;
    }
  }
  async closeAsync(): Promise<void> {}
}

function pending(
  id: string,
  requestId: string,
  attempts = 0,
): PendingSyncItem {
  return {
    id,
    createdAt: `2026-07-29T10:00:0${attempts}.000Z`,
    attempts,
    title: `Pendiente ${id}`,
    ...(attempts ? { lastError: "Sin conexión" } : {}),
    patch: { requestId, clients: [{ id: `client-${id}` }] },
  };
}

describe("PendingSyncRepository", () => {
  it("migra y valida orden FIFO, requestId, hashes y agregados", async () => {
    const database = new PendingSyncDatabase();
    const operations = [
      pending("first", "sync_first"),
      pending("second", "sync_second", 2),
    ];
    const result = await new PendingSyncRepository({
      database,
      tenantId: "tenant-1",
    }).migrateMirror(operations, {
      snapshotGeneration: "generation-1",
      sourceHash: "pending-hash",
      schemaVersion: 12,
      confirmCanonical: async () => true,
    });
    expect(result.equal).toBe(true);
    expect(result.comparedHashes).toBe(2);
    expect(result.metrics).toMatchObject({
      operationCount: 2,
      totalAttempts: 2,
      operationsWithError: 1,
      uniqueRequestIds: 2,
    });
    expect(await new PendingSyncRepository({
      database,
      tenantId: "tenant-1",
    }).list()).toEqual(operations);
    expect(database.receipts).toBe(1);
  });

  it("aísla las operaciones por tenant", async () => {
    const database = new PendingSyncDatabase();
    const firstRepository = new PendingSyncRepository({
      database,
      tenantId: "tenant-1",
    });
    const secondRepository = new PendingSyncRepository({
      database,
      tenantId: "tenant-2",
    });
    const receipt = {
      snapshotGeneration: "generation",
      sourceHash: "hash",
      schemaVersion: 12,
      confirmCanonical: async () => true,
    };
    await firstRepository.migrateMirror(
      [pending("first", "sync_first")],
      receipt,
    );
    await secondRepository.migrateMirror(
      [pending("second", "sync_second")],
      receipt,
    );
    expect((await firstRepository.list()).map(({ id }) => id))
      .toEqual(["first"]);
    expect((await secondRepository.list()).map(({ id }) => id))
      .toEqual(["second"]);
  });

  it("revierte por completo si cambia la generación canónica", async () => {
    const database = new PendingSyncDatabase();
    database.operations = [{
      tenantId: "tenant-1",
      id: "previous",
      sourceIndex: 0,
      requestId: "sync_previous",
      createdAt: "2026-07-28T10:00:00.000Z",
      attempts: 0,
      title: "Anterior",
      lastError: null,
      patchJson: JSON.stringify({ requestId: "sync_previous" }),
      hash: "previous-hash",
    }];
    await expect(new PendingSyncRepository({
      database,
      tenantId: "tenant-1",
    }).migrateMirror([pending("new", "sync_new")], {
      snapshotGeneration: "generation-2",
      sourceHash: "pending-hash",
      schemaVersion: 12,
      confirmCanonical: async () => false,
    })).rejects.toThrow("STALE_SNAPSHOT_GENERATION");
    expect(database.operations[0]?.id).toBe("previous");
    expect(database.receipts).toBe(0);
  });

  it("rechaza requestId duplicados sin tocar el espejo anterior", async () => {
    const database = new PendingSyncDatabase();
    database.operations = [{
      tenantId: "tenant-1",
      id: "previous",
      sourceIndex: 0,
      requestId: "sync_previous",
      createdAt: "2026-07-28T10:00:00.000Z",
      attempts: 0,
      title: "Anterior",
      lastError: null,
      patchJson: JSON.stringify({ requestId: "sync_previous" }),
      hash: "previous-hash",
    }];
    await expect(new PendingSyncRepository({
      database,
      tenantId: "tenant-1",
    }).migrateMirror([
      pending("first", "sync_duplicate"),
      pending("second", "sync_duplicate"),
    ], {
      snapshotGeneration: "generation-3",
      sourceHash: "pending-hash",
      schemaVersion: 12,
      confirmCanonical: async () => true,
    })).rejects.toThrow("PENDING_SYNC_DUPLICATE_REQUEST_ID");
    expect(database.operations[0]?.id).toBe("previous");
  });
});
