jest.mock("../../mainSnapshotStorage", () => ({
  readMainSnapshotDescriptor: jest.fn(),
}));

jest.mock("../client", () => ({
  openFactuDarwinDatabase: jest.fn(),
}));

import { readMainSnapshotDescriptor } from "../../mainSnapshotStorage";
import { initializeSQLiteMetadata } from "../bootstrap";
import { openFactuDarwinDatabase } from "../client";
import { SQLITE_SCHEMA_VERSION } from "../schema";
import type {
  SQLiteBindValue,
  SQLiteConnection,
  SQLiteRunResult,
} from "../types";

const readDescriptorMock = jest.mocked(readMainSnapshotDescriptor);
const openDatabaseMock = jest.mocked(openFactuDarwinDatabase);

class BootstrapDatabase implements SQLiteConnection {
  readonly writes: SQLiteBindValue[][] = [];

  async execAsync(): Promise<void> {
    return undefined;
  }

  async runAsync(
    _source: string,
    ...params: SQLiteBindValue[]
  ): Promise<SQLiteRunResult> {
    this.writes.push(params);
    return { changes: 1, lastInsertRowId: 0 };
  }

  async getFirstAsync<T>(): Promise<T | null> {
    return null;
  }

  async getAllAsync<T>(): Promise<T[]> {
    return [];
  }

  async withExclusiveTransactionAsync(
    task: (transaction: SQLiteConnection) => Promise<void>,
  ): Promise<void> {
    await task(this);
  }

  async closeAsync(): Promise<void> {
    return undefined;
  }
}

describe("initializeSQLiteMetadata", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("registra tenant, esquema, migración y hash", async () => {
    const database = new BootstrapDatabase();
    openDatabaseMock.mockResolvedValue(database);
    readDescriptorMock.mockResolvedValue({
      schemaVersion: 1,
      companyId: "company-1",
      issuerRuc: "1723772099001",
      snapshotGeneration: "generation-1",
      payloadHash: "verified-hash",
      catalogHashes: {
        clients: "clients-hash",
        products: "products-hash",
        sales: "sales-hash",
        inventoryMovements: "inventory-hash",
      },
      createdAt: "2026-07-28T00:00:00.000Z",
    });

    await expect(
      initializeSQLiteMetadata("company-1"),
    ).resolves.toEqual({
      status: "ready",
      tenantId: "company-1",
      snapshotHash: "verified-hash",
    });

    const valuesByKey = new Map(
      database.writes.map((params) => [
        String(params[1]),
        JSON.parse(String(params[2])),
      ]),
    );
    expect(valuesByKey).toEqual(new Map<string, unknown>([
      ["tenant_id", "company-1"],
      ["schema_version", SQLITE_SCHEMA_VERSION],
      ["migration_state", "not_started"],
      ["snapshot_hash", "verified-hash"],
    ]));
  });

  it("no abre SQLite cuando no existe tenant", async () => {
    await expect(initializeSQLiteMetadata(" ")).resolves.toEqual({
      status: "skipped",
      reason: "missing-tenant",
    });
    expect(openDatabaseMock).not.toHaveBeenCalled();
  });

  it("mantiene el archivo operativo cuando SQLite falla", async () => {
    openDatabaseMock.mockRejectedValue(new Error("open failed"));

    const result = await initializeSQLiteMetadata("company-1");

    expect(result.status).toBe("failed");
    expect(readDescriptorMock).not.toHaveBeenCalled();
  });

  it("impide asociar el snapshot de una empresa con otra", async () => {
    const database = new BootstrapDatabase();
    openDatabaseMock.mockResolvedValue(database);
    readDescriptorMock.mockResolvedValue({
      schemaVersion: 1,
      companyId: "company-2",
      issuerRuc: "1790000000001",
      snapshotGeneration: "generation-2",
      payloadHash: "other-hash",
      catalogHashes: {
        clients: "clients-hash",
        products: "products-hash",
        sales: "sales-hash",
        inventoryMovements: "inventory-hash",
      },
      createdAt: "2026-07-28T00:00:00.000Z",
    });

    const result = await initializeSQLiteMetadata("company-1");

    expect(result.status).toBe("failed");
    expect(database.writes).toHaveLength(0);
  });
});
