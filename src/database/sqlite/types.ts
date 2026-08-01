export type SQLiteBindValue = string | number | null | Uint8Array;

export interface SQLiteRunResult {
  lastInsertRowId: number;
  changes: number;
}

export interface SQLiteConnection {
  execAsync(source: string): Promise<void>;
  runAsync(
    source: string,
    ...params: SQLiteBindValue[]
  ): Promise<SQLiteRunResult>;
  getFirstAsync<T>(
    source: string,
    ...params: SQLiteBindValue[]
  ): Promise<T | null>;
  getAllAsync<T>(
    source: string,
    ...params: SQLiteBindValue[]
  ): Promise<T[]>;
  withExclusiveTransactionAsync(
    task: (transaction: SQLiteConnection) => Promise<void>,
  ): Promise<void>;
  closeAsync(): Promise<void>;
}

export type SQLiteOpener = (
  databaseName: string,
) => Promise<SQLiteConnection>;
