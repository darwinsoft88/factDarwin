jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: jest.fn(
    async (_algorithm: string, value: string) => `hash:${value}`,
  ),
}));

import type { Client, RemissionGuide, Sale } from "../../../types";
import { RemissionGuidesRepository } from "../RemissionGuidesRepository";
import type {
  SQLiteBindValue,
  SQLiteConnection,
  SQLiteRunResult,
} from "../types";

class GuideDatabase implements SQLiteConnection {
  guides: Array<{ id: string; index: number; hash: string }> = [];
  quantities: number[] = [];
  receipts = 0;

  async execAsync(): Promise<void> {}
  async runAsync(
    sql: string,
    ...params: SQLiteBindValue[]
  ): Promise<SQLiteRunResult> {
    if (sql.startsWith("DELETE FROM remission_guides")) {
      this.guides = [];
      this.quantities = [];
    } else if (sql.includes("INSERT INTO remission_guides (")) {
      this.guides.push({
        id: String(params[1]),
        index: Number(params[2]),
        hash: String(params[29]),
      });
    } else if (sql.includes("INSERT INTO remission_guide_items")) {
      this.quantities.push(Number(params[7]));
    } else if (sql.includes("catalog_validation_receipts")) {
      this.receipts += 1;
    }
    return { changes: 1, lastInsertRowId: 0 };
  }
  async getFirstAsync<T>(sql: string): Promise<T | null> {
    if (sql.includes("AS guide_count")) {
      return {
        guide_count: this.guides.length,
        line_count: this.quantities.length,
        quantity_micros: this.quantities.reduce((a, b) => a + b, 0),
      } as T;
    }
    if (sql.includes("COUNT(*)")) {
      return { count: this.guides.length } as T;
    }
    return null;
  }
  async getAllAsync<T>(sql: string): Promise<T[]> {
    if (!sql.includes("FROM remission_guides")) return [];
    return this.guides.map((guide) => ({
      id: guide.id,
      source_index: guide.index,
      record_hash: guide.hash,
    })) as T[];
  }
  async withExclusiveTransactionAsync(
    task: (transaction: SQLiteConnection) => Promise<void>,
  ): Promise<void> {
    const guides = this.guides.map((guide) => ({ ...guide }));
    const quantities = [...this.quantities];
    const receipts = this.receipts;
    try {
      await task(this);
    } catch (error) {
      this.guides = guides;
      this.quantities = quantities;
      this.receipts = receipts;
      throw error;
    }
  }
  async closeAsync(): Promise<void> {}
}

const guide: RemissionGuide = {
  id: "guide-1",
  sourceSaleId: "sale-1",
  clientId: "client-1",
  userId: "user-1",
  createdAt: "2026-07-29T10:00:00.000Z",
  sequence: "000000001",
  accessKey: "1234567890",
  status: "AUTORIZADA",
  transporterName: "TRANSPORTISTA",
  transporterIdentification: "1723772099",
  transporterIdentificationType: "05",
  plate: "ABC-123",
  startAddress: "ORIGEN",
  endAddress: "DESTINO",
  route: "RUTA",
  reason: "VENTA",
  startDate: "2026-07-29",
  endDate: "2026-07-29",
  authorizedXml: "<xml/>",
  items: [{
    productId: "product-1",
    code: "001",
    name: "Producto",
    quantity: 2,
    unitPrice: 5,
    discount: 0,
    ivaRate: 15,
  }],
};

describe("RemissionGuidesRepository", () => {
  it("migra cabecera, líneas, XML y recibo en una transacción", async () => {
    const database = new GuideDatabase();
    const result = await new RemissionGuidesRepository({
      database,
      tenantId: "tenant-1",
    }).migrateMirror(
      [guide],
      [{ id: "sale-1" }] as Sale[],
      [{ id: "client-1" }] as Client[],
      {
        snapshotGeneration: "generation-1",
        sourceHash: "guides-hash",
        schemaVersion: 10,
        confirmCanonical: async () => true,
      },
    );
    expect(result.equal).toBe(true);
    expect(result.comparedHashes).toBe(1);
    expect(result.metrics.lineCount).toBe(1);
    expect(result.metrics.quantityMicros).toBe(2_000_000);
    expect(result.metrics.authorizedXmlCount).toBe(1);
    expect(database.receipts).toBe(1);
  });

  it("revierte todo si la generación dejó de ser canónica", async () => {
    const database = new GuideDatabase();
    database.guides = [{ id: "previous", index: 0, hash: "previous" }];
    await expect(new RemissionGuidesRepository({
      database,
      tenantId: "tenant-1",
    }).migrateMirror(
      [guide], [{ id: "sale-1" }] as Sale[],
      [{ id: "client-1" }] as Client[],
      {
        snapshotGeneration: "generation-2",
        sourceHash: "guides-hash",
        schemaVersion: 10,
        confirmCanonical: async () => false,
      },
    )).rejects.toThrow("STALE_SNAPSHOT_GENERATION");
    expect(database.guides).toEqual([
      { id: "previous", index: 0, hash: "previous" },
    ]);
    expect(database.receipts).toBe(0);
  });
});
