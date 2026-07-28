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
import { confirmMainSnapshotMigration, readMainSnapshot, writeMainSnapshot } from "../mainSnapshotStorage";

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
