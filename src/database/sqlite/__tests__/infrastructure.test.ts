import {
  closeFactuDarwinDatabase,
  openFactuDarwinDatabase,
  setSQLiteOpenerForTests,
  withFactuDarwinTransaction,
} from "../client";
import { applySQLiteMigrations } from "../migrations";
import {
  SQLITE_DATABASE_NAME,
  SQLITE_PRAGMAS,
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
  SQLITE_SCHEMA_VERSION,
} from "../schema";
import type {
  SQLiteBindValue,
  SQLiteConnection,
  SQLiteOpener,
  SQLiteRunResult,
} from "../types";

class FakeSQLiteConnection implements SQLiteConnection {
  readonly execCalls: string[] = [];
  readonly runCalls: Array<{
    source: string;
    params: SQLiteBindValue[];
  }> = [];
  readonly values = new Map<string, string>();
  appliedVersions: number[] = [];
  closed = false;

  async execAsync(source: string): Promise<void> {
    this.execCalls.push(source);
  }

  async runAsync(
    source: string,
    ...params: SQLiteBindValue[]
  ): Promise<SQLiteRunResult> {
    this.runCalls.push({ source, params });
    if (source.includes("INSERT INTO schema_migrations")) {
      this.appliedVersions.push(Number(params[0]));
    }
    if (source === "SET_TEST_VALUE") {
      this.values.set(String(params[0]), String(params[1]));
    }
    return { changes: 1, lastInsertRowId: 1 };
  }

  async getFirstAsync<T>(source: string): Promise<T | null> {
    if (source.includes("MAX(version)")) {
      const version = this.appliedVersions.length
        ? Math.max(...this.appliedVersions)
        : null;
      return { version } as T;
    }
    return null;
  }

  async getAllAsync<T>(source: string): Promise<T[]> {
    if (source.includes("SELECT version FROM schema_migrations")) {
      return this.appliedVersions.map((version) => ({ version }) as T);
    }
    return [];
  }

  async withExclusiveTransactionAsync(
    task: (transaction: SQLiteConnection) => Promise<void>,
  ): Promise<void> {
    const versionsBefore = [...this.appliedVersions];
    const valuesBefore = new Map(this.values);
    try {
      await task(this);
    } catch (error) {
      this.appliedVersions = versionsBefore;
      this.values.clear();
      valuesBefore.forEach((value, key) => this.values.set(key, value));
      throw error;
    }
  }

  async closeAsync(): Promise<void> {
    this.closed = true;
  }
}

describe("infraestructura SQLite", () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  afterEach(async () => {
    await closeFactuDarwinDatabase().catch(() => undefined);
    setSQLiteOpenerForTests(null);
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: originalDocument,
    });
  });

  it("crea el esquema versionado una sola vez", async () => {
    const database = new FakeSQLiteConnection();

    await applySQLiteMigrations(database);
    await applySQLiteMigrations(database);

    expect(database.appliedVersions).toEqual([
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      SQLITE_SCHEMA_VERSION,
    ]);
    expect(
      database.execCalls.filter((sql) => sql === SQLITE_SCHEMA_V1),
    ).toHaveLength(1);
    expect(SQLITE_SCHEMA_V7).toContain(
      "idx_inventory_movements_tenant_operation",
    );
    expect(SQLITE_SCHEMA_V7).not.toMatch(
      /UNIQUE[^\n]*inventory_operation_id/i,
    );
    expect(SQLITE_SCHEMA_V8).toContain("CREATE TABLE credit_payments");
    expect(SQLITE_SCHEMA_V8).toContain("CREATE TABLE credit_adjustments");
    expect(SQLITE_SCHEMA_V9).toContain("CREATE TABLE received_retentions");
    expect(SQLITE_SCHEMA_V10).toContain("CREATE TABLE remission_guides");
    expect(SQLITE_SCHEMA_V11).toContain(
      "CREATE TABLE pending_sync_operations",
    );
    expect(SQLITE_SCHEMA_V11).not.toMatch(
      /UNIQUE[^\n]*request_id/i,
    );
    expect(SQLITE_SCHEMA_V8).not.toMatch(
      /UNIQUE[^\n]*(operation_id|batch_operation_id|void_operation_id)/i,
    );
  });

  it.each(Array.from({ length: 11 }, (_, version) => version))(
    "migra de v%i a v11, reabre e ignora una segunda ejecución",
    async (fromVersion) => {
      const database = new FakeSQLiteConnection();
      database.appliedVersions = Array.from(
        { length: fromVersion },
        (_, index) => index + 1,
      );
      const historicalSchemas = [
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
      ];

      await applySQLiteMigrations(database);
      expect(database.appliedVersions).toEqual(
        Array.from({ length: 11 }, (_, index) => index + 1),
      );
      const executedMigrations = database.execCalls.filter(
        (sql) => historicalSchemas.includes(sql),
      );
      expect(executedMigrations).toEqual(
        historicalSchemas.slice(fromVersion),
      );

      const migrationsAfterUpgrade = executedMigrations.length;
      await applySQLiteMigrations(database);
      expect(database.execCalls.filter(
        (sql) => historicalSchemas.includes(sql),
      )).toHaveLength(migrationsAfterUpgrade);

      const reopened = new FakeSQLiteConnection();
      reopened.appliedVersions = [...database.appliedVersions];
      await applySQLiteMigrations(reopened);
      expect(reopened.execCalls.filter(
        (sql) => historicalSchemas.includes(sql),
      )).toHaveLength(0);
    },
  );

  it.each(Array.from({ length: 11 }, (_, version) => version))(
    "revierte íntegramente si falla la ruta v%i a v11",
    async (fromVersion) => {
      const database = new FakeSQLiteConnection();
      const previousVersions = Array.from(
        { length: fromVersion },
        (_, index) => index + 1,
      );
      database.appliedVersions = [...previousVersions];
      const originalExec = database.execAsync.bind(database);
      let failed = false;
      database.execAsync = async (sql) => {
        if (!failed) {
          failed = true;
          throw new Error(`FALLO_MIGRACION_DESDE_V${fromVersion}`);
        }
        return originalExec(sql);
      };

      await expect(applySQLiteMigrations(database)).rejects.toThrow(
        `FALLO_MIGRACION_DESDE_V${fromVersion}`,
      );
      expect(database.appliedVersions).toEqual(previousVersions);
    },
  );

  it("migra una base v7 aplicando v8, v9, v10 y v11 en orden", async () => {
    const database = new FakeSQLiteConnection();
    database.appliedVersions = [1, 2, 3, 4, 5, 6, 7];

    await applySQLiteMigrations(database);

    expect(database.appliedVersions).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
    expect(database.execCalls).toContain(SQLITE_SCHEMA_V8);
    expect(database.execCalls).toContain(SQLITE_SCHEMA_V9);
    expect(database.execCalls).toContain(SQLITE_SCHEMA_V10);
    expect(database.execCalls).toContain(SQLITE_SCHEMA_V11);
    expect(database.execCalls).not.toContain(SQLITE_SCHEMA_V7);
  });

  it("conserva reconocible una base v7 si falla la migración v8", async () => {
    const database = new FakeSQLiteConnection();
    database.appliedVersions = [1, 2, 3, 4, 5, 6, 7];
    const originalExec = database.execAsync.bind(database);
    database.execAsync = async (sql) => {
      if (sql === SQLITE_SCHEMA_V8) throw new Error("FALLO_V8_SIMULADO");
      return originalExec(sql);
    };

    await expect(applySQLiteMigrations(database))
      .rejects.toThrow("FALLO_V8_SIMULADO");
    expect(database.appliedVersions).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("inicializa una sola conexión concurrente con los PRAGMA requeridos", async () => {
    const database = new FakeSQLiteConnection();
    let openCount = 0;
    const opener: SQLiteOpener = async (name) => {
      expect(name).toBe(SQLITE_DATABASE_NAME);
      openCount += 1;
      return database;
    };
    setSQLiteOpenerForTests(opener);

    const [first, second] = await Promise.all([
      openFactuDarwinDatabase(),
      openFactuDarwinDatabase(),
    ]);

    expect(first).toBe(database);
    expect(second).toBe(database);
    expect(openCount).toBe(1);
    expect(database.execCalls).toContain(SQLITE_PRAGMAS);
  });

  it("cierra y vuelve a abrir una conexión nueva", async () => {
    const firstDatabase = new FakeSQLiteConnection();
    const secondDatabase = new FakeSQLiteConnection();
    const databases = [firstDatabase, secondDatabase];
    let openCount = 0;
    setSQLiteOpenerForTests(async () => databases[openCount++]!);

    await expect(openFactuDarwinDatabase()).resolves.toBe(firstDatabase);
    await closeFactuDarwinDatabase();
    await expect(openFactuDarwinDatabase()).resolves.toBe(secondDatabase);

    expect(firstDatabase.closed).toBe(true);
    expect(secondDatabase.closed).toBe(false);
    expect(openCount).toBe(2);
  });

  it("revierte completamente una transacción que falla", async () => {
    const database = new FakeSQLiteConnection();
    setSQLiteOpenerForTests(async () => database);

    await expect(
      withFactuDarwinTransaction(async (transaction) => {
        await transaction.runAsync("SET_TEST_VALUE", "client", "created");
        throw new Error("interrupción simulada");
      }),
    ).rejects.toThrow("interrupción simulada");

    expect(database.values.has("client")).toBe(false);
  });

  it("no abre SQLite en web y mantiene aislada la PWA", async () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {},
    });
    const opener = jest.fn<ReturnType<SQLiteOpener>, Parameters<SQLiteOpener>>();
    setSQLiteOpenerForTests(opener);

    await expect(openFactuDarwinDatabase()).resolves.toBeNull();
    expect(opener).not.toHaveBeenCalled();
  });

  it("modela datos principales en columnas y reserva JSON para compatibilidad", () => {
    expect(SQLITE_SCHEMA_V1).toContain("unit_price_micros INTEGER");
    expect(SQLITE_SCHEMA_V1).toContain("PRIMARY KEY (tenant_id, id)");
    expect(SQLITE_SCHEMA_V1).not.toContain("payload_json");
    expect(SQLITE_SCHEMA_V1).toContain("compatibility_json");
  });
});
