import { applySQLiteMigrations } from "./migrations";
import {
  SQLITE_DATABASE_NAME,
  SQLITE_PRAGMAS,
} from "./schema";
import type {
  SQLiteConnection,
  SQLiteOpener,
} from "./types";

let databasePromise: Promise<SQLiteConnection> | null = null;
let openerOverride: SQLiteOpener | null = null;

export function isSQLiteNativeRuntime(): boolean {
  return !(
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

async function loadNativeOpener(): Promise<SQLiteOpener> {
  if (openerOverride) {
    return openerOverride;
  }

  const sqlite = await import("expo-sqlite");
  return (databaseName) =>
    sqlite.openDatabaseAsync(databaseName) as Promise<SQLiteConnection>;
}

async function initializeDatabase(): Promise<SQLiteConnection> {
  const startedAt = Date.now();
  const openStartedAt = Date.now();
  const openDatabase = await loadNativeOpener();
  const database = await openDatabase(SQLITE_DATABASE_NAME);
  const openDurationMs = Date.now() - openStartedAt;

  try {
    const pragmaStartedAt = Date.now();
    await database.execAsync(SQLITE_PRAGMAS);
    const pragmaDurationMs = Date.now() - pragmaStartedAt;
    const migrationStartedAt = Date.now();
    await applySQLiteMigrations(database);
    const migrationDurationMs = Date.now() - migrationStartedAt;
    // eslint-disable-next-line no-console
    console.info(JSON.stringify({
      event: "sqlite_startup_performance",
      openDurationMs,
      pragmaDurationMs,
      migrationDurationMs,
      totalDurationMs: Date.now() - startedAt,
    }));
    return database;
  } catch (error) {
    await database.closeAsync().catch(() => undefined);
    throw error;
  }
}

export function openFactuDarwinDatabase(): Promise<SQLiteConnection | null> {
  if (!isSQLiteNativeRuntime()) {
    return Promise.resolve(null);
  }

  databasePromise ??= initializeDatabase().catch((error) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

export async function requireFactuDarwinDatabase(): Promise<SQLiteConnection> {
  const database = await openFactuDarwinDatabase();
  if (!database) {
    throw new Error(
      "SQLite nativo no está disponible en web; la PWA continúa usando IndexedDB.",
    );
  }
  return database;
}

export async function withFactuDarwinTransaction<T>(
  task: (transaction: SQLiteConnection) => Promise<T>,
): Promise<T> {
  const database = await requireFactuDarwinDatabase();
  let result: T | undefined;

  await database.withExclusiveTransactionAsync(async (transaction) => {
    result = await task(transaction);
  });

  return result as T;
}

export async function closeFactuDarwinDatabase(): Promise<void> {
  const pendingDatabase = databasePromise;
  databasePromise = null;
  if (pendingDatabase) {
    const database = await pendingDatabase;
    await database.closeAsync();
  }
}

export function setSQLiteOpenerForTests(opener: SQLiteOpener | null): void {
  openerOverride = opener;
  databasePromise = null;
}
