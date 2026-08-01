import type {
  SQLiteConnection,
  SQLiteOpener,
} from "./types";

export function isSQLiteNativeRuntime(): boolean {
  return false;
}

export function openFactuDarwinDatabase(): Promise<SQLiteConnection | null> {
  return Promise.resolve(null);
}

export async function requireFactuDarwinDatabase(): Promise<SQLiteConnection> {
  throw new Error(
    "SQLite nativo no está disponible en web; la PWA continúa usando el almacenamiento web.",
  );
}

export async function withFactuDarwinTransaction<T>(
  _task: (transaction: SQLiteConnection) => Promise<T>,
): Promise<T> {
  throw new Error(
    "Las transacciones SQLite nativas no están disponibles en web.",
  );
}

export function closeFactuDarwinDatabase(): Promise<void> {
  return Promise.resolve();
}

export function setSQLiteOpenerForTests(_opener: SQLiteOpener | null): void {
  // La PWA no inicializa SQLite nativo.
}
