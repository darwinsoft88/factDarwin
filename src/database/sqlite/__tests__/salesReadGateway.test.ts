import type { Sale } from "../../../types";
import {
  readSalesControlled,
  type SalesFallbackReason,
} from "../salesReadGateway";
import { SQLITE_SCHEMA_VERSION } from "../schema";
import type { SQLiteConnection } from "../types";

const sale = {
  id: "sale-1",
  clientId: "client-1",
  userId: "user-1",
  createdAt: "2026-07-28T10:00:00.000Z",
  sequence: "000000001",
  accessKey: "",
  subtotal: 10,
  tax: 1.5,
  total: 11.5,
  paymentMethod: "01",
  status: "AUTORIZADA",
  items: [],
} as Sale;

const metrics = {
  subtotalMicros: 10_000_000,
  taxMicros: 1_500_000,
  discountMicros: 0,
  totalMicros: 11_500_000,
  creditBalanceMicros: 0,
  lineCount: 0,
  paymentCount: 0,
  signedXmlCount: 0,
  authorizedXmlCount: 0,
};

const database = {
  getAllAsync: jest.fn(async () => [
    { key: "tenant_id", value_json: JSON.stringify("tenant-1") },
    { key: "schema_version", value_json: JSON.stringify(
      SQLITE_SCHEMA_VERSION,
    ) },
    { key: "migration_state", value_json: JSON.stringify(
      "products_validated",
    ) },
    { key: "snapshot_hash", value_json: JSON.stringify("payload-hash") },
  ]),
  getFirstAsync: jest.fn(async (sql: string) => sql.includes("app_metadata")
    ? {
      tenant_id: "tenant-1",
      schema_version: SQLITE_SCHEMA_VERSION,
      migration_state: "products_validated",
      snapshot_hash: "payload-hash",
      snapshot_size_bytes: 1,
      last_migration_at: null,
      created_at: "2026-07-28T10:00:00.000Z",
      updated_at: "2026-07-28T10:00:00.000Z",
    }
    : ({
    tenant_id: "tenant-1",
    catalog_type: "sales",
    snapshot_generation: "generation-1",
    source_hash: "sales-hash",
    row_count: 1,
    status: "validated",
    schema_version: SQLITE_SCHEMA_VERSION,
    validated_at: "2026-07-28T10:00:00.000Z",
    updated_at: "2026-07-28T10:00:00.000Z",
    last_error_code: null,
    last_error_detail: null,
    validation_details_json: JSON.stringify(metrics),
  })),
} as unknown as SQLiteConnection;

function source(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 3,
    companyId: "tenant-1",
    issuerRuc: "1723772099001",
    snapshotGeneration: "generation-1",
    payloadHash: "payload-hash",
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

describe("readSalesControlled", () => {
  it("usa archivo cuando el flag está apagado", async () => {
    const value = await readSalesControlled("tenant-1", [sale], {
      enabled: false,
    });
    expect(value.source).toBe("file");
    expect(value.diagnostic.reason).toBe("FEATURE_DISABLED");
  });

  it("usa archivo en web cuando SQLite no está disponible", async () => {
    const value = await readSalesControlled("tenant-1", [sale], {
      enabled: true,
      dependencies: { openDatabase: async () => null },
    });
    expect(value.diagnostic.reason).toBe("WEB_USES_FILE");
  });

  it("lee resúmenes solo cuando recibo e integridad coinciden", async () => {
    const checkLightweightIntegrity = jest.fn(async () => ({
      valid: true,
      rowCount: 1,
      metrics,
      differences: [],
    }));
    const listSummaries = jest.fn(async () => [sale]);
    const value = await readSalesControlled("tenant-1", [sale], {
      enabled: true,
      dependencies: {
        openDatabase: async () => database,
        readDescriptor: async () => source(),
        createRepository: () => ({
          checkLightweightIntegrity,
          listSummaries,
        }),
      },
    });
    expect(value.source).toBe("sqlite");
    expect(checkLightweightIntegrity).toHaveBeenCalledWith(1, metrics);
    expect(listSummaries).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["TENANT_MISMATCH", { companyId: "tenant-2" }],
    ["SNAPSHOT_GENERATION_MISMATCH", {
      snapshotGeneration: "generation-2",
    }],
    ["SALES_HASH_MISMATCH", {
      catalogHashes: {
        clients: "clients-hash",
        products: "products-hash",
        sales: "other-hash",
        inventoryMovements: "inventory-hash",
      },
    }],
  ] as Array<[SalesFallbackReason, Record<string, unknown>]>)(
    "hace fallback por %s",
    async (reason, override) => {
      const value = await readSalesControlled("tenant-1", [sale], {
        enabled: true,
        dependencies: {
          openDatabase: async () => database,
          readDescriptor: async () => source(override),
        },
      });
      expect(value.source).toBe("file");
      expect(value.diagnostic.reason).toBe(reason);
    },
  );

  it("hace fallback si falla la integridad ligera", async () => {
    const value = await readSalesControlled("tenant-1", [sale], {
      enabled: true,
      dependencies: {
        openDatabase: async () => database,
        readDescriptor: async () => source(),
        createRepository: () => ({
          checkLightweightIntegrity: async () => ({
            valid: false,
            rowCount: 1,
            metrics,
            differences: ["FINANCIAL_MISMATCH:totalMicros"],
          }),
          listSummaries: async () => {
            throw new Error("No debe leer una paridad inválida.");
          },
        }),
      },
    });
    expect(value.diagnostic.reason).toBe("LIGHTWEIGHT_INTEGRITY_FAILED");
  });

  it("rechaza una cantidad distinta de la memoria canónica", async () => {
    const value = await readSalesControlled(
      "tenant-1",
      [sale, { ...sale, id: "sale-2" }],
      {
        enabled: true,
        dependencies: {
          openDatabase: async () => database,
          readDescriptor: async () => source(),
        },
      },
    );
    expect(value.diagnostic.reason).toBe("SALES_COUNT_MISMATCH");
  });
});
