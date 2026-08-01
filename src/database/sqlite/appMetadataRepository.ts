import {
  TenantRepository,
  type TenantRepositoryContext,
} from "./repository";

export const APP_METADATA_KEYS = {
  tenantId: "tenant_id",
  schemaVersion: "schema_version",
  migrationState: "migration_state",
  snapshotHash: "snapshot_hash",
} as const;

export type SQLiteMigrationState =
  | "not_started"
  | "clients_validated"
  | "products_validated";

export interface SQLiteAppMetadata {
  tenantId: string;
  schemaVersion: number;
  migrationState: SQLiteMigrationState;
  snapshotHash: string | null;
}

interface MetadataRow {
  key: string;
  value_json: string;
}

export class AppMetadataRepository extends TenantRepository {
  constructor(context: TenantRepositoryContext) {
    super(context);
  }

  async save(metadata: SQLiteAppMetadata): Promise<void> {
    await this.database.withExclusiveTransactionAsync(async (transaction) => {
      await this.saveWithinTransaction(transaction, metadata);
    });
  }

  async saveWithinTransaction(
    transaction: import("./types").SQLiteConnection,
    metadata: SQLiteAppMetadata,
  ): Promise<void> {
    if (metadata.tenantId !== this.tenantId) {
      throw new Error(
        "El tenant_id de los metadatos no coincide con el repositorio.",
      );
    }

    const updatedAt = new Date().toISOString();
    const entries: Array<[string, unknown]> = [
      [APP_METADATA_KEYS.tenantId, metadata.tenantId],
      [APP_METADATA_KEYS.schemaVersion, metadata.schemaVersion],
      [APP_METADATA_KEYS.migrationState, metadata.migrationState],
      [APP_METADATA_KEYS.snapshotHash, metadata.snapshotHash],
    ];

    for (const [key, value] of entries) {
      await transaction.runAsync(
        `INSERT INTO app_metadata (
          tenant_id, key, value_json, updated_at
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(tenant_id, key) DO UPDATE SET
          value_json = excluded.value_json,
          updated_at = excluded.updated_at`,
        this.tenantId,
        key,
        JSON.stringify(value),
        updatedAt,
      );
    }
  }

  async read(): Promise<SQLiteAppMetadata | null> {
    const rows = await this.database.getAllAsync<MetadataRow>(
      `SELECT key, value_json
       FROM app_metadata
       WHERE tenant_id = ?`,
      this.tenantId,
    );
    if (rows.length === 0) return null;

    const values = new Map(
      rows.map(({ key, value_json }) => [key, JSON.parse(value_json)]),
    );
    return {
      tenantId: String(values.get(APP_METADATA_KEYS.tenantId) || ""),
      schemaVersion: Number(
        values.get(APP_METADATA_KEYS.schemaVersion) || 0,
      ),
      migrationState: String(
        values.get(APP_METADATA_KEYS.migrationState) || "not_started",
      ) as SQLiteMigrationState,
      snapshotHash:
        typeof values.get(APP_METADATA_KEYS.snapshotHash) === "string"
          ? String(values.get(APP_METADATA_KEYS.snapshotHash))
          : null,
    };
  }
}
