import type { Client } from "../../types";
import { AppMetadataRepository } from "./appMetadataRepository";
import {
  canonicalClientRecord,
  hashClientRecord,
} from "./clientRecord";
import {
  TenantRepository,
  type TenantRepositoryContext,
} from "./repository";
import { SQLITE_SCHEMA_VERSION } from "./schema";
import type { SQLiteConnection } from "./types";
import {
  CatalogValidationReceiptRepository,
} from "./CatalogValidationReceiptRepository";

interface ClientRow {
  id: string;
  name: string;
  identification: string;
  identification_type: string;
  email: string;
  phone: string;
  address: string;
  updated_at: string | null;
  compatibility_json: string | null;
  record_hash: string | null;
}

export interface ClientsParityResult {
  equal: boolean;
  jsonCount: number;
  sqliteCount: number;
  comparedHashes: number;
  differences: string[];
}

export interface ClientsMigrationResult extends ClientsParityResult {
  durationMs: number;
  snapshotHash: string;
}

export interface CatalogMirrorReceiptInput {
  snapshotGeneration: string;
  sourceHash: string;
  schemaVersion: number;
  confirmCanonical: () => Promise<boolean>;
}

interface PreparedClient {
  client: Client;
  hash: string;
}

export class ClientsRepository extends TenantRepository {
  constructor(context: TenantRepositoryContext) {
    super(context);
  }

  private async rows(
    database: SQLiteConnection = this.database,
  ): Promise<ClientRow[]> {
    return database.getAllAsync<ClientRow>(
      `SELECT
        id, name, identification, identification_type, email, phone,
        address, updated_at, compatibility_json, record_hash
       FROM clients
       WHERE tenant_id = ?
       ORDER BY id ASC`,
      this.tenantId,
    );
  }

  private clientsFromRows(rows: ClientRow[]): Client[] {
    return rows.map((row) => {
      const compatibility = row.compatibility_json
        ? JSON.parse(row.compatibility_json) as Record<string, unknown>
        : {};
      return {
        ...compatibility,
        id: row.id,
        name: row.name,
        identification: row.identification,
        identificationType: row.identification_type,
        email: row.email,
        phone: row.phone,
        address: row.address,
        ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
      } as Client;
    });
  }

  async listAll(): Promise<Client[]> {
    return this.clientsFromRows(await this.rows());
  }

  async searchByName(search: string): Promise<Client[]> {
    const term = `%${search.trim().replace(/[\\%_]/g, "\\$&")}%`;
    const rows = await this.database.getAllAsync<ClientRow>(
      `SELECT
        id, name, identification, identification_type, email, phone,
        address, updated_at, compatibility_json, record_hash
       FROM clients
       WHERE tenant_id = ? AND name LIKE ? ESCAPE '\\' COLLATE NOCASE
       ORDER BY name ASC, id ASC`,
      this.tenantId,
      term,
    );
    return this.clientsFromRows(rows);
  }

  async searchByIdentification(search: string): Promise<Client[]> {
    const term = `%${search.trim().replace(/[\\%_]/g, "\\$&")}%`;
    const rows = await this.database.getAllAsync<ClientRow>(
      `SELECT
        id, name, identification, identification_type, email, phone,
        address, updated_at, compatibility_json, record_hash
       FROM clients
       WHERE tenant_id = ? AND identification LIKE ? ESCAPE '\\'
       ORDER BY identification ASC, id ASC`,
      this.tenantId,
      term,
    );
    return this.clientsFromRows(rows);
  }

  private comparePrepared(
    prepared: PreparedClient[],
    rows: ClientRow[],
  ): ClientsParityResult {
    const expected = new Map(
      prepared.map(({ client, hash }) => [
        canonicalClientRecord(client).id,
        { record: canonicalClientRecord(client), hash },
      ]),
    );
    const differences: string[] = [];

    if (expected.size !== prepared.length) {
      differences.push("DUPLICATE_JSON_IDS");
    }
    if (rows.length !== prepared.length) {
      differences.push("COUNT_MISMATCH");
    }

    for (const row of rows) {
      const source = expected.get(row.id);
      if (!source) {
        differences.push(`UNEXPECTED_ID:${row.id}`);
        continue;
      }
      let compatibility: Record<string, unknown> = {};
      try {
        compatibility = row.compatibility_json
          ? JSON.parse(row.compatibility_json) as Record<string, unknown>
          : {};
      } catch {
        differences.push(`INVALID_COMPATIBILITY:${row.id}`);
      }
      const databaseRecord = {
        id: row.id,
        name: row.name,
        identification: row.identification,
        identificationType: row.identification_type,
        email: row.email,
        phone: row.phone,
        address: row.address,
        updatedAt: row.updated_at,
        compatibility,
      };
      if (JSON.stringify(databaseRecord) !== JSON.stringify(source.record)) {
        differences.push(`RECORD_MISMATCH:${row.id}`);
      }
      if (row.record_hash !== source.hash) {
        differences.push(`HASH_MISMATCH:${row.id}`);
      }
      expected.delete(row.id);
    }

    for (const missingId of expected.keys()) {
      differences.push(`MISSING_ID:${missingId}`);
    }

    return {
      equal: differences.length === 0,
      jsonCount: prepared.length,
      sqliteCount: rows.length,
      comparedHashes: prepared.length - expected.size,
      differences,
    };
  }

  async compareWithFileClients(
    clients: Client[],
  ): Promise<ClientsParityResult> {
    const prepared = await Promise.all(
      clients.map(async (client) => ({
        client,
        hash: await hashClientRecord(client),
      })),
    );
    return this.comparePrepared(prepared, await this.rows());
  }

  async migrateMirror(
    clients: Client[],
    snapshotHash: string,
  ): Promise<ClientsMigrationResult> {
    const startedAt = Date.now();
    const prepared = await Promise.all(
      clients.map(async (client) => ({
        client,
        hash: await hashClientRecord(client),
      })),
    );
    let parity: ClientsParityResult | null = null;

    await this.database.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync(
        "DELETE FROM clients WHERE tenant_id = ?",
        this.tenantId,
      );
      for (const { client, hash } of prepared) {
        const record = canonicalClientRecord(client);
        await transaction.runAsync(
          `INSERT INTO clients (
            tenant_id, id, identification_type, identification, name,
            email, phone, address, updated_at, compatibility_json, record_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          this.tenantId,
          record.id,
          record.identificationType,
          record.identification,
          record.name,
          record.email,
          record.phone,
          record.address,
          record.updatedAt,
          JSON.stringify(record.compatibility),
          hash,
        );
      }

      parity = this.comparePrepared(prepared, await this.rows(transaction));
      if (!parity.equal) {
        throw new Error(
          `La migración de clientes no alcanzó paridad: ${parity.differences.join(", ")}`,
        );
      }

      const metadata = new AppMetadataRepository({
        database: transaction,
        tenantId: this.tenantId,
      });
      await metadata.saveWithinTransaction(transaction, {
        tenantId: this.tenantId,
        schemaVersion: SQLITE_SCHEMA_VERSION,
        migrationState: "clients_validated",
        snapshotHash,
      });
    });

    const result = parity as ClientsParityResult | null;
    if (!result) {
      throw new Error("No se obtuvo el resultado de paridad de clientes.");
    }
    return {
      ...result,
      durationMs: Date.now() - startedAt,
      snapshotHash,
    };
  }

  async synchronizeIncremental(
    clients: Client[],
    receipt: CatalogMirrorReceiptInput,
  ): Promise<ClientsParityResult> {
    const prepared = await Promise.all(
      clients.map(async (client) => ({
        client,
        hash: await hashClientRecord(client),
      })),
    );
    let parity: ClientsParityResult | null = null;
    await this.database.withExclusiveTransactionAsync(async (transaction) => {
      const existing = await transaction.getAllAsync<{
        id: string;
        record_hash: string | null;
      }>(
        "SELECT id, record_hash FROM clients WHERE tenant_id = ?",
        this.tenantId,
      );
      const expectedIds = new Set(
        prepared.map(({ client }) => String(client.id)),
      );
      for (const row of existing) {
        if (!expectedIds.has(row.id)) {
          await transaction.runAsync(
            "DELETE FROM clients WHERE tenant_id = ? AND id = ?",
            this.tenantId,
            row.id,
          );
        }
      }
      const hashes = new Map(existing.map((row) => [row.id, row.record_hash]));
      for (const { client, hash } of prepared) {
        const record = canonicalClientRecord(client);
        if (hashes.get(record.id) === hash) continue;
        await transaction.runAsync(
          `INSERT INTO clients (
            tenant_id, id, identification_type, identification, name,
            email, phone, address, updated_at, compatibility_json, record_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(tenant_id, id) DO UPDATE SET
            identification_type = excluded.identification_type,
            identification = excluded.identification,
            name = excluded.name,
            email = excluded.email,
            phone = excluded.phone,
            address = excluded.address,
            updated_at = excluded.updated_at,
            compatibility_json = excluded.compatibility_json,
            record_hash = excluded.record_hash`,
          this.tenantId,
          record.id,
          record.identificationType,
          record.identification,
          record.name,
          record.email,
          record.phone,
          record.address,
          record.updatedAt,
          JSON.stringify(record.compatibility),
          hash,
        );
      }
      parity = this.comparePrepared(prepared, await this.rows(transaction));
      if (!parity.equal) {
        throw new Error(parity.differences.join(", "));
      }
      if (!(await receipt.confirmCanonical())) {
        throw new Error("STALE_SNAPSHOT_GENERATION");
      }
      await new CatalogValidationReceiptRepository({
        database: transaction,
        tenantId: this.tenantId,
      }).saveValidatedWithinTransaction(transaction, {
        catalogType: "clients",
        snapshotGeneration: receipt.snapshotGeneration,
        sourceHash: receipt.sourceHash,
        rowCount: clients.length,
        schemaVersion: receipt.schemaVersion,
      });
    });
    if (!parity) throw new Error("No se validó el espejo de clientes.");
    return parity;
  }
}
