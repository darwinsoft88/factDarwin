import type { ReceivedRetention } from "../../../types";
import {
  readReceivedRetentionsControlled,
} from "../receivedRetentionsReadGateway";
import type { SQLiteConnection, SQLiteRunResult } from "../types";

const retention: ReceivedRetention = {
  id: "ret-1",
  saleId: "sale-1",
  clientId: "client-1",
  userId: "user-1",
  createdAt: "2026-07-29T10:00:00.000Z",
  receivedAt: "2026-07-29",
  documentNumber: "001-001-000000001",
  taxType: "RENTA",
  code: "303",
  base: 100,
  percentage: 2,
  amount: 2,
};

function database(options: {
  dirty?: boolean;
  generation?: string;
  hash?: string;
  count?: number;
} = {}): SQLiteConnection {
  return {
    execAsync: async () => undefined,
    runAsync: async (): Promise<SQLiteRunResult> => ({
      changes: 1,
      lastInsertRowId: 0,
    }),
    getFirstAsync: async <T>(source: string) => {
      if (!source.includes("catalog_validation_receipts")) return null;
      return {
        tenant_id: "tenant-1",
        catalog_type: "received_retentions",
        snapshot_generation: options.generation ?? "generation-1",
        source_hash: options.hash ?? "retentions-hash",
        row_count: options.count ?? 1,
        status: options.dirty ? "dirty" : "validated",
        schema_version: 12,
        validated_at: "2026-07-29",
        updated_at: "2026-07-29",
        last_error_code: null,
        last_error_detail: null,
        validation_details_json: "{}",
      } as T;
    },
    getAllAsync: async <T>(source: string) => {
      if (!source.includes("app_metadata")) return [];
      return [
        { key: "tenant_id", value_json: JSON.stringify("tenant-1") },
        { key: "schema_version", value_json: JSON.stringify(12) },
        { key: "migration_state", value_json: JSON.stringify("not_started") },
        { key: "snapshot_hash", value_json: JSON.stringify("payload-hash") },
      ] as T[];
    },
    withExclusiveTransactionAsync: async (task) => task(
      database(options),
    ),
    closeAsync: async () => undefined,
  };
}

function dependencies(
  sqliteRetentions: ReceivedRetention[] = [retention],
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
      payloadHash: "payload-hash",
      catalogHashes: {
        clients: "clients",
        products: "products",
        sales: "sales",
        inventoryMovements: "movements",
        creditPayments: "payments",
        creditAdjustments: "adjustments",
        receivedRetentions: "retentions-hash",
      },
      createdAt: "2026-07-29",
    }),
    createRepository: () => ({
      list: async () => sqliteRetentions,
    }),
  };
}

describe("readReceivedRetentionsControlled", () => {
  it("usa SQLite solo con toda la compuerta validada", async () => {
    const result = await readReceivedRetentionsControlled(
      "tenant-1",
      [retention],
      { enabled: true, dependencies: dependencies() },
    );
    expect(result.source).toBe("sqlite");
    expect(result.retentions).toEqual([retention]);
  });

  it("mantiene PWA siempre en el archivo", async () => {
    const deps = dependencies();
    const result = await readReceivedRetentionsControlled(
      "tenant-1",
      [retention],
      { enabled: true, dependencies: { ...deps, platform: "web" } },
    );
    expect(result.source).toBe("file");
    expect(result.diagnostic.reason).toBe("WEB_USES_FILE");
  });

  it("hace fallback ante recibo dirty o generación diferente", async () => {
    const dirty = await readReceivedRetentionsControlled(
      "tenant-1",
      [retention],
      {
        enabled: true,
        dependencies: dependencies([retention], database({ dirty: true })),
      },
    );
    expect(dirty.diagnostic.reason).toBe("MIRROR_DIRTY");
    const stale = await readReceivedRetentionsControlled(
      "tenant-1",
      [retention],
      {
        enabled: true,
        dependencies: dependencies(
          [retention],
          database({ generation: "old" }),
        ),
      },
    );
    expect(stale.diagnostic.reason).toBe("SNAPSHOT_GENERATION_MISMATCH");
  });

  it("no mezcla fuentes si el contenido SQLite difiere", async () => {
    const changed = [{ ...retention, amount: 99 }];
    const result = await readReceivedRetentionsControlled(
      "tenant-1",
      [retention],
      { enabled: true, dependencies: dependencies(changed) },
    );
    expect(result.source).toBe("file");
    expect(result.retentions).toEqual([retention]);
    expect(result.diagnostic.reason).toBe("CONTENT_MISMATCH");
  });
});
