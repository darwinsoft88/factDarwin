import AsyncStorage from "@react-native-async-storage/async-storage";
import type { File } from "expo-file-system";

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
const ENVELOPE_VERSION = 1;
const STORAGE_INSTANCE_ID = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

type SnapshotEnvelope = {
  schemaVersion: 1;
  companyId: string;
  issuerRuc: string;
  createdAt: string;
  payloadHash: string;
  payload: unknown;
};

type SnapshotMetadata = {
  schemaVersion: 1;
  companyId: string;
  issuerRuc: string;
  payloadHash: string;
  updatedAt: string;
  source: "write" | "migration" | "backup-recovery";
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

async function createEnvelope(rawPayload: string): Promise<SnapshotEnvelope> {
  const payload = JSON.parse(rawPayload) as unknown;
  const identity = payloadIdentity(payload);
  return {
    schemaVersion: ENVELOPE_VERSION,
    companyId: identity.companyId,
    issuerRuc: identity.issuerRuc,
    createdAt: new Date().toISOString(),
    payloadHash: await hashPayload(payload),
    payload
  };
}

async function parseAndValidateEnvelope(raw: string): Promise<SnapshotEnvelope> {
  const parsed = JSON.parse(raw) as Partial<SnapshotEnvelope>;
  if (
    parsed.schemaVersion !== ENVELOPE_VERSION ||
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
  return parsed as SnapshotEnvelope;
}

async function readValidatedFile(file: File) {
  if (!file.exists) return null;
  return parseAndValidateEnvelope(await file.text());
}

function payloadString(envelope: SnapshotEnvelope) {
  return JSON.stringify(envelope.payload);
}

async function writeMetadata(envelope: SnapshotEnvelope, source: SnapshotMetadata["source"]) {
  const metadata: SnapshotMetadata = {
    schemaVersion: ENVELOPE_VERSION,
    companyId: envelope.companyId,
    issuerRuc: envelope.issuerRuc,
    payloadHash: envelope.payloadHash,
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
  try {
    await readValidatedFile(current);
  } catch {
    return;
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
    const verified = await readValidatedFile(current);
    if (!verified || verified.payloadHash !== envelope.payloadHash) {
      throw new Error("El archivo promovido no superó la verificación final.");
    }
    await writeMetadata(verified, source);
    return verified;
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
  await writeMetadata(verified, "backup-recovery");
  return verified;
}

async function readNativeSnapshot(legacyKey: string) {
  await ensureSnapshotDirectory();
  const current = await snapshotFile(CURRENT_FILE);
  if (current.exists) {
    try {
      const envelope = await readValidatedFile(current);
      if (envelope) return payloadString(envelope);
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

export async function writeMainSnapshot(legacyKey: string, value: string): Promise<void> {
  if (!indexedDbAvailable()) {
    try {
      await writeNativeSnapshot(value, "write");
      return;
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
}
