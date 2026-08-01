import {
  AppMetadataRepository,
  type SQLiteAppMetadata,
} from "../appMetadataRepository";
import type {
  SQLiteBindValue,
  SQLiteConnection,
  SQLiteRunResult,
} from "../types";

interface StoredMetadata {
  valueJson: string;
  updatedAt: string;
}

class MetadataDatabase implements SQLiteConnection {
  private rows = new Map<string, StoredMetadata>();

  async execAsync(): Promise<void> {
    return undefined;
  }

  async runAsync(
    _source: string,
    ...params: SQLiteBindValue[]
  ): Promise<SQLiteRunResult> {
    const [tenantId, key, valueJson, updatedAt] = params.map(String) as [
      string,
      string,
      string,
      string,
    ];
    this.rows.set(`${tenantId}:${key}`, { valueJson, updatedAt });
    return { changes: 1, lastInsertRowId: 0 };
  }

  async getFirstAsync<T>(): Promise<T | null> {
    return null;
  }

  async getAllAsync<T>(
    _source: string,
    ...params: SQLiteBindValue[]
  ): Promise<T[]> {
    const tenantId = String(params[0]);
    const prefix = `${tenantId}:`;
    return [...this.rows.entries()]
      .filter(([storageKey]) => storageKey.startsWith(prefix))
      .map(([storageKey, stored]) => ({
        key: storageKey.slice(prefix.length),
        value_json: stored.valueJson,
      }) as T);
  }

  async withExclusiveTransactionAsync(
    task: (transaction: SQLiteConnection) => Promise<void>,
  ): Promise<void> {
    const before = new Map(this.rows);
    try {
      await task(this);
    } catch (error) {
      this.rows = before;
      throw error;
    }
  }

  async closeAsync(): Promise<void> {
    return undefined;
  }
}

describe("AppMetadataRepository", () => {
  const companyOne: SQLiteAppMetadata = {
    tenantId: "company-1",
    schemaVersion: 1,
    migrationState: "not_started",
    snapshotHash: "hash-company-1",
  };
  const companyTwo: SQLiteAppMetadata = {
    tenantId: "company-2",
    schemaVersion: 1,
    migrationState: "not_started",
    snapshotHash: "hash-company-2",
  };

  it("aísla completamente los metadatos de dos empresas", async () => {
    const database = new MetadataDatabase();
    const repositoryOne = new AppMetadataRepository({
      database,
      tenantId: companyOne.tenantId,
    });
    const repositoryTwo = new AppMetadataRepository({
      database,
      tenantId: companyTwo.tenantId,
    });

    await repositoryOne.save(companyOne);
    await repositoryTwo.save(companyTwo);

    await expect(repositoryOne.read()).resolves.toEqual(companyOne);
    await expect(repositoryTwo.read()).resolves.toEqual(companyTwo);
  });

  it("rechaza metadatos de otra empresa", async () => {
    const database = new MetadataDatabase();
    const repository = new AppMetadataRepository({
      database,
      tenantId: companyOne.tenantId,
    });

    await expect(repository.save(companyTwo)).rejects.toThrow(
      "no coincide",
    );
    await expect(repository.read()).resolves.toBeNull();
  });
});
