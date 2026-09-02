import {
  SQLITE_SCHEMA_V1,
  SQLITE_SCHEMA_V2,
  SQLITE_SCHEMA_V3,
  SQLITE_SCHEMA_V4,
  SQLITE_SCHEMA_V5,
  SQLITE_SCHEMA_V6,
  SQLITE_SCHEMA_V7,
  SQLITE_SCHEMA_V8,
  SQLITE_SCHEMA_V9,
  SQLITE_SCHEMA_V10,
  SQLITE_SCHEMA_V11,
  SQLITE_SCHEMA_V12,
  SQLITE_SCHEMA_VERSION,
} from "./schema";
import type { SQLiteConnection } from "./types";

interface AppliedMigration {
  version: number;
}

interface SQLiteMigration {
  version: number;
  sql: string;
}

export const SQLITE_MIGRATIONS: readonly SQLiteMigration[] = [
  {
    version: 1,
    sql: SQLITE_SCHEMA_V1,
  },
  {
    version: 2,
    sql: SQLITE_SCHEMA_V2,
  },
  {
    version: 3,
    sql: SQLITE_SCHEMA_V3,
  },
  {
    version: 4,
    sql: SQLITE_SCHEMA_V4,
  },
  {
    version: 5,
    sql: SQLITE_SCHEMA_V5,
  },
  {
    version: 6,
    sql: SQLITE_SCHEMA_V6,
  },
  {
    version: 7,
    sql: SQLITE_SCHEMA_V7,
  },
  {
    version: 8,
    sql: SQLITE_SCHEMA_V8,
  },
  {
    version: 9,
    sql: SQLITE_SCHEMA_V9,
  },
  {
    version: 10,
    sql: SQLITE_SCHEMA_V10,
  },
  {
    version: 11,
    sql: SQLITE_SCHEMA_V11,
  },
  {
    version: 12,
    sql: SQLITE_SCHEMA_V12,
  },
];

export async function applySQLiteMigrations(
  database: SQLiteConnection,
): Promise<void> {
  const startedAt = Date.now();
  let initialVersion = 0;
  let appliedCount = 0;
  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.execAsync(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);

    const applied = await transaction.getAllAsync<AppliedMigration>(
      "SELECT version FROM schema_migrations ORDER BY version ASC",
    );
    const appliedVersions = new Set(applied.map(({ version }) => version));
    initialVersion = applied.length
      ? Math.max(...applied.map(({ version }) => Number(version)))
      : 0;

    for (const migration of SQLITE_MIGRATIONS) {
      if (appliedVersions.has(migration.version)) {
        continue;
      }

      await transaction.execAsync(migration.sql);
      await transaction.runAsync(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
        migration.version,
        new Date().toISOString(),
      );
      appliedCount += 1;
    }
  });

  const latest = await database.getFirstAsync<AppliedMigration>(
    "SELECT MAX(version) AS version FROM schema_migrations",
  );
  if (latest?.version !== SQLITE_SCHEMA_VERSION) {
    throw new Error(
      `La versión SQLite aplicada (${latest?.version ?? 0}) no coincide con la esperada (${SQLITE_SCHEMA_VERSION}).`,
    );
  }
  // Métrica local para validar actualizaciones reales sin telemetría externa.
  // eslint-disable-next-line no-console
  console.info(JSON.stringify({
    event: "sqlite_migrations_completed",
    fromVersion: initialVersion,
    toVersion: SQLITE_SCHEMA_VERSION,
    appliedCount,
    durationMs: Date.now() - startedAt,
  }));
}
