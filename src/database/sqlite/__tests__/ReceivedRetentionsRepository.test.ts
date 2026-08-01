jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: jest.fn(
    async (_algorithm: string, value: string) => `hash:${value}`,
  ),
}));

import type { Client, ReceivedRetention, Sale } from "../../../types";
import { ReceivedRetentionsRepository } from
  "../ReceivedRetentionsRepository";
import type {
  SQLiteBindValue,
  SQLiteConnection,
  SQLiteRunResult,
} from "../types";

type Row = Record<string, SQLiteBindValue>;

const columns = [
  "tenant_id", "id", "source_index", "sale_id", "client_id", "user_id",
  "created_at", "received_at", "document_number", "authorization_number",
  "tax_type", "retention_code", "base_micros", "percentage_micros",
  "amount_micros", "notes", "compatibility_json", "record_hash",
];

class RetentionsDatabase implements SQLiteConnection {
  rows: Row[] = [];
  receipts: SQLiteBindValue[][] = [];
  corruptHash = false;

  async execAsync(): Promise<void> {}

  async runAsync(
    source: string,
    ...params: SQLiteBindValue[]
  ): Promise<SQLiteRunResult> {
    if (source.startsWith("DELETE FROM received_retentions")) {
      const tenant = String(params[0]);
      this.rows = this.rows.filter(({ tenant_id }) => tenant_id !== tenant);
    } else if (source.includes("INSERT INTO received_retentions")) {
      this.rows.push(Object.fromEntries(
        columns.map((column, index) => [column, params[index] ?? null]),
      ));
    } else if (source.includes("catalog_validation_receipts")) {
      this.receipts.push(params);
    }
    return { changes: 1, lastInsertRowId: 0 };
  }

  async getFirstAsync<T>(
    source: string,
    ...params: SQLiteBindValue[]
  ): Promise<T | null> {
    if (source.includes("SUM(base_micros)")) {
      const tenant = String(params[0]);
      const rows = this.rows.filter(({ tenant_id }) => tenant_id === tenant);
      return {
        row_count: rows.length,
        total_base_micros: rows.reduce(
          (sum, row) => sum + Number(row.base_micros ?? 0), 0,
        ),
        total_percentage_micros: rows.reduce(
          (sum, row) => sum + Number(row.percentage_micros ?? 0), 0,
        ),
        total_amount_micros: rows.reduce(
          (sum, row) => sum + Number(row.amount_micros ?? 0), 0,
        ),
      } as T;
    }
    if (source.includes("COUNT(*)")) {
      const tenant = String(params[0]);
      return {
        count: this.rows.filter(({ tenant_id }) => tenant_id === tenant).length,
      } as T;
    }
    return null;
  }

  async getAllAsync<T>(
    source: string,
    ...params: SQLiteBindValue[]
  ): Promise<T[]> {
    if (!source.includes("FROM received_retentions")) return [];
    const tenant = String(params[0]);
    return this.rows
      .filter(({ tenant_id }) => tenant_id === tenant)
      .sort((a, b) => Number(a.source_index) - Number(b.source_index))
      .map((row, index) => ({
        id: row.id,
        source_index: row.source_index,
        record_hash: this.corruptHash && index === 0
          ? "corrupt"
          : row.record_hash,
      })) as T[];
  }

  async withExclusiveTransactionAsync(
    task: (transaction: SQLiteConnection) => Promise<void>,
  ): Promise<void> {
    const rows = this.rows.map((row) => ({ ...row }));
    const receipts = this.receipts.map((row) => [...row]);
    try {
      await task(this);
    } catch (error) {
      this.rows = rows;
      this.receipts = receipts;
      throw error;
    }
  }

  async closeAsync(): Promise<void> {}
}

const retention: ReceivedRetention = {
  id: "ret-1",
  saleId: "sale-1",
  clientId: "client-1",
  userId: "user-1",
  createdAt: "2026-07-29T10:00:00.000Z",
  receivedAt: "2026-07-29",
  documentNumber: "001-001-000000001",
  authorizationNumber: "AUTH-1",
  taxType: "RENTA",
  code: "303",
  base: 100,
  percentage: 2,
  amount: 2,
};

const sales = [{ id: "sale-1" }] as Sale[];
const clients = [{ id: "client-1" }] as Client[];

describe("ReceivedRetentionsRepository", () => {
  it("migra, compara hashes, agregados y crea el recibo v9", async () => {
    const database = new RetentionsDatabase();
    const result = await new ReceivedRetentionsRepository({
      database,
      tenantId: "company-a",
    }).migrateMirror([retention], sales, clients, {
      snapshotGeneration: "generation-1",
      sourceHash: "catalog-hash",
      schemaVersion: 9,
      confirmCanonical: async () => true,
    });

    expect(result.equal).toBe(true);
    expect(result.comparedHashes).toBe(1);
    expect(result.metrics.totalAmountMicros).toBe(2_000_000);
    expect(result.metrics.missingSaleCount).toBe(0);
    expect(database.rows).toHaveLength(1);
    expect(database.receipts).toHaveLength(1);
  });

  it("hace rollback completo si el hash no coincide", async () => {
    const database = new RetentionsDatabase();
    database.rows = [{ tenant_id: "company-a", id: "previous" }];
    database.corruptHash = true;
    await expect(new ReceivedRetentionsRepository({
      database,
      tenantId: "company-a",
    }).migrateMirror([retention], sales, clients, {
      snapshotGeneration: "generation-2",
      sourceHash: "catalog-hash",
      schemaVersion: 9,
      confirmCanonical: async () => true,
    })).rejects.toThrow("RECEIVED_RETENTION_HASH_OR_ORDER_MISMATCH");
    expect(database.rows).toEqual([
      { tenant_id: "company-a", id: "previous" },
    ]);
    expect(database.receipts).toHaveLength(0);
  });

  it("aísla conteos por tenant", async () => {
    const database = new RetentionsDatabase();
    database.rows = [
      { tenant_id: "company-a", id: "a" },
      { tenant_id: "company-b", id: "b" },
    ];
    await expect(new ReceivedRetentionsRepository({
      database,
      tenantId: "company-a",
    }).count()).resolves.toBe(1);
  });
});
