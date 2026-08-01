import fs from "fs";
import path from "path";
import { sqliteCatalogReadsEnabled } from "../catalogReadFeature";
import { sqliteCreditLedgerReadsEnabled } from "../creditLedgerReadFeature";
import { sqliteInventoryMovementReadsEnabled } from
  "../inventoryMovementsReadFeature";
import { sqliteReceivedRetentionsReadsEnabled } from
  "../receivedRetentionsReadFeature";
import { sqliteRemissionGuideReadsEnabled } from
  "../remissionGuidesReadFeature";
import { sqliteSalesReadsEnabled } from "../salesReadFeature";

const flags = [
  ["EXPO_PUBLIC_SQLITE_CATALOG_READS", sqliteCatalogReadsEnabled],
  ["EXPO_PUBLIC_SQLITE_SALES_READS", sqliteSalesReadsEnabled],
  [
    "EXPO_PUBLIC_SQLITE_INVENTORY_MOVEMENT_READS",
    sqliteInventoryMovementReadsEnabled,
  ],
  [
    "EXPO_PUBLIC_SQLITE_CREDIT_LEDGER_READS",
    sqliteCreditLedgerReadsEnabled,
  ],
  [
    "EXPO_PUBLIC_SQLITE_RECEIVED_RETENTIONS_READS",
    sqliteReceivedRetentionsReadsEnabled,
  ],
  [
    "EXPO_PUBLIC_SQLITE_REMISSION_GUIDE_READS",
    sqliteRemissionGuideReadsEnabled,
  ],
] as const;

describe("estabilización final de Fase 2", () => {
  const previousEnvironment = new Map<string, string | undefined>();

  beforeEach(() => {
    flags.forEach(([name]) => {
      previousEnvironment.set(name, process.env[name]);
      delete process.env[name];
    });
  });

  afterEach(() => {
    flags.forEach(([name]) => {
      const previous = previousEnvironment.get(name);
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
    previousEnvironment.clear();
  });

  it.each(flags)(
    "%s permanece apagado salvo habilitación explícita con 1",
    (name, enabled) => {
      expect(enabled()).toBe(false);
      process.env[name] = "true";
      expect(enabled()).toBe(false);
      process.env[name] = "1";
      expect(enabled()).toBe(true);
    },
  );

  it("mantiene pendingSync fuera de las lecturas operativas SQLite", () => {
    const root = process.cwd();
    const syncHook = fs.readFileSync(
      path.join(root, "src/hooks/useSyncAndBackup.ts"),
      "utf8",
    );
    const storage = fs.readFileSync(
      path.join(root, "src/database/storage.ts"),
      "utf8",
    );
    const sqliteDirectory = path.join(root, "src/database/sqlite");

    expect(syncHook).not.toContain("PendingSyncRepository");
    expect(syncHook).not.toContain("pendingSyncMirrorCoordinator");
    expect(storage).toContain("loadPendingOutbox()");
    expect(storage).toContain("savePendingOutbox(data.pendingSync || [])");
    expect(
      fs.readdirSync(sqliteDirectory).some(
        (name) => /pendingSyncReadGateway/i.test(name),
      ),
    ).toBe(false);
  });

  it("programa todos los espejos después del guardado canónico", () => {
    const storage = fs.readFileSync(
      path.join(process.cwd(), "src/database/storage.ts"),
      "utf8",
    );
    const canonicalWrite = storage.indexOf(
      "await saveMainSnapshotWithQuotaRecovery(data)",
    );
    const firstMirror = storage.indexOf(
      'import("./sqlite/catalogMirrorCoordinator")',
    );
    const pendingMirror = storage.indexOf(
      'import("./sqlite/pendingSyncMirrorCoordinator")',
    );

    expect(canonicalWrite).toBeGreaterThan(-1);
    expect(firstMirror).toBeGreaterThan(canonicalWrite);
    expect(pendingMirror).toBeGreaterThan(canonicalWrite);
  });
});
