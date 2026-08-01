import AsyncStorage from "@react-native-async-storage/async-storage";
import type { File } from "expo-file-system";
import type {
  Client,
  CreditAdjustment,
  CreditPayment,
  InventoryMovement,
  Product,
  PendingSyncItem,
  ReceivedRetention,
  RemissionGuide,
  Sale,
} from "../types";
import {
  calculateCatalogSnapshotHashes,
  type CatalogSnapshotHashes,
} from "./catalogSnapshotHashes";

const DATABASE_NAME = "factudarwin-local";
const DATABASE_VERSION = 1;
const STORE_NAME = "snapshots";
const CURRENT_SNAPSHOT_KEY = "current";

const SNAPSHOT_DIRECTORY = "factudarwin";
const CURRENT_FILE = "snapshot-current.json";
const BACKUP_FILE = "snapshot-backup.json";
const TEMP_FILE = "snapshot-temp.json";
const METADATA_FILE = "snapshot-metadata.json";
const MIGRATION_KEY = "factura-sri-mobile:snapshot-file-migration:v1";
const ENVELOPE_VERSION = 6;
const STORAGE_INSTANCE_ID = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

type SnapshotEnvelopeV1 = {
  schemaVersion: 1;
  companyId: string;
  issuerRuc: string;
  createdAt: string;
  payloadHash: string;
  payload: unknown;
};

type SnapshotEnvelope = {
  schemaVersion: 6;
  companyId: string;
  issuerRuc: string;
  createdAt: string;
  snapshotGeneration: string;
  payloadHash: string;
  catalogHashes: CatalogSnapshotHashes;
  manifestHash: string;
  payload: unknown;
};

type LegacyCatalogSnapshotHashes = Omit<
  CatalogSnapshotHashes,
  "creditPayments" | "creditAdjustments"
>;

type SnapshotEnvelopeV5 = Omit<
  SnapshotEnvelope,
  "schemaVersion" | "catalogHashes"
> & {
  schemaVersion: 5;
  catalogHashes: LegacyCatalogSnapshotHashes;
};

type SnapshotEnvelopeV2 = Omit<SnapshotEnvelopeV1, "schemaVersion"> & {
  schemaVersion: 2;
  snapshotGeneration: string;
  clientsHash: string;
  productsHash: string;
};

type SnapshotEnvelopeV3 = Omit<SnapshotEnvelopeV2, "schemaVersion"> & {
  schemaVersion: 3;
  salesHash: string;
};

type SnapshotEnvelopeV4 = Omit<
  SnapshotEnvelopeV5,
  "schemaVersion" | "manifestHash"
> & {
  schemaVersion: 4;
};

type SnapshotMetadata = {
  schemaVersion: 6;
  companyId: string;
  issuerRuc: string;
  snapshotGeneration: string;
  payloadHash: string;
  catalogHashes: CatalogSnapshotHashes;
  updatedAt: string;
  source: "write" | "migration" | "backup-recovery";
};

let lastVerifiedSnapshotDescriptor: MainSnapshotDescriptor | null = null;
let lastVerifiedCurrentEnvelope: SnapshotEnvelope | null = null;

export type MainSnapshotDescriptor = {
  schemaVersion: number;
  companyId: string;
  issuerRuc: string;
  snapshotGeneration: string;
  payloadHash: string;
  catalogHashes: CatalogSnapshotHashes;
  createdAt: string;
};

export type MainSnapshotClientsSource = MainSnapshotDescriptor & {
  clients: Client[];
};

export type MainSnapshotProductsSource = MainSnapshotDescriptor & {
  products: Product[];
};

export type MainSnapshotCatalogSource = MainSnapshotDescriptor & {
  clients: Client[];
  products: Product[];
  sales: Sale[];
  inventoryMovements: InventoryMovement[];
  creditPayments?: CreditPayment[];
  creditAdjustments?: CreditAdjustment[];
  receivedRetentions?: ReceivedRetention[];
  guides?: RemissionGuide[];
  pendingSync?: PendingSyncItem[];
};

export type MainSnapshotStorageErrorCode =
  | "SNAPSHOT_FILE_CORRUPTED"
  | "SNAPSHOT_FILE_WRITE_FAILED"
  | "SNAPSHOT_MIGRATION_FAILED";

export class MainSnapshotStorageError extends Error {
  readonly code: MainSnapshotStorageErrorCode;
  readonly originalPreserved: boolean;

  constructor(code: MainSnapshotStorageErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "MainSnapshotStorageError";
    this.code = code;
    this.originalPreserved = true;
    if (cause !== undefined) {
      Object.defineProperty(this, "cause", { value: cause, enumerable: false });
    }
  }
}

function indexedDbAvailable() {
  return typeof indexedDB !== "undefined";
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("No se pudo abrir el almacenamiento local."));
    request.onblocked = () => reject(new Error("El almacenamiento local está bloqueado por otra ventana."));
  });
}

async function readFromIndexedDb(): Promise<string | null> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(CURRENT_SNAPSHOT_KEY);
      request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : null);
      request.onerror = () => reject(request.error || new Error("No se pudo leer el almacenamiento local."));
      transaction.onabort = () => reject(transaction.error || new Error("Se interrumpió la lectura del almacenamiento local."));
    });
  } finally {
    database.close();
  }
}

async function writeToIndexedDb(value: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(value, CURRENT_SNAPSHOT_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("No se pudo actualizar el almacenamiento local."));
      transaction.onabort = () => reject(transaction.error || new Error("Se interrumpió la actualización del almacenamiento local."));
    });
  } finally {
    database.close();
  }
}

async function snapshotDirectory() {
  const { Directory, Paths } = await import("expo-file-system");
  return new Directory(Paths.document, SNAPSHOT_DIRECTORY);
}

async function snapshotFile(name: string) {
  const { File } = await import("expo-file-system");
  return new File(await snapshotDirectory(), name);
}

async function ensureSnapshotDirectory() {
  const directory = await snapshotDirectory();
  directory.create({ intermediates: true, idempotent: true });
}

function safeDelete(file: File) {
  if (file.exists) file.delete();
}

function payloadIdentity(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("El snapshot no contiene un objeto válido.");
  }
  const snapshot = payload as {
    issuer?: { ruc?: unknown };
    users?: Array<{ companyId?: unknown }>;
  };
  const issuerRuc = String(snapshot.issuer?.ruc || "").replace(/\D/g, "");
  const companyId = String(snapshot.users?.find((user) => user?.companyId)?.companyId || "").trim();
  return { companyId, issuerRuc };
}

async function hashPayload(payload: unknown) {
  const { CryptoDigestAlgorithm, digestStringAsync } = await import("expo-crypto");
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify(payload));
}

function manifestValue(
  envelope: Omit<SnapshotEnvelope, "manifestHash" | "payload">,
) {
  return {
    schemaVersion: envelope.schemaVersion,
    companyId: envelope.companyId,
    issuerRuc: envelope.issuerRuc,
    createdAt: envelope.createdAt,
    snapshotGeneration: envelope.snapshotGeneration,
    payloadHash: envelope.payloadHash,
    catalogHashes: envelope.catalogHashes,
  };
}

async function hashManifest(
  envelope: Omit<SnapshotEnvelope, "manifestHash" | "payload">,
) {
  const { CryptoDigestAlgorithm, digestStringAsync } =
    await import("expo-crypto");
  return digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    JSON.stringify(manifestValue(envelope)),
  );
}

async function createEnvelope(rawPayload: string): Promise<SnapshotEnvelope> {
  const payload = JSON.parse(rawPayload) as unknown;
  const identity = payloadIdentity(payload);
  const catalogHashes = await calculateCatalogSnapshotHashes(payload);
  const { CryptoDigestAlgorithm, digestStringAsync, randomUUID } =
    await import("expo-crypto");
  const base = {
    schemaVersion: ENVELOPE_VERSION as 6,
    companyId: identity.companyId,
    issuerRuc: identity.issuerRuc,
    createdAt: new Date().toISOString(),
    snapshotGeneration: randomUUID(),
    payloadHash: await digestStringAsync(
      CryptoDigestAlgorithm.SHA256,
      rawPayload,
    ),
    catalogHashes,
  } as const;
  return {
    ...base,
    manifestHash: await hashManifest(base),
    payload,
  };
}

async function parseAndValidateEnvelope(raw: string): Promise<SnapshotEnvelope> {
  const parsed = JSON.parse(raw) as Partial<
    SnapshotEnvelope | SnapshotEnvelopeV5 | SnapshotEnvelopeV4 | SnapshotEnvelopeV3 |
      SnapshotEnvelopeV2 | SnapshotEnvelopeV1
  >;
  if (
    (
      parsed.schemaVersion !== 1 &&
      parsed.schemaVersion !== 2 &&
      parsed.schemaVersion !== 3 &&
      parsed.schemaVersion !== 4 &&
      parsed.schemaVersion !== 5 &&
      parsed.schemaVersion !== ENVELOPE_VERSION
    ) ||
    !parsed.payload ||
    typeof parsed.payload !== "object" ||
    Array.isArray(parsed.payload) ||
    typeof parsed.payloadHash !== "string" ||
    typeof parsed.companyId !== "string" ||
    typeof parsed.issuerRuc !== "string"
  ) {
    throw new Error("La estructura del archivo local no es válida.");
  }
  const identity = payloadIdentity(parsed.payload);
  if (parsed.companyId !== identity.companyId || parsed.issuerRuc !== identity.issuerRuc) {
    throw new Error("El archivo local pertenece a otra empresa o fue alterado.");
  }
  const actualHash = await hashPayload(parsed.payload);
  if (actualHash !== parsed.payloadHash) {
    throw new Error("La verificación de integridad del archivo local falló.");
  }
  if (parsed.schemaVersion === ENVELOPE_VERSION) {
    const current = parsed as Partial<SnapshotEnvelope>;
    if (
      typeof current.snapshotGeneration !== "string" ||
      !current.snapshotGeneration ||
      !current.catalogHashes ||
      typeof current.catalogHashes.creditPayments !== "string" ||
      typeof current.catalogHashes.creditAdjustments !== "string" ||
      typeof current.manifestHash !== "string"
    ) {
      throw new Error("La verificación de los catálogos locales falló.");
    }
    const expectedManifestHash = await hashManifest(
      current as Omit<SnapshotEnvelope, "manifestHash" | "payload">,
    );
    if (current.manifestHash !== expectedManifestHash) {
      throw new Error("La verificaciÃ³n del manifiesto local fallÃ³.");
    }
    if (
      typeof current.catalogHashes.receivedRetentions !== "string" ||
      typeof current.catalogHashes.guides !== "string" ||
      typeof current.catalogHashes.pendingSync !== "string"
    ) {
      const upgraded = {
        ...current,
        catalogHashes: await calculateCatalogSnapshotHashes(current.payload),
      } as Omit<SnapshotEnvelope, "manifestHash">;
      return {
        ...upgraded,
        manifestHash: await hashManifest(upgraded),
      } as SnapshotEnvelope;
    }
    return current as SnapshotEnvelope;
  }
  if (parsed.schemaVersion === 5) {
    const legacyV5 = parsed as SnapshotEnvelopeV5;
    const legacyManifestValue = {
      schemaVersion: legacyV5.schemaVersion,
      companyId: legacyV5.companyId,
      issuerRuc: legacyV5.issuerRuc,
      createdAt: legacyV5.createdAt,
      snapshotGeneration: legacyV5.snapshotGeneration,
      payloadHash: legacyV5.payloadHash,
      catalogHashes: legacyV5.catalogHashes,
    };
    const { CryptoDigestAlgorithm, digestStringAsync } =
      await import("expo-crypto");
    const expected = await digestStringAsync(
      CryptoDigestAlgorithm.SHA256,
      JSON.stringify(legacyManifestValue),
    );
    if (legacyV5.manifestHash !== expected) {
      throw new Error("La verificación del manifiesto local falló.");
    }
  }
  if (parsed.schemaVersion === 4) {
    const legacyV4 = parsed as Partial<SnapshotEnvelopeV4>;
    const hashes = legacyV4.catalogHashes;
    if (
      typeof legacyV4.snapshotGeneration !== "string" ||
      !legacyV4.snapshotGeneration ||
      !hashes ||
      typeof hashes.clients !== "string" ||
      typeof hashes.products !== "string" ||
      typeof hashes.sales !== "string" ||
      typeof hashes.inventoryMovements !== "string"
    ) {
      throw new Error("La estructura de catÃ¡logos del archivo local no es vÃ¡lida.");
    }
    const base = {
      ...legacyV4,
      schemaVersion: ENVELOPE_VERSION as 6,
      snapshotGeneration: legacyV4.snapshotGeneration,
      catalogHashes: await calculateCatalogSnapshotHashes(
        legacyV4.payload,
      ),
    } as Omit<SnapshotEnvelope, "manifestHash">;
    return {
      ...base,
      manifestHash: await hashManifest(base),
    };
  }
  const catalogHashes = await calculateCatalogSnapshotHashes(parsed.payload);
  const legacy = parsed as
    SnapshotEnvelopeV1 | SnapshotEnvelopeV2 | SnapshotEnvelopeV3 |
      SnapshotEnvelopeV4 | SnapshotEnvelopeV5;
  const base = {
    ...legacy,
    schemaVersion: ENVELOPE_VERSION as 6,
    snapshotGeneration: legacy.schemaVersion === 2 ||
        legacy.schemaVersion === 3 ||
        legacy.schemaVersion === 4 ||
        legacy.schemaVersion === 5
      ? legacy.snapshotGeneration
      : `legacy:${legacy.payloadHash}`,
    catalogHashes,
  };
  return {
    ...base,
    manifestHash: await hashManifest(base),
  };
}

async function readValidatedFile(file: File) {
  if (!file.exists) return null;
  return parseAndValidateEnvelope(await file.text());
}

function rememberCurrentEnvelope(envelope: SnapshotEnvelope) {
  lastVerifiedCurrentEnvelope = envelope;
  lastVerifiedSnapshotDescriptor = {
    schemaVersion: envelope.schemaVersion,
    companyId: envelope.companyId,
    issuerRuc: envelope.issuerRuc,
    snapshotGeneration: envelope.snapshotGeneration,
    payloadHash: envelope.payloadHash,
    catalogHashes: { ...envelope.catalogHashes },
    createdAt: envelope.createdAt,
  };
}

async function readCurrentEnvelopeForMirror(): Promise<SnapshotEnvelope | null> {
  if (lastVerifiedCurrentEnvelope) return lastVerifiedCurrentEnvelope;
  const envelope = await readValidatedFile(await snapshotFile(CURRENT_FILE));
  if (envelope) rememberCurrentEnvelope(envelope);
  return envelope;
}

function payloadString(envelope: SnapshotEnvelope) {
  return JSON.stringify(envelope.payload);
}

async function writeMetadata(envelope: SnapshotEnvelope, source: SnapshotMetadata["source"]) {
  const metadata: SnapshotMetadata = {
    schemaVersion: ENVELOPE_VERSION,
    companyId: envelope.companyId,
    issuerRuc: envelope.issuerRuc,
    snapshotGeneration: envelope.snapshotGeneration,
    payloadHash: envelope.payloadHash,
    catalogHashes: { ...envelope.catalogHashes },
    updatedAt: new Date().toISOString(),
    source
  };
  const file = await snapshotFile(METADATA_FILE);
  file.create({ intermediates: true, overwrite: true });
  file.write(JSON.stringify(metadata));
}

async function preserveValidCurrentAsBackup() {
  const current = await snapshotFile(CURRENT_FILE);
  if (!current.exists) return;
  if (!lastVerifiedCurrentEnvelope) {
    try {
      await readValidatedFile(current);
    } catch {
      return;
    }
  }
  const backup = await snapshotFile(BACKUP_FILE);
  safeDelete(backup);
  current.copy(backup);
}

async function promoteValidatedTemp(envelope: SnapshotEnvelope, source: SnapshotMetadata["source"]) {
  const temp = await snapshotFile(TEMP_FILE);
  const current = await snapshotFile(CURRENT_FILE);
  const backup = await snapshotFile(BACKUP_FILE);

  await preserveValidCurrentAsBackup();
  try {
    safeDelete(current);
    temp.move(current);
    if (!current.exists) {
      throw new Error("El archivo promovido no superó la verificación final.");
    }
    await writeMetadata(envelope, source);
    rememberCurrentEnvelope(envelope);
    return envelope;
  } catch (error) {
    if (!current.exists && backup.exists) {
      backup.copy(current);
    }
    throw error;
  }
}

async function writeNativeSnapshot(rawPayload: string, source: SnapshotMetadata["source"]) {
  await ensureSnapshotDirectory();
  const envelope = await createEnvelope(rawPayload);
  const temp = await snapshotFile(TEMP_FILE);
  temp.create({ intermediates: true, overwrite: true });
  temp.write(JSON.stringify(envelope));
  const verifiedTemp = await readValidatedFile(temp);
  if (!verifiedTemp || verifiedTemp.payloadHash !== envelope.payloadHash) {
    throw new Error("El archivo temporal no superó la verificación.");
  }
  return promoteValidatedTemp(verifiedTemp, source);
}

async function recoverFromBackup() {
  const backup = await snapshotFile(BACKUP_FILE);
  const envelope = await readValidatedFile(backup);
  if (!envelope) return null;

  const damagedCurrent = await snapshotFile(CURRENT_FILE);
  const temp = await snapshotFile(TEMP_FILE);
  if (damagedCurrent.exists) {
    safeDelete(temp);
    damagedCurrent.move(temp);
  }
  const restoredCurrent = await snapshotFile(CURRENT_FILE);
  backup.copy(restoredCurrent);
  const verified = await readValidatedFile(restoredCurrent);
  if (!verified) throw new Error("No se pudo recuperar el respaldo local.");
  rememberCurrentEnvelope(verified);
  await writeMetadata(verified, "backup-recovery");
  return verified;
}

async function readNativeSnapshot(legacyKey: string) {
  await ensureSnapshotDirectory();
  const current = await snapshotFile(CURRENT_FILE);
  if (current.exists) {
    try {
      const envelope = await readValidatedFile(current);
      if (envelope) {
        rememberCurrentEnvelope(envelope);
        return payloadString(envelope);
      }
    } catch (currentError) {
      try {
        const recovered = await recoverFromBackup();
        if (recovered) return payloadString(recovered);
      } catch (backupError) {
        throw new MainSnapshotStorageError(
          "SNAPSHOT_FILE_CORRUPTED",
          "Los archivos locales principal y de respaldo están dañados. Se conservaron para recuperación.",
          { currentError, backupError }
        );
      }
      throw new MainSnapshotStorageError(
        "SNAPSHOT_FILE_CORRUPTED",
        "El archivo local está dañado y no existe un respaldo válido. Se conservó para recuperación.",
        currentError
      );
    }
  }

  if ((await snapshotFile(BACKUP_FILE)).exists) {
    try {
      const recovered = await recoverFromBackup();
      if (recovered) return payloadString(recovered);
    } catch (error) {
      throw new MainSnapshotStorageError(
        "SNAPSHOT_FILE_CORRUPTED",
        "El respaldo local está dañado. Se conservó para recuperación.",
        error
      );
    }
  }

  const legacy = await AsyncStorage.getItem(legacyKey);
  if (legacy === null) return null;

  try {
    const envelope = await writeNativeSnapshot(legacy, "migration");
    const reread = await readValidatedFile(await snapshotFile(CURRENT_FILE));
    if (!reread || reread.payloadHash !== envelope.payloadHash) {
      throw new Error("La verificación posterior a la migración falló.");
    }
    rememberCurrentEnvelope(reread);
    await AsyncStorage.setItem(MIGRATION_KEY, JSON.stringify({
      completedAt: new Date().toISOString(),
      payloadHash: reread.payloadHash,
      issuerRuc: reread.issuerRuc,
      migrationInstanceId: STORAGE_INSTANCE_ID,
      appDataValidated: false
    }));
    return payloadString(reread);
  } catch (error) {
    throw new MainSnapshotStorageError(
      "SNAPSHOT_MIGRATION_FAILED",
      "No se pudo migrar la información local al archivo privado. Los datos anteriores fueron conservados.",
      error
    );
  }
}

export async function confirmMainSnapshotMigration(legacyKey: string): Promise<void> {
  if (indexedDbAvailable()) return;
  const markerRaw = await AsyncStorage.getItem(MIGRATION_KEY);
  if (!markerRaw) return;

  try {
    const marker = JSON.parse(markerRaw) as {
      payloadHash?: unknown;
      issuerRuc?: unknown;
      migrationInstanceId?: unknown;
      appDataValidated?: unknown;
      validatedAt?: unknown;
    };
    const current = await readValidatedFile(await snapshotFile(CURRENT_FILE));
    if (
      !current ||
      marker.payloadHash !== current.payloadHash ||
      marker.issuerRuc !== current.issuerRuc
    ) {
      return;
    }

    if (marker.appDataValidated !== true) {
      await AsyncStorage.setItem(MIGRATION_KEY, JSON.stringify({
        ...marker,
        appDataValidated: true,
        validatedAt: new Date().toISOString()
      }));
      return;
    }

    if (marker.migrationInstanceId === STORAGE_INSTANCE_ID) return;
    await AsyncStorage.removeItem(legacyKey);
  } catch {
    // Cualquier fallo conserva el snapshot legacy; la aplicación continúa con current validado.
  }
}

export async function readMainSnapshot(legacyKey: string): Promise<string | null> {
  if (!indexedDbAvailable()) return readNativeSnapshot(legacyKey);

  try {
    const stored = await readFromIndexedDb();
    if (stored !== null) return stored;

    const legacy = await AsyncStorage.getItem(legacyKey);
    if (legacy === null) return null;

    await writeToIndexedDb(legacy);
    const verified = await readFromIndexedDb();
    if (verified !== legacy) throw new Error("La verificación de IndexedDB falló.");
    await AsyncStorage.removeItem(legacyKey);
    return verified;
  } catch {
    return AsyncStorage.getItem(legacyKey);
  }
}

export async function readMainSnapshotDescriptor(): Promise<MainSnapshotDescriptor | null> {
  if (indexedDbAvailable()) return null;
  const envelope = await readCurrentEnvelopeForMirror();
  if (!envelope) return null;
  return {
    schemaVersion: envelope.schemaVersion,
    companyId: envelope.companyId,
    issuerRuc: envelope.issuerRuc,
    snapshotGeneration: envelope.snapshotGeneration,
    payloadHash: envelope.payloadHash,
    catalogHashes: { ...envelope.catalogHashes },
    createdAt: envelope.createdAt
  };
}

export async function readMainSnapshotFastDescriptor():
  Promise<MainSnapshotDescriptor | null> {
  if (indexedDbAvailable()) return null;
  if (lastVerifiedSnapshotDescriptor) {
    return { ...lastVerifiedSnapshotDescriptor };
  }
  const file = await snapshotFile(METADATA_FILE);
  if (!file.exists) return null;
  const metadata = JSON.parse(await file.text()) as Partial<SnapshotMetadata>;
  if (
    metadata.schemaVersion !== ENVELOPE_VERSION ||
    typeof metadata.companyId !== "string" ||
    typeof metadata.issuerRuc !== "string" ||
    typeof metadata.snapshotGeneration !== "string" ||
    typeof metadata.payloadHash !== "string" ||
    !metadata.catalogHashes ||
    typeof metadata.catalogHashes.clients !== "string" ||
    typeof metadata.catalogHashes.products !== "string" ||
    typeof metadata.catalogHashes.sales !== "string" ||
    typeof metadata.catalogHashes.inventoryMovements !== "string" ||
    typeof metadata.catalogHashes.creditPayments !== "string" ||
    typeof metadata.catalogHashes.creditAdjustments !== "string" ||
    typeof metadata.updatedAt !== "string"
  ) {
    throw new Error("El recibo del snapshot local no es válido.");
  }
  return {
    schemaVersion: metadata.schemaVersion,
    companyId: metadata.companyId,
    issuerRuc: metadata.issuerRuc,
    snapshotGeneration: metadata.snapshotGeneration,
    payloadHash: metadata.payloadHash,
    catalogHashes: { ...metadata.catalogHashes },
    createdAt: metadata.updatedAt,
  };
}

export async function readMainSnapshotClientsSource(): Promise<MainSnapshotClientsSource | null> {
  if (indexedDbAvailable()) return null;
  const envelope = await readCurrentEnvelopeForMirror();
  if (!envelope) return null;
  const payload = envelope.payload as { clients?: unknown };
  if (!Array.isArray(payload.clients)) {
    throw new Error("El snapshot validado no contiene una colección de clientes.");
  }
  return {
    schemaVersion: envelope.schemaVersion,
    companyId: envelope.companyId,
    issuerRuc: envelope.issuerRuc,
    snapshotGeneration: envelope.snapshotGeneration,
    payloadHash: envelope.payloadHash,
    catalogHashes: { ...envelope.catalogHashes },
    createdAt: envelope.createdAt,
    clients: payload.clients as Client[]
  };
}

export async function readMainSnapshotProductsSource(): Promise<MainSnapshotProductsSource | null> {
  if (indexedDbAvailable()) return null;
  const envelope = await readCurrentEnvelopeForMirror();
  if (!envelope) return null;
  const payload = envelope.payload as { products?: unknown };
  if (!Array.isArray(payload.products)) {
    throw new Error("El snapshot validado no contiene una colección de productos.");
  }
  return {
    schemaVersion: envelope.schemaVersion,
    companyId: envelope.companyId,
    issuerRuc: envelope.issuerRuc,
    snapshotGeneration: envelope.snapshotGeneration,
    payloadHash: envelope.payloadHash,
    catalogHashes: { ...envelope.catalogHashes },
    createdAt: envelope.createdAt,
    products: payload.products as Product[]
  };
}

export async function readMainSnapshotCatalogSource(): Promise<MainSnapshotCatalogSource | null> {
  if (indexedDbAvailable()) return null;
  const envelope = await readCurrentEnvelopeForMirror();
  if (!envelope) return null;
  const payload = envelope.payload as {
    clients?: unknown;
    products?: unknown;
    sales?: unknown;
    inventoryMovements?: unknown;
    creditPayments?: unknown;
    creditAdjustments?: unknown;
    receivedRetentions?: unknown;
    guides?: unknown;
    pendingSync?: unknown;
  };
  const sales = payload.sales === undefined ? [] : payload.sales;
  const inventoryMovements = payload.inventoryMovements === undefined
    ? []
    : payload.inventoryMovements;
  const creditPayments = payload.creditPayments === undefined
    ? []
    : payload.creditPayments;
  const creditAdjustments = payload.creditAdjustments === undefined
    ? []
    : payload.creditAdjustments;
  const receivedRetentions = payload.receivedRetentions === undefined
    ? []
    : payload.receivedRetentions;
  const guides = payload.guides === undefined ? [] : payload.guides;
  const pendingSync = payload.pendingSync === undefined
    ? []
    : payload.pendingSync;
  if (
    !Array.isArray(payload.clients) ||
    !Array.isArray(payload.products) ||
    !Array.isArray(sales) ||
    !Array.isArray(inventoryMovements) ||
    !Array.isArray(creditPayments) ||
    !Array.isArray(creditAdjustments) ||
    !Array.isArray(receivedRetentions) ||
    !Array.isArray(guides) ||
    !Array.isArray(pendingSync)
  ) {
    throw new Error("El snapshot validado no contiene los catálogos requeridos.");
  }
  return {
    schemaVersion: envelope.schemaVersion,
    companyId: envelope.companyId,
    issuerRuc: envelope.issuerRuc,
    snapshotGeneration: envelope.snapshotGeneration,
    payloadHash: envelope.payloadHash,
    catalogHashes: { ...envelope.catalogHashes },
    createdAt: envelope.createdAt,
    clients: payload.clients as Client[],
    products: payload.products as Product[],
    sales: sales as Sale[],
    inventoryMovements: inventoryMovements as InventoryMovement[],
    creditPayments: creditPayments as CreditPayment[],
    creditAdjustments: creditAdjustments as CreditAdjustment[],
    receivedRetentions: receivedRetentions as ReceivedRetention[],
    guides: guides as RemissionGuide[],
    pendingSync: pendingSync as PendingSyncItem[],
  };
}

export async function writeMainSnapshot(
  legacyKey: string,
  value: string,
): Promise<MainSnapshotDescriptor | null> {
  if (!indexedDbAvailable()) {
    try {
      const envelope = await writeNativeSnapshot(value, "write");
      return {
        schemaVersion: envelope.schemaVersion,
        companyId: envelope.companyId,
        issuerRuc: envelope.issuerRuc,
        snapshotGeneration: envelope.snapshotGeneration,
        payloadHash: envelope.payloadHash,
        catalogHashes: { ...envelope.catalogHashes },
        createdAt: envelope.createdAt,
      };
    } catch (error) {
      throw new MainSnapshotStorageError(
        "SNAPSHOT_FILE_WRITE_FAILED",
        "No se pudo guardar la información en el archivo privado. La versión anterior fue conservada.",
        error
      );
    }
  }

  await writeToIndexedDb(value);
  const verified = await readFromIndexedDb();
  if (verified !== value) throw new Error("La verificación de IndexedDB falló.");
  await AsyncStorage.removeItem(legacyKey).catch(() => undefined);
  return null;
}
