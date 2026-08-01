jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: jest.fn(
    async (_algorithm: string, value: string) => `hash:${value}`,
  ),
}));

import type { Client } from "../../../types";
import { ClientsRepository } from "../ClientsRepository";
import type {
  SQLiteBindValue,
  SQLiteConnection,
  SQLiteRunResult,
} from "../types";

interface StoredClient {
  tenant_id: string;
  id: string;
  identification_type: string;
  identification: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  updated_at: string | null;
  compatibility_json: string;
  record_hash: string;
}

class ClientsDatabase implements SQLiteConnection {
  rows: StoredClient[] = [];
  corruptSelect = false;
  clientInsertCount = 0;

  async execAsync(): Promise<void> {
    return undefined;
  }

  async runAsync(
    source: string,
    ...params: SQLiteBindValue[]
  ): Promise<SQLiteRunResult> {
    if (source.includes("DELETE FROM clients")) {
      const tenantId = String(params[0]);
      this.rows = this.rows.filter((row) => row.tenant_id !== tenantId);
    } else if (source.includes("INSERT INTO clients")) {
      this.clientInsertCount += 1;
      this.rows.push({
        tenant_id: String(params[0]),
        id: String(params[1]),
        identification_type: String(params[2]),
        identification: String(params[3]),
        name: String(params[4]),
        email: String(params[5]),
        phone: String(params[6]),
        address: String(params[7]),
        updated_at: params[8] === null ? null : String(params[8]),
        compatibility_json: String(params[9]),
        record_hash: String(params[10]),
      });
    }
    return { changes: 1, lastInsertRowId: 0 };
  }

  async getFirstAsync<T>(): Promise<T | null> {
    return null;
  }

  async getAllAsync<T>(
    source: string,
    ...params: SQLiteBindValue[]
  ): Promise<T[]> {
    if (!source.includes("FROM clients")) return [];
    const tenantId = String(params[0]);
    const term = String(params[1] ?? "")
      .replace(/^%|%$/g, "")
      .replace(/\\([\\%_])/g, "$1")
      .toLowerCase();
    return this.rows
      .filter((row) => row.tenant_id === tenantId)
      .filter((row) => !source.includes("name LIKE") ||
        row.name.toLowerCase().includes(term))
      .filter((row) => !source.includes("identification LIKE") ||
        row.identification.includes(term))
      .map((row) => ({
        ...row,
        name: this.corruptSelect ? `${row.name}-corrupto` : row.name,
      }) as T)
      .sort((left, right) => {
        const first = left as { id: string };
        const second = right as { id: string };
        return first.id.localeCompare(second.id);
      });
  }

  async withExclusiveTransactionAsync(
    task: (transaction: SQLiteConnection) => Promise<void>,
  ): Promise<void> {
    const before = this.rows.map((row) => ({ ...row }));
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

const clients: Client[] = [
  {
    id: "client-1",
    identificationType: "05",
    identification: "1711111111",
    name: "Cliente Uno",
    email: "uno@example.com",
    phone: "0991111111",
    address: "Quito",
    updatedAt: "2026-07-28T10:00:00.000Z",
  },
  {
    id: "client-2",
    identificationType: "04",
    identification: "1792222222001",
    name: "Cliente Dos",
    email: "dos@example.com",
    phone: "0992222222",
    address: "Guayaquil",
  },
];

describe("ClientsRepository", () => {
  it("migra y valida conteos, IDs, identificaciones, nombres y hashes", async () => {
    const database = new ClientsDatabase();
    const repository = new ClientsRepository({
      database,
      tenantId: "company-1",
    });

    const result = await repository.migrateMirror(
      clients,
      "snapshot-hash",
    );

    expect(result.equal).toBe(true);
    expect(result.jsonCount).toBe(2);
    expect(result.sqliteCount).toBe(2);
    expect(result.comparedHashes).toBe(2);
    expect(result.differences).toEqual([]);
    expect(database.rows.map(({ id }) => id).sort()).toEqual([
      "client-1",
      "client-2",
    ]);
    expect(database.rows.every(({ record_hash }) =>
      record_hash.startsWith("hash:"),
    )).toBe(true);
  });

  it("detecta cualquier cambio antes de habilitar una futura lectura", async () => {
    const database = new ClientsDatabase();
    const repository = new ClientsRepository({
      database,
      tenantId: "company-1",
    });
    await repository.migrateMirror(clients, "snapshot-hash");

    const changed = clients.map((client, index) => index === 0
      ? {
          ...client,
          name: "Nombre diferente",
          identification: "1700000000",
        }
      : client);
    const parity = await repository.compareWithFileClients(changed);

    expect(parity.equal).toBe(false);
    expect(parity.differences).toContain("RECORD_MISMATCH:client-1");
    expect(parity.differences).toContain("HASH_MISMATCH:client-1");
  });

  it("hace rollback completo si la verificación dentro de la transacción falla", async () => {
    const database = new ClientsDatabase();
    database.rows = [{
      tenant_id: "company-1",
      id: "previous",
      identification_type: "05",
      identification: "1700000000",
      name: "Espejo anterior",
      email: "",
      phone: "",
      address: "",
      updated_at: null,
      compatibility_json: "{}",
      record_hash: "previous-hash",
    }];
    const repository = new ClientsRepository({
      database,
      tenantId: "company-1",
    });
    database.corruptSelect = true;

    await expect(
      repository.migrateMirror(clients, "snapshot-hash"),
    ).rejects.toThrow("no alcanzó paridad");

    expect(database.rows).toHaveLength(1);
    expect(database.rows[0]?.id).toBe("previous");
    expect(database.rows[0]?.record_hash).toBe("previous-hash");
  });

  it("no mezcla clientes de empresas distintas", async () => {
    const database = new ClientsDatabase();
    const first = new ClientsRepository({
      database,
      tenantId: "company-1",
    });
    const second = new ClientsRepository({
      database,
      tenantId: "company-2",
    });

    await first.migrateMirror(clients, "hash-1");
    await second.migrateMirror([
      { ...clients[0]!, id: "other-company-client" },
    ], "hash-2");

    await expect(first.compareWithFileClients(clients)).resolves.toMatchObject({
      equal: true,
      jsonCount: 2,
      sqliteCount: 2,
    });
    expect(
      database.rows.filter(({ tenant_id }) => tenant_id === "company-2"),
    ).toHaveLength(1);
  });

  it("busca por nombre e identificación dentro del tenant", async () => {
    const database = new ClientsDatabase();
    const repository = new ClientsRepository({
      database,
      tenantId: "company-1",
    });
    await repository.migrateMirror(clients, "snapshot-hash");

    await expect(repository.searchByName("uno")).resolves.toMatchObject([
      { id: "client-1", name: "Cliente Uno" },
    ]);
    await expect(
      repository.searchByIdentification("9222"),
    ).resolves.toMatchObject([
      { id: "client-2", identification: "1792222222001" },
    ]);
  });

  it("revierte una actualización incremental si la generación dejó de ser canónica", async () => {
    const database = new ClientsDatabase();
    const repository = new ClientsRepository({
      database,
      tenantId: "company-1",
    });

    await expect(repository.synchronizeIncremental(clients, {
      snapshotGeneration: "generation-old",
      sourceHash: "clients-old",
      schemaVersion: 4,
      confirmCanonical: async () => false,
    })).rejects.toThrow("STALE_SNAPSHOT_GENERATION");

    expect(database.rows).toHaveLength(0);
  });

  it("no reescribe registros sin cambios durante la actualización incremental", async () => {
    const database = new ClientsDatabase();
    const repository = new ClientsRepository({
      database,
      tenantId: "company-1",
    });
    await repository.migrateMirror(clients, "snapshot-hash");
    database.clientInsertCount = 0;

    await repository.synchronizeIncremental(clients, {
      snapshotGeneration: "generation-current",
      sourceHash: "clients-current",
      schemaVersion: 4,
      confirmCanonical: async () => true,
    });

    expect(database.clientInsertCount).toBe(0);
  });
});
