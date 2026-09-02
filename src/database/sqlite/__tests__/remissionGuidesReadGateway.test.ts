import type { RemissionGuide } from "../../../types";
import { readRemissionGuidesControlled } from
  "../remissionGuidesReadGateway";
import type { SQLiteConnection, SQLiteRunResult } from "../types";

const guide: RemissionGuide = {
  id: "guide-1",
  sourceSaleId: "sale-1",
  clientId: "client-1",
  userId: "user-1",
  createdAt: "2026-07-29",
  sequence: "000000001",
  accessKey: "123",
  status: "AUTORIZADA",
  transporterName: "Transportista",
  transporterIdentification: "1723772099",
  transporterIdentificationType: "05",
  plate: "ABC-123",
  startAddress: "Origen",
  endAddress: "Destino",
  route: "Ruta",
  reason: "Venta",
  startDate: "2026-07-29",
  endDate: "2026-07-29",
  items: [{
    productId: "product-1",
    code: "001",
    name: "Producto",
    quantity: 1,
    unitPrice: 1,
    discount: 0,
    ivaRate: 15,
  }],
};

function database(options: {
  dirty?: boolean; generation?: string; count?: number;
} = {}): SQLiteConnection {
  return {
    execAsync: async () => undefined,
    runAsync: async (): Promise<SQLiteRunResult> => ({
      changes: 1, lastInsertRowId: 0,
    }),
    getFirstAsync: async <T>(sql: string) => sql.includes(
      "catalog_validation_receipts",
    ) ? {
        tenant_id: "tenant-1",
        catalog_type: "remission_guides",
        snapshot_generation: options.generation ?? "generation-1",
        source_hash: "guides-hash",
        row_count: options.count ?? 1,
        status: options.dirty ? "dirty" : "validated",
        schema_version: 12,
        validated_at: "2026-07-29",
        updated_at: "2026-07-29",
        last_error_code: null,
        last_error_detail: null,
        validation_details_json: "{}",
      } as T : null,
    getAllAsync: async <T>(sql: string) => sql.includes("app_metadata")
      ? [
          { key: "tenant_id", value_json: JSON.stringify("tenant-1") },
          { key: "schema_version", value_json: JSON.stringify(12) },
          { key: "migration_state", value_json: JSON.stringify("not_started") },
          { key: "snapshot_hash", value_json: JSON.stringify("payload") },
        ] as T[]
      : [],
    withExclusiveTransactionAsync: async (task) => task(database(options)),
    closeAsync: async () => undefined,
  };
}

function dependencies(
  sqliteGuides: RemissionGuide[] = [guide],
  db = database(),
) {
  return {
    platform: "android",
    openDatabase: async () => db,
    readDescriptor: async () => ({
      schemaVersion: 6,
      companyId: "tenant-1",
      issuerRuc: "1723772099001",
      snapshotGeneration: "generation-1",
      payloadHash: "payload",
      catalogHashes: {
        clients: "clients", products: "products", sales: "sales",
        inventoryMovements: "movements", creditPayments: "payments",
        creditAdjustments: "adjustments",
        receivedRetentions: "retentions", guides: "guides-hash",
      },
      createdAt: "2026-07-29",
    }),
    createRepository: () => ({ list: async () => sqliteGuides }),
  };
}

describe("readRemissionGuidesControlled", () => {
  it("usa SQLite cuando toda la compuerta coincide", async () => {
    const result = await readRemissionGuidesControlled(
      "tenant-1", [guide],
      { enabled: true, dependencies: dependencies() },
    );
    expect(result.source).toBe("sqlite");
    expect(result.guides).toEqual([guide]);
  });

  it("mantiene PWA en el archivo", async () => {
    const deps = dependencies();
    const result = await readRemissionGuidesControlled(
      "tenant-1", [guide],
      { enabled: true, dependencies: { ...deps, platform: "web" } },
    );
    expect(result.diagnostic.reason).toBe("WEB_USES_FILE");
  });

  it("vuelve al archivo ante recibo dirty o generación anterior", async () => {
    const dirty = await readRemissionGuidesControlled(
      "tenant-1", [guide],
      {
        enabled: true,
        dependencies: dependencies([guide], database({ dirty: true })),
      },
    );
    expect(dirty.diagnostic.reason).toBe("MIRROR_DIRTY");
    const stale = await readRemissionGuidesControlled(
      "tenant-1", [guide],
      {
        enabled: true,
        dependencies: dependencies(
          [guide], database({ generation: "old" }),
        ),
      },
    );
    expect(stale.diagnostic.reason).toBe("SNAPSHOT_GENERATION_MISMATCH");
  });

  it("nunca mezcla fuentes si una guía difiere", async () => {
    const result = await readRemissionGuidesControlled(
      "tenant-1", [guide],
      {
        enabled: true,
        dependencies: dependencies([{ ...guide, plate: "XXX-999" }]),
      },
    );
    expect(result.source).toBe("file");
    expect(result.guides).toEqual([guide]);
    expect(result.diagnostic.reason).toBe("CONTENT_MISMATCH");
  });
});
