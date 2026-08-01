jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: jest.fn(
    async (_algorithm: string, value: string) => `hash:${value}`,
  ),
}));

import type { InventoryMovement, Sale } from "../../../types";
import { InventoryMovementsRepository } from
  "../InventoryMovementsRepository";
import type {
  SQLiteBindValue,
  SQLiteConnection,
  SQLiteRunResult,
} from "../types";

type Row = Record<string, SQLiteBindValue>;

const columns = [
  "tenant_id", "id", "source_index", "product_id", "product_name",
  "movement_type", "quantity_micros", "stock_before_micros",
  "stock_after_micros", "reason", "reference", "sale_id",
  "inventory_operation_id", "inventory_operation_type", "user_id",
  "created_at", "compatibility_json", "record_hash",
];

class InventoryDatabase implements SQLiteConnection {
  rows: Row[] = [];
  receiptParams: SQLiteBindValue[] | null = null;
  corruptAfter = false;

  async execAsync(): Promise<void> {}

  async runAsync(
    source: string,
    ...params: SQLiteBindValue[]
  ): Promise<SQLiteRunResult> {
    if (source.startsWith("DELETE FROM inventory_movements")) {
      const tenant = String(params[0]);
      this.rows = this.rows.filter((row) => row.tenant_id !== tenant);
    } else if (source.includes("INSERT INTO inventory_movements")) {
      this.rows.push(Object.fromEntries(
        columns.map((column, index) => [column, params[index] ?? null]),
      ));
    } else if (source.includes("catalog_validation_receipts")) {
      this.receiptParams = params;
    }
    return { changes: 1, lastInsertRowId: 0 };
  }

  async getFirstAsync<T>(): Promise<T | null> {
    return null;
  }

  async getAllAsync<T>(
    _source: string,
    ...params: SQLiteBindValue[]
  ): Promise<T[]> {
    const tenant = String(params[0]);
    return this.rows.filter((row) => row.tenant_id === tenant)
      .sort((left, right) =>
        Number(left.source_index) - Number(right.source_index)
      )
      .map((row) => this.corruptAfter
        ? {
          ...row,
          stock_after_micros: Number(row.stock_after_micros) + 1,
        }
        : { ...row }) as T[];
  }

  async withExclusiveTransactionAsync(
    task: (transaction: SQLiteConnection) => Promise<void>,
  ): Promise<void> {
    const backup = this.rows.map((row) => ({ ...row }));
    try {
      await task(this);
    } catch (error) {
      this.rows = backup;
      throw error;
    }
  }

  async closeAsync(): Promise<void> {}
}

const sales: Sale[] = [{
  id: "sale-1",
  documentType: "factura",
  clientId: "client-1",
  userId: "user-1",
  createdAt: "2026-07-28T10:00:00.000Z",
  sequence: "1",
  accessKey: "",
  subtotal: 2,
  tax: 0,
  total: 2,
  paymentMethod: "01",
  status: "AUTORIZADA",
  items: [],
} as Sale];

const movements: InventoryMovement[] = [{
  id: "op-1:p1:APPLY",
  productId: "p1",
  productName: "Producto 1",
  type: "salida",
  quantity: 1.25,
  stockBefore: 10.5,
  stockAfter: 9.25,
  reason: "Venta",
  reference: "1",
  saleId: "sale-1",
  inventoryOperationId: "op-1",
  inventoryOperationType: "APPLY",
  userId: "user-1",
  createdAt: "2026-07-28T10:00:00.000Z",
}, {
  id: "op-1:p2:APPLY",
  productId: "p2",
  productName: "Producto 2",
  type: "salida",
  quantity: 2,
  stockBefore: 5,
  stockAfter: 3,
  reason: "Venta",
  saleId: "sale-1",
  inventoryOperationId: "op-1",
  inventoryOperationType: "APPLY",
  userId: "user-1",
  createdAt: "2026-07-28T10:00:00.000Z",
}, {
  id: "legacy-adjustment",
  productId: "p1",
  productName: "Producto 1",
  type: "ajuste",
  quantity: 3,
  stockBefore: 3,
  stockAfter: 6,
  reason: "Ajuste legacy",
  userId: "user-1",
  createdAt: "2026-07-28T11:00:00.000Z",
  legacyField: "preserved",
} as InventoryMovement];

const receipt = {
  snapshotGeneration: "generation-1",
  sourceHash: "inventory-hash",
  schemaVersion: 7,
  confirmCanonical: async () => true,
};

describe("InventoryMovementsRepository", () => {
  it("conserva orden, decimales, legacy y cardinalidad de operación", async () => {
    const database = new InventoryDatabase();
    const result = await new InventoryMovementsRepository({
      database,
      tenantId: "tenant-1",
    }).migrateMirror(movements, sales, [{
      id: "p1", code: "1", name: "P1", price: 1, ivaRate: 0, stock: 1,
    }, {
      id: "p2", code: "2", name: "P2", price: 1, ivaRate: 0, stock: 1,
    }], receipt);

    expect(result.equal).toBe(true);
    expect(result.comparedHashes).toBe(3);
    expect(result.metrics.operationCount).toBe(1);
    expect(result.metrics.operationsWithMultipleRows).toBe(1);
    expect(result.metrics.maxRowsPerOperation).toBe(2);
    expect(result.metrics.exitQuantityMicros).toBe(3_250_000);
    expect(result.metrics.exitStockDeltaMicros).toBe(-3_250_000);
    expect(result.metrics.positiveAdjustmentMicros).toBe(3_000_000);
    expect(result.metrics.costAvailability).toBe("UNAVAILABLE");
    expect(database.rows.map((row) => row.source_index)).toEqual([0, 1, 2]);
    await expect(new InventoryMovementsRepository({
      database,
      tenantId: "tenant-1",
    }).list()).resolves.toEqual(movements);
  });

  it("aísla empresas", async () => {
    const database = new InventoryDatabase();
    await new InventoryMovementsRepository({
      database, tenantId: "tenant-1",
    }).migrateMirror(movements, sales, [], receipt);
    await new InventoryMovementsRepository({
      database, tenantId: "tenant-2",
    }).migrateMirror(
      [{ ...movements[0]!, id: "tenant-2-row" }],
      sales,
      [],
      receipt,
    );
    expect(database.rows.filter((row) =>
      row.tenant_id === "tenant-1"
    )).toHaveLength(3);
    expect(database.rows.filter((row) =>
      row.tenant_id === "tenant-2"
    )).toHaveLength(1);
  });

  it("revierte completamente ante diferencia", async () => {
    const database = new InventoryDatabase();
    database.rows = [{
      tenant_id: "tenant-1",
      id: "previous",
      source_index: 0,
    }];
    database.corruptAfter = true;
    await expect(new InventoryMovementsRepository({
      database, tenantId: "tenant-1",
    }).migrateMirror(movements, sales, [], receipt))
      .rejects.toThrow("paridad");
    expect(database.rows).toEqual([{
      tenant_id: "tenant-1",
      id: "previous",
      source_index: 0,
    }]);
  });

  it("revierte si la generación dejó de ser canónica", async () => {
    const database = new InventoryDatabase();
    await expect(new InventoryMovementsRepository({
      database, tenantId: "tenant-1",
    }).migrateMirror(movements, sales, [], {
      ...receipt,
      confirmCanonical: async () => false,
    })).rejects.toThrow("STALE_SNAPSHOT_GENERATION");
    expect(database.rows).toHaveLength(0);
  });

  it("preserva campos ausentes de registros legacy sin convertirlos en cero", async () => {
    const database = new InventoryDatabase();
    const legacy = {
      id: "legacy-incomplete",
      productId: "deleted-product",
      productName: "Antiguo",
      type: "entrada",
      quantity: 1,
      reason: "Legacy",
      userId: "user-1",
      createdAt: "2025-01-01T00:00:00.000Z",
    } as InventoryMovement;
    const result = await new InventoryMovementsRepository({
      database, tenantId: "tenant-1",
    }).migrateMirror([legacy], [], [], receipt);
    expect(result.equal).toBe(true);
    expect(result.metrics.missingStockBefore).toBe(1);
    expect(result.metrics.missingStockAfter).toBe(1);
    expect(result.metrics.legacyIncompleteRows).toBe(1);
    expect(result.metrics.missingCurrentProductRows).toBe(1);
    expect(database.rows[0]?.stock_before_micros).toBeNull();
    expect(database.rows[0]?.stock_after_micros).toBeNull();
  });

  it("reconstruye contenido y consulta siempre dentro del tenant", async () => {
    const database = new InventoryDatabase();
    const repository = new InventoryMovementsRepository({
      database,
      tenantId: "tenant-1",
    });
    await repository.migrateMirror(movements, sales, [], receipt);
    const getAll = jest.spyOn(database, "getAllAsync");
    const result = await repository.list({
      productId: "p1",
      operationId: "op-1",
      saleId: "sale-1",
      createdFrom: "2026-07-01T00:00:00.000Z",
      createdTo: "2026-07-31T23:59:59.999Z",
      movementType: "salida",
      search: "producto",
    });
    expect(result[0]).toEqual(movements[0]);
    const call = getAll.mock.calls.at(-1);
    expect(String(call?.[0])).toContain("tenant_id = ?");
    expect(call?.slice(1)).toEqual([
      "tenant-1",
      "p1",
      "op-1",
      "sale-1",
      "2026-07-01T00:00:00.000Z",
      "2026-07-31T23:59:59.999Z",
      "salida",
      "%producto%",
      "%producto%",
      "%producto%",
      "%producto%",
    ]);
  });
});
