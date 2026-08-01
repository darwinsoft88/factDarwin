const asyncStore = new Map<string, string>();

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async (key: string) => asyncStore.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    asyncStore.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    asyncStore.delete(key);
  })
}));

jest.mock("expo-crypto", () => {
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    randomUUID: jest.fn(() => "snapshot-generation-test"),
    digestStringAsync: jest.fn(async (_algorithm: string, value: string) => [
      value.length,
      value.slice(0, 32),
      value.slice(-32)
    ].join(":"))
  };
});

jest.mock("expo-file-system", () => {
  const files = new Map<string, string>();
  const controls = {
    failNextWrite: false,
    failNextMove: false
  };
  const normalize = (parts: unknown[]) => parts
    .map((part) => typeof part === "string" ? part : (part as { uri: string }).uri)
    .join("/")
    .replace(/\/+/g, "/");

  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = normalize(parts);
    }
    create() {}
  }

  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = normalize(parts);
    }
    get exists() {
      return files.has(this.uri);
    }
    async text() {
      const value = files.get(this.uri);
      if (value === undefined) throw new Error("file missing");
      return value;
    }
    create() {
      if (!files.has(this.uri)) files.set(this.uri, "");
    }
    write(value: string) {
      if (controls.failNextWrite) {
        controls.failNextWrite = false;
        throw new Error("simulated interrupted write");
      }
      files.set(this.uri, value);
    }
    delete() {
      files.delete(this.uri);
    }
    copy(destination: File) {
      const value = files.get(this.uri);
      if (value === undefined) throw new Error("source missing");
      files.set(destination.uri, value);
    }
    move(destination: File) {
      if (controls.failNextMove) {
        controls.failNextMove = false;
        throw new Error("simulated interrupted move");
      }
      const value = files.get(this.uri);
      if (value === undefined) throw new Error("source missing");
      files.set(destination.uri, value);
      files.delete(this.uri);
      this.uri = destination.uri;
    }
  }

  return {
    Directory,
    File,
    Paths: { document: new Directory("document") },
    __mockFs: { files, controls }
  };
});

import AsyncStorage from "@react-native-async-storage/async-storage";
import { digestStringAsync } from "expo-crypto";
import {
  confirmMainSnapshotMigration,
  readMainSnapshot,
  readMainSnapshotCatalogSource,
  readMainSnapshotDescriptor,
  writeMainSnapshot,
} from "../mainSnapshotStorage";

const LEGACY_KEY = "factura-sri-mobile:v1";
const CURRENT = "document/factudarwin/snapshot-current.json";
const BACKUP = "document/factudarwin/snapshot-backup.json";
const TEMP = "document/factudarwin/snapshot-temp.json";
const MIGRATION = "factura-sri-mobile:snapshot-file-migration:v1";

type MockFileSystem = {
  files: Map<string, string>;
  controls: { failNextWrite: boolean; failNextMove: boolean };
};

const mockFs = (jest.requireMock("expo-file-system") as { __mockFs: MockFileSystem }).__mockFs;

function snapshot(targetBytes = 0, marker = "current") {
  const data = {
    issuer: { ruc: "1723772099001" },
    users: [{ id: "user-1", companyId: "company-1" }],
    clients: [],
    products: [],
    sales: [],
    marker,
    padding: ""
  };
  if (targetBytes > 0) {
    const initial = JSON.stringify(data);
    data.padding = "x".repeat(Math.max(0, targetBytes - Buffer.byteLength(initial)));
  }
  return JSON.stringify(data);
}

function mockHash(value: string) {
  return [value.length, value.slice(0, 32), value.slice(-32)].join(":");
}

describe("mainSnapshotStorage native file migration", () => {
  beforeEach(() => {
    asyncStore.clear();
    mockFs.files.clear();
    mockFs.controls.failNextMove = false;
    mockFs.controls.failNextWrite = false;
    jest.clearAllMocks();
  });

  it.each([1, 6, 10, 20])("writes, rereads and survives a restart-sized read at %i MB", async (sizeMb) => {
    const original = snapshot(sizeMb * 1024 * 1024);
    await writeMainSnapshot(LEGACY_KEY, original);

    expect(await readMainSnapshot(LEGACY_KEY)).toBe(original);
    expect(mockFs.files.has(CURRENT)).toBe(true);
    expect(asyncStore.has(LEGACY_KEY)).toBe(false);

    expect(await readMainSnapshot(LEGACY_KEY)).toBe(original);
  });

  it("guarda hashes de catálogos y generación dentro del sobre verificado", async () => {
    await writeMainSnapshot(LEGACY_KEY, snapshot());
    const envelope = JSON.parse(mockFs.files.get(CURRENT) || "{}");

    expect(envelope).toMatchObject({
      schemaVersion: 6,
      snapshotGeneration: "snapshot-generation-test",
    });
    expect(typeof envelope.manifestHash).toBe("string");
    expect(typeof envelope.catalogHashes.clients).toBe("string");
    expect(typeof envelope.catalogHashes.products).toBe("string");
    expect(typeof envelope.catalogHashes.sales).toBe("string");
    expect(typeof envelope.catalogHashes.inventoryMovements).toBe("string");
    expect(typeof envelope.catalogHashes.creditPayments).toBe("string");
    expect(typeof envelope.catalogHashes.creditAdjustments).toBe("string");
    await expect(readMainSnapshotCatalogSource()).resolves.toMatchObject({
      snapshotGeneration: "snapshot-generation-test",
      catalogHashes: envelope.catalogHashes,
    });
  });

  it("reutiliza el sobre ya verificado durante el arranque SQLite", async () => {
    await writeMainSnapshot(LEGACY_KEY, snapshot());
    await readMainSnapshot(LEGACY_KEY);
    jest.mocked(digestStringAsync).mockClear();

    await readMainSnapshotDescriptor();
    await readMainSnapshotCatalogSource();
    await readMainSnapshotCatalogSource();

    expect(digestStringAsync).not.toHaveBeenCalled();
  });

  it("abre un sobre v4 y deriva los nuevos hashes de cartera", async () => {
    const original = snapshot();
    await writeMainSnapshot(LEGACY_KEY, original);
    const envelope = JSON.parse(mockFs.files.get(CURRENT) || "{}");
    envelope.schemaVersion = 4;
    delete envelope.manifestHash;
    mockFs.files.set(CURRENT, JSON.stringify(envelope));
    jest.mocked(digestStringAsync).mockClear();

    await expect(readMainSnapshot(LEGACY_KEY)).resolves.toBe(original);

    expect(digestStringAsync).toHaveBeenCalledTimes(11);
  });

  it("abre un sobre v5 validando su manifiesto antes de derivar cartera", async () => {
    const original = snapshot();
    await writeMainSnapshot(LEGACY_KEY, original);
    const envelope = JSON.parse(mockFs.files.get(CURRENT) || "{}");
    envelope.schemaVersion = 5;
    delete envelope.catalogHashes.creditPayments;
    delete envelope.catalogHashes.creditAdjustments;
    envelope.manifestHash = mockHash(JSON.stringify({
      schemaVersion: envelope.schemaVersion,
      companyId: envelope.companyId,
      issuerRuc: envelope.issuerRuc,
      createdAt: envelope.createdAt,
      snapshotGeneration: envelope.snapshotGeneration,
      payloadHash: envelope.payloadHash,
      catalogHashes: envelope.catalogHashes,
    }));
    mockFs.files.set(CURRENT, JSON.stringify(envelope));

    await expect(readMainSnapshot(LEGACY_KEY)).resolves.toBe(original);
    await expect(readMainSnapshotCatalogSource()).resolves.toMatchObject({
      catalogHashes: {
        creditPayments: expect.any(String),
        creditAdjustments: expect.any(String),
        receivedRetentions: expect.any(String),
        guides: expect.any(String),
      },
    });
  });

  it("rechaza un hash de catálogo desconectado aunque el hash global coincida", async () => {
    await writeMainSnapshot(LEGACY_KEY, snapshot());
    const envelope = JSON.parse(mockFs.files.get(CURRENT) || "{}");
    envelope.catalogHashes.clients = "hash-ajeno";
    mockFs.files.set(CURRENT, JSON.stringify(envelope));

    await expect(readMainSnapshot(LEGACY_KEY)).rejects.toMatchObject({
      code: "SNAPSHOT_FILE_CORRUPTED",
    });
  });

  it("lee sobres v1 y deriva hashes y generación sin reescribirlos", async () => {
    const rawPayload = snapshot();
    const payload = JSON.parse(rawPayload);
    mockFs.files.set(CURRENT, JSON.stringify({
      schemaVersion: 1,
      companyId: "company-1",
      issuerRuc: "1723772099001",
      createdAt: "2026-07-28T00:00:00.000Z",
      payloadHash: mockHash(JSON.stringify(payload)),
      payload,
    }));

    await expect(readMainSnapshot(LEGACY_KEY)).resolves.toBe(rawPayload);
    await expect(readMainSnapshotCatalogSource()).resolves.toMatchObject({
      snapshotGeneration: expect.stringMatching(/^legacy:/),
      catalogHashes: {
        clients: expect.any(String),
        products: expect.any(String),
        sales: expect.any(String),
        inventoryMovements: expect.any(String),
      },
    });
    expect(JSON.parse(mockFs.files.get(CURRENT) || "{}").schemaVersion).toBe(1);
  });

  it("verifica también el hash de movimientos de inventario", async () => {
    const payload = JSON.parse(snapshot());
    payload.inventoryMovements = [{
      id: "movement-1",
      productId: "product-1",
      type: "entrada",
      quantity: 1,
      stockBefore: 0,
      stockAfter: 1,
    }];
    await writeMainSnapshot(LEGACY_KEY, JSON.stringify(payload));
    const envelope = JSON.parse(mockFs.files.get(CURRENT) || "{}");
    envelope.catalogHashes.inventoryMovements = "hash-ajeno";
    mockFs.files.set(CURRENT, JSON.stringify(envelope));
    await expect(readMainSnapshot(LEGACY_KEY)).rejects.toMatchObject({
      code: "SNAPSHOT_FILE_CORRUPTED",
    });
  });

  it("lee sobres v2 conservando su generación y deriva salesHash", async () => {
    await writeMainSnapshot(LEGACY_KEY, snapshot());
    const envelope = JSON.parse(mockFs.files.get(CURRENT) || "{}");
    envelope.schemaVersion = 2;
    envelope.clientsHash = envelope.catalogHashes.clients;
    envelope.productsHash = envelope.catalogHashes.products;
    delete envelope.catalogHashes;
    delete envelope.manifestHash;
    mockFs.files.set(CURRENT, JSON.stringify(envelope));

    await expect(readMainSnapshotCatalogSource()).resolves.toMatchObject({
      snapshotGeneration: "snapshot-generation-test",
      catalogHashes: {
        sales: expect.any(String),
        inventoryMovements: expect.any(String),
      },
      sales: [],
    });
    expect(JSON.parse(mockFs.files.get(CURRENT) || "{}").schemaVersion).toBe(2);
  });

  it("lee sobres v3 y deriva la estructura catalogHashes", async () => {
    await writeMainSnapshot(LEGACY_KEY, snapshot());
    const envelope = JSON.parse(mockFs.files.get(CURRENT) || "{}");
    envelope.schemaVersion = 3;
    envelope.clientsHash = envelope.catalogHashes.clients;
    envelope.productsHash = envelope.catalogHashes.products;
    envelope.salesHash = envelope.catalogHashes.sales;
    delete envelope.catalogHashes;
    delete envelope.manifestHash;
    mockFs.files.set(CURRENT, JSON.stringify(envelope));

    await expect(readMainSnapshotCatalogSource()).resolves.toMatchObject({
      snapshotGeneration: "snapshot-generation-test",
      catalogHashes: {
        clients: expect.any(String),
        products: expect.any(String),
        sales: expect.any(String),
        inventoryMovements: expect.any(String),
      },
      inventoryMovements: [],
    });
  });

  it("migrates legacy data only after current was reread and validated", async () => {
    const legacy = snapshot(0, "legacy");
    asyncStore.set(LEGACY_KEY, legacy);

    expect(await readMainSnapshot(LEGACY_KEY)).toBe(legacy);
    expect(mockFs.files.has(CURRENT)).toBe(true);
    expect(asyncStore.has(MIGRATION)).toBe(true);
    expect(AsyncStorage.removeItem).not.toHaveBeenCalledWith(LEGACY_KEY);
    expect(asyncStore.get(LEGACY_KEY)).toBe(legacy);

    await confirmMainSnapshotMigration(LEGACY_KEY);
    expect(asyncStore.get(LEGACY_KEY)).toBe(legacy);

    const marker = JSON.parse(asyncStore.get(MIGRATION) || "{}");
    asyncStore.set(MIGRATION, JSON.stringify({
      ...marker,
      migrationInstanceId: "previous-app-instance",
      appDataValidated: true
    }));
    await confirmMainSnapshotMigration(LEGACY_KEY);
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(LEGACY_KEY);
    expect(asyncStore.has(LEGACY_KEY)).toBe(false);
  });

  it("keeps legacy data intact when migration is interrupted", async () => {
    const legacy = snapshot(0, "legacy");
    asyncStore.set(LEGACY_KEY, legacy);
    mockFs.controls.failNextMove = true;

    await expect(readMainSnapshot(LEGACY_KEY)).rejects.toMatchObject({
      code: "SNAPSHOT_MIGRATION_FAILED",
      originalPreserved: true
    });
    expect(asyncStore.get(LEGACY_KEY)).toBe(legacy);
    expect(mockFs.files.has(TEMP)).toBe(true);
  });

  it("keeps legacy data when cleanup fails after a validated restart", async () => {
    const legacy = snapshot(0, "legacy");
    asyncStore.set(LEGACY_KEY, legacy);
    expect(await readMainSnapshot(LEGACY_KEY)).toBe(legacy);
    await confirmMainSnapshotMigration(LEGACY_KEY);
    const marker = JSON.parse(asyncStore.get(MIGRATION) || "{}");
    asyncStore.set(MIGRATION, JSON.stringify({
      ...marker,
      migrationInstanceId: "previous-app-instance",
      appDataValidated: true
    }));
    (AsyncStorage.removeItem as jest.Mock).mockRejectedValueOnce(new Error("remove failed"));

    await confirmMainSnapshotMigration(LEGACY_KEY);
    expect(asyncStore.get(LEGACY_KEY)).toBe(legacy);
    await confirmMainSnapshotMigration(LEGACY_KEY);
    expect(asyncStore.has(LEGACY_KEY)).toBe(false);
  });

  it("recovers the last valid backup when current JSON is damaged", async () => {
    const first = snapshot(0, "first");
    const second = snapshot(0, "second");
    await writeMainSnapshot(LEGACY_KEY, first);
    await writeMainSnapshot(LEGACY_KEY, second);
    mockFs.files.set(CURRENT, "{json-dañado");

    expect(await readMainSnapshot(LEGACY_KEY)).toBe(first);
    expect(mockFs.files.get(TEMP)).toBe("{json-dañado");
    expect(mockFs.files.has(BACKUP)).toBe(true);
  });

  it("recovers the backup when current is truncated", async () => {
    const first = snapshot(0, "first");
    await writeMainSnapshot(LEGACY_KEY, first);
    await writeMainSnapshot(LEGACY_KEY, snapshot(0, "second"));
    const current = mockFs.files.get(CURRENT) || "";
    mockFs.files.set(CURRENT, current.slice(0, Math.floor(current.length / 2)));

    expect(await readMainSnapshot(LEGACY_KEY)).toBe(first);
  });

  it("rejects damaged current and backup without creating empty data", async () => {
    mockFs.files.set(CURRENT, "{damaged");
    mockFs.files.set(BACKUP, "{\"schemaVersion\":1}");

    await expect(readMainSnapshot(LEGACY_KEY)).rejects.toMatchObject({
      code: "SNAPSHOT_FILE_CORRUPTED",
      originalPreserved: true
    });
    expect(mockFs.files.get(CURRENT)).toBe("{damaged");
    expect(asyncStore.has(LEGACY_KEY)).toBe(false);
  });
});
