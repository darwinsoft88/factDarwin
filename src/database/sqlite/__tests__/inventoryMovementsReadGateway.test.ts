import type { InventoryMovement } from "../../../types";
import {
  readInventoryMovementsControlled,
  type InventoryMovementsFallbackReason,
} from "../inventoryMovementsReadGateway";
import type { InventoryMovementMetrics } from
  "../InventoryMovementsRepository";
import type { SQLiteConnection } from "../types";

const movement = {
  id: "movement-1",
  productId: "product-1",
  productName: "Producto",
  type: "salida",
  quantity: 1,
  stockBefore: 2,
  stockAfter: 1,
  reason: "Venta",
  saleId: "sale-1",
  inventoryOperationId: "operation-1",
  inventoryOperationType: "APPLY",
  userId: "user-1",
  createdAt: "2026-07-28T10:00:00.000Z",
} as InventoryMovement;

const metrics: InventoryMovementMetrics = {
  entryQuantityMicros: 0,
  exitQuantityMicros: 1_000_000,
  positiveAdjustmentMicros: 0,
  negativeAdjustmentMicros: 0,
  entryStockDeltaMicros: 0,
  exitStockDeltaMicros: -1_000_000,
  adjustmentStockDeltaMicros: 0,
  missingStockBefore: 0,
  missingStockAfter: 0,
  linkedSales: 0,
  linkedCreditNotes: 0,
  unknownSaleRelations: 1,
  rowsWithoutOperation: 0,
  operationCount: 1,
  operationsWithMultipleRows: 0,
  maxRowsPerOperation: 1,
  stockBeforeMicros: 2_000_000,
  stockAfterMicros: 1_000_000,
  negativeQuantityRows: 0,
  negativeStockRows: 0,
  legacyIncompleteRows: 0,
  missingCurrentProductRows: 1,
  quantityByProduct: { "product-1": 1_000_000 },
  operationRowCounts: { "operation-1": 1 },
  quantityByEstablishment: "UNAVAILABLE",
  costAvailability: "UNAVAILABLE",
  establishmentAvailability: "UNAVAILABLE",
  warehouseAvailability: "UNAVAILABLE",
};

function database(receiptOverrides: Record<string, unknown> = {}) {
  return {
    getAllAsync: jest.fn(async (sql: string) =>
      sql.includes("app_metadata")
        ? [
          { key: "tenant_id", value_json: JSON.stringify("tenant-1") },
          { key: "schema_version", value_json: JSON.stringify(11) },
          {
            key: "migration_state",
            value_json: JSON.stringify("products_validated"),
          },
          { key: "snapshot_hash", value_json: JSON.stringify("payload") },
        ]
        : []),
    getFirstAsync: jest.fn(async () => ({
      tenant_id: "tenant-1",
      catalog_type: "inventory_movements",
      snapshot_generation: "generation-1",
      source_hash: "inventory-hash",
      row_count: 1,
      status: "validated",
      schema_version: 11,
      validated_at: "2026-07-28T10:00:00.000Z",
      updated_at: "2026-07-28T10:00:00.000Z",
      last_error_code: null,
      last_error_detail: null,
      validation_details_json: JSON.stringify(metrics),
      ...receiptOverrides,
    })),
    runAsync: jest.fn(async () => ({ changes: 1, lastInsertRowId: 0 })),
  } as unknown as SQLiteConnection;
}

function descriptor(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 5,
    companyId: "tenant-1",
    issuerRuc: "1723772099001",
    snapshotGeneration: "generation-1",
    payloadHash: "payload",
    catalogHashes: {
      clients: "clients-hash",
      products: "products-hash",
      sales: "sales-hash",
      inventoryMovements: "inventory-hash",
    },
    createdAt: "2026-07-28T10:00:00.000Z",
    ...overrides,
  };
}

function repository(overrides: Record<string, unknown> = {}) {
  return {
    checkLightweightIntegrity: jest.fn(async () => ({
      valid: true,
      rowCount: 1,
      metrics,
      differences: [],
    })),
    list: jest.fn(async () => [movement]),
    ...overrides,
  };
}

describe("readInventoryMovementsControlled", () => {
  it("mantiene PWA siempre en el archivo", async () => {
    const result = await readInventoryMovementsControlled(
      "tenant-1", [movement], [], [], {}, {
        enabled: true,
        dependencies: { platform: "web" },
      },
    );
    expect(result.source).toBe("file");
    expect(result.diagnostic.reason).toBe("WEB_USES_FILE");
  });

  it("usa SQLite solo después de validar toda la compuerta", async () => {
    const reader = repository();
    const result = await readInventoryMovementsControlled(
      "tenant-1", [movement], [], [], { productId: "product-1" }, {
        enabled: true,
        dependencies: {
          platform: "android",
          openDatabase: async () => database(),
          readDescriptor: async () => descriptor(),
          createRepository: () => reader,
        },
      },
    );
    expect(result.source).toBe("sqlite");
    expect(reader.checkLightweightIntegrity).toHaveBeenCalledWith(
      1, metrics, [], [],
    );
    expect(reader.list).toHaveBeenCalledWith({ productId: "product-1" });
  });

  it("aplica la misma combinación de filtros al fallback por archivo", async () => {
    const second = {
      ...movement,
      id: "movement-2",
      productId: "product-2",
      createdAt: "2026-07-29T10:00:00.000Z",
    };
    const result = await readInventoryMovementsControlled(
      "tenant-1", [movement, second], [], [], {
        productId: "product-1",
        operationId: "operation-1",
        saleId: "sale-1",
        createdFrom: "2026-07-28T00:00:00.000Z",
        createdTo: "2026-07-28T23:59:59.999Z",
        movementType: "salida",
        search: "venta",
      }, {
        enabled: false,
        dependencies: { platform: "android" },
      },
    );
    expect(result.movements.map(({ id }) => id)).toEqual(["movement-1"]);
  });

  it.each([
    ["TENANT_MISMATCH", { companyId: "tenant-2" }, {}],
    ["SNAPSHOT_GENERATION_MISMATCH", {
      snapshotGeneration: "generation-2",
    }, {}],
    ["SOURCE_HASH_MISMATCH", {
      catalogHashes: {
        clients: "", products: "", sales: "",
        inventoryMovements: "different",
      },
    }, {}],
    ["MIRROR_DIRTY", {}, { status: "dirty" }],
  ] as Array<[
    InventoryMovementsFallbackReason,
    Record<string, unknown>,
    Record<string, unknown>,
  ]>)("hace fallback seguro por %s", async (
    reason,
    descriptorOverride,
    receiptOverride,
  ) => {
    const result = await readInventoryMovementsControlled(
      "tenant-1", [movement], [], [], {}, {
        enabled: true,
        dependencies: {
          platform: "android",
          openDatabase: async () => database(receiptOverride),
          readDescriptor: async () => descriptor(descriptorOverride),
        },
      },
    );
    expect(result.source).toBe("file");
    expect(result.diagnostic.reason).toBe(reason);
  });

  it("marca dirty y vuelve al archivo ante agregados distintos", async () => {
    const db = database();
    const result = await readInventoryMovementsControlled(
      "tenant-1", [movement], [], [], {}, {
        enabled: true,
        dependencies: {
          platform: "ios",
          openDatabase: async () => db,
          readDescriptor: async () => descriptor(),
          createRepository: () => repository({
            checkLightweightIntegrity: async () => ({
              valid: false,
              rowCount: 1,
              metrics,
              differences: ["AGGREGATE_MISMATCH:exitQuantityMicros"],
            }),
          }),
        },
      },
    );
    expect(result.source).toBe("file");
    expect(result.diagnostic.reason).toBe("AGGREGATE_MISMATCH");
    await Promise.resolve();
    expect(db.runAsync).toHaveBeenCalled();
  });

  it("un fallo de lectura SQLite nunca impide consultar el archivo", async () => {
    const result = await readInventoryMovementsControlled(
      "tenant-1", [movement], [], [], {}, {
        enabled: true,
        dependencies: {
          platform: "android",
          openDatabase: async () => database(),
          readDescriptor: async () => descriptor(),
          createRepository: () => repository({
            list: async () => {
              throw new Error("SQLITE_CORRUPT");
            },
          }),
        },
      },
    );
    expect(result.source).toBe("file");
    expect(result.movements).toEqual([movement]);
    expect(result.diagnostic.reason).toBe("SQLITE_READ_FAILED");
  });
});
