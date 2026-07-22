import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppData, PendingSyncItem, PendingSyncPatch, User } from "../types";
import { identifyIncrementalPatch, normalizeSyncRequestId, sortPendingSyncFifo } from "../utils/pendingSync";
import { sanitizeAppData } from "../validation";

// Clave de almacenamiento para AsyncStorage. Cambiar si se necesita mantener varias versiones o entornos.
const STORAGE_KEY = "factura-sri-mobile:v1";
const SESSION_KEY = "factura-sri-mobile:session:v1";
const PENDING_OUTBOX_KEY = "factura-sri-mobile:pending-outbox:v1";
// Para desarrollo local se puede activar EXPO_PUBLIC_ALLOW_LOCAL_BACKEND=1.
// En modo comercial la app debe usar siempre una API publica para sincronizar todos los dispositivos.
const allowLocalBackend = process.env.EXPO_PUBLIC_ALLOW_LOCAL_BACKEND === "1";
const localWebBackendUrl = allowLocalBackend && typeof window !== "undefined" && typeof window.location?.hostname === "string" && ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:4000"
  : "";
// En producción, el backend debe estar desplegado en una URL accesible. Para desarrollo, se puede usar un túnel como ngrok o cloudflare tunnel apuntando al backend local.
export const PRODUCTION_BACKEND_URL = "https://api.factudarwin.com";
const DEFAULT_BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  localWebBackendUrl ||
  PRODUCTION_BACKEND_URL;
const TEMPORARY_BACKEND_PATTERN = /(trycloudflare\.com|loca\.lt|ngrok-free\.app|ngrok\.io)/i;
const LOCAL_BACKEND_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i;
const PRIVATE_BACKEND_PATTERN = /^https?:\/\/(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}|0\.0\.0\.0|[^/]+\.local)(:\d+)?/i;
const PENDING_PATCH_COLLECTIONS = [
  "users",
  "clients",
  "products",
  "sales",
  "creditPayments",
  "receivedRetentions",
  "guides",
  "cashClosings",
  "inventoryMovements",
  "auditLogs"
] as const;
const STORAGE_COMPACT_LIMITS = {
  normal: { auditLogs: 500 },
  aggressive: { auditLogs: 150 }
} as const;
type StorageCompactMode = keyof typeof STORAGE_COMPACT_LIMITS;

export type StorageRecoveryStage = "read" | "parse" | "normalize";

export class StorageRecoveryError extends Error {
  readonly code = "STORAGE_RECOVERY_REQUIRED" as const;
  readonly stage: StorageRecoveryStage;
  readonly snapshotExists: boolean | "unknown";
  readonly approximateSize: number | null;
  readonly attemptedAt: string;

  constructor(stage: StorageRecoveryStage, options: { snapshotExists: boolean | "unknown"; approximateSize?: number | null; cause?: unknown }) {
    super("No se pudo cargar la informacion local. El almacenamiento original fue preservado para recuperacion.");
    this.name = "StorageRecoveryError";
    this.stage = stage;
    this.snapshotExists = options.snapshotExists;
    this.approximateSize = options.approximateSize ?? null;
    this.attemptedAt = new Date().toISOString();
    if (options.cause !== undefined) {
      Object.defineProperty(this, "cause", { value: options.cause, enumerable: false });
    }
  }
}

export function isStorageRecoveryError(error: unknown): error is StorageRecoveryError {
  return error instanceof StorageRecoveryError || (
    Boolean(error) &&
    typeof error === "object" &&
    (error as { code?: unknown }).code === "STORAGE_RECOVERY_REQUIRED"
  );
}

export type PendingOutboxRecoveryStage = "read" | "parse" | "validate";

export class PendingOutboxRecoveryError extends Error {
  readonly code = "PENDING_OUTBOX_RECOVERY_REQUIRED" as const;
  readonly stage: PendingOutboxRecoveryStage;
  readonly outboxExists: boolean | "unknown";
  readonly approximateSize: number | null;
  readonly attemptedAt: string;

  constructor(stage: PendingOutboxRecoveryStage, options: { outboxExists: boolean | "unknown"; approximateSize?: number | null; cause?: unknown }) {
    super("No se pudo cargar la cola local de sincronizacion. El contenido original fue preservado para recuperacion.");
    this.name = "PendingOutboxRecoveryError";
    this.stage = stage;
    this.outboxExists = options.outboxExists;
    this.approximateSize = options.approximateSize ?? null;
    this.attemptedAt = new Date().toISOString();
    if (options.cause !== undefined) {
      Object.defineProperty(this, "cause", { value: options.cause, enumerable: false });
    }
  }
}

export class PendingOutboxWriteError extends Error {
  readonly code = "PENDING_OUTBOX_WRITE_FAILED" as const;
  readonly attemptedAt: string;

  constructor(cause?: unknown) {
    super("No se pudo guardar completa la cola local de sincronizacion. La version anterior fue conservada.");
    this.name = "PendingOutboxWriteError";
    this.attemptedAt = new Date().toISOString();
    if (cause !== undefined) {
      Object.defineProperty(this, "cause", { value: cause, enumerable: false });
    }
  }
}

export class PendingSyncRequestIdMigrationError extends Error {
  readonly code = "PENDING_SYNC_REQUEST_ID_INVALID" as const;
  readonly pendingId: string;

  constructor(pendingId: string) {
    super("Un pendiente contiene un identificador de sincronizacion invalido. El registro original fue preservado.");
    this.name = "PendingSyncRequestIdMigrationError";
    this.pendingId = pendingId;
  }
}

function assertStoredSnapshotShape(value: unknown): asserts value is AppData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Stored snapshot root must be an object.");
  }

  const snapshot = value as Record<string, unknown>;
  if (snapshot.issuer !== undefined && (!snapshot.issuer || typeof snapshot.issuer !== "object" || Array.isArray(snapshot.issuer))) {
    throw new TypeError("Stored snapshot issuer must be an object.");
  }

  PENDING_PATCH_COLLECTIONS.forEach((key) => {
    if (snapshot[key] !== undefined && !Array.isArray(snapshot[key])) {
      throw new TypeError(`Stored snapshot ${key} must be an array.`);
    }
  });
}

function isStorageQuotaError(error: unknown) {
  const detail = error as { code?: unknown; message?: unknown; name?: unknown } | null;
  const code = typeof detail?.code === "number" ? detail.code : undefined;
  const name = typeof detail?.name === "string" ? detail.name : "";
  const message = typeof detail?.message === "string" ? detail.message.toLowerCase() : "";
  return name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    code === 22 ||
    code === 1014 ||
    message.includes("quota") ||
    message.includes("exceeded");
}

function compactPatchForPendingStorage(patch: unknown): PendingSyncPatch {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return {};
  const compacted: Record<string, unknown> = {};
  Object.entries(patch as Record<string, unknown>).forEach(([key, value]) => {
    if (key !== "baseData") compacted[key] = value;
  });
  return compacted;
}

function compactPendingItemForStorage(item: PendingSyncItem): PendingSyncItem {
  return {
    ...item,
    patch: compactPatchForPendingStorage(item.patch)
  };
}

function compactPendingItemsForStorage(pendingSync: PendingSyncItem[]) {
  return pendingSync.map(compactPendingItemForStorage);
}

function serializePendingOutbox(items: PendingSyncItem[]) {
  return JSON.stringify(items);
}

function compactDataForStorage(data: AppData, mode: StorageCompactMode) {
  const limits = STORAGE_COMPACT_LIMITS[mode];
  return sanitizeAppData({
    ...data,
    auditLogs: Array.isArray(data.auditLogs) ? data.auditLogs.slice(0, limits.auditLogs) : [],
    historyPolicy: {
      ...(data.historyPolicy || {}),
      auditLimit: limits.auditLogs,
      compactedAt: new Date().toISOString()
    }
  });
}

export function resolveStoredBackendUrl(value?: string) {
  const backendUrl = String(value || "").trim();
  if (!backendUrl) return DEFAULT_BACKEND_URL;
  if (TEMPORARY_BACKEND_PATTERN.test(backendUrl)) return DEFAULT_BACKEND_URL;
  if (!allowLocalBackend && (LOCAL_BACKEND_PATTERN.test(backendUrl) || PRIVATE_BACKEND_PATTERN.test(backendUrl))) return PRODUCTION_BACKEND_URL;
  return backendUrl;
}

//const DEFAULT_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || localWebBackendUrl || "";
const today = new Date();
// La prueba inicial dura 3 meses y habilita funciones tipo Pro con limites comerciales.
const trialExpires = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);

export const initialData: AppData = {
  backendUrl: DEFAULT_BACKEND_URL,
  issuer: {
    ruc: "1790012344001",
    businessName: "Empresa DEMO - Solo pruebas internas",
    tradeName: "DEMO Programadores",
    email: "demo@factudarwin.local",
    logoUrl: "",
    address: "Av. Principal y Calle Secundaria",
    establishment: "001",
    emissionPoint: "001",
    sequential: 1,
    environment: "1",
    taxRegime: "general",
    taxpayerType: "natural",
    accountingRequired: "NO",
    specialTaxpayer: "NO",
    specialTaxpayerResolution: "",
    retentionAgent: "NO",
    retentionAgentResolution: "",
    remissionSequential: 1,
    creditNoteSequential: 1,
    activeEstablishmentId: "001-001",
    establishmentsUpdatedAt: "",
    establishments: [
      {
        id: "001-001",
        name: "Matriz",
        establishment: "001",
        emissionPoint: "001",
        address: "Av. Principal y Calle Secundaria",
        sequential: 1,
        remissionSequential: 1,
        creditNoteSequential: 1,
        active: true
      }
    ]
  },
  users: [
    {
      id: "u-admin",
      name: "Administrador DEMO",
      email: "demo@factudarwin.local",
      password: "123456",
      role: "admin"
    }
  ],
  clients: [
    {
      id: "c-final",
      name: "Consumidor Final",
      identification: "9999999999999",
      identificationType: "07",
      email: "cliente@example.com",
      phone: "",
      address: "Ecuador",
      updatedAt: ""
    }
  ],
  products: [
    {
      id: "p-servicio",
      code: "SERV-001",
      name: "Servicio profesional",
      price: 25,
      cost: 0,
      ivaRate: 0.15,
      stock: 100,
      minStock: 5,
      updatedAt: ""
    }
  ],
  inventoryMovements: [],
  auditLogs: [],
  sales: [],
  creditPayments: [],
  receivedRetentions: [],
  guides: [],
  cashClosings: [],
  autoBackupEnabled: true,
  autoBackupLastAt: "",
  autoBackupLastError: "",
  pendingSync: [],
  deletedIds: {
    clients: [],
    products: [],
    users: []
  },
  historyPolicy: {
    mode: "full-local-snapshot"
  },
  license: {
    status: "trial",
    plan: "trial",
    startsAt: today.toISOString().slice(0, 10),
    expiresAt: trialExpires.toISOString().slice(0, 10),
    maxUsers: 3,
    maxDevices: 3,
    maxEmissionPoints: 3,
    features: {
      sales: true,
      sri: true,
      inventory: true,
      reports: true,
      multiDevice: true,
      multiEmissionPoint: true
    },
    notes: "Prueba gratuita tipo Pro por 3 meses. Los clientes finales deben crear su propia cuenta."
  }
};

let lastStoredData: AppData | null = null;
let storedDataRevision = 0;
let storedDataQueue: Promise<void> = Promise.resolve();

function cloneAppData(data: AppData): AppData {
  if (typeof structuredClone === "function") {
    return structuredClone(data);
  }

  return JSON.parse(JSON.stringify(data)) as AppData;
}

function publishLoadedData(data: AppData, readRevision: number) {
  const isolated = cloneAppData(data);
  if (storedDataRevision === readRevision) lastStoredData = cloneAppData(isolated);
  return isolated;
}

export async function loadData() {
  const readRevision = storedDataRevision;
  let raw: string | null = null;
  let parsed: AppData;

  try {
    raw = await AsyncStorage.getItem(STORAGE_KEY);
  } catch (error) {
    throw new StorageRecoveryError("read", { snapshotExists: "unknown", cause: error });
  }

  if (!raw) {
    const pendingSync = await loadPendingOutbox();
    const loaded = pendingSync.length ? buildPendingRecoverySnapshot(initialData, pendingSync) : initialData;
    return publishLoadedData(loaded, readRevision);
  }

  try {
    parsed = JSON.parse(raw) as AppData;
  } catch (error) {
    throw new StorageRecoveryError("parse", { snapshotExists: true, approximateSize: raw.length, cause: error });
  }

  try {
    assertStoredSnapshotShape(parsed);
    const pendingOutbox = await loadPendingOutbox();
    const mergedPendingSync = mergePendingSync(parsed.pendingSync || [], pendingOutbox);
    const migratedPending = migratePendingSyncItems(mergedPendingSync);
    if (migratedPending.changed) await savePendingOutbox(migratedPending.items);
    const pendingSync = migratedPending.items;
    const normalized = {
      ...initialData,
      ...parsed,
      backendUrl: resolveStoredBackendUrl(parsed.backendUrl),
      inventoryMovements: parsed.inventoryMovements || [],
      auditLogs: parsed.auditLogs || [],
      creditPayments: parsed.creditPayments || [],
      receivedRetentions: parsed.receivedRetentions || [],
      guides: parsed.guides || [],
      cashClosings: parsed.cashClosings || [],
      autoBackupEnabled: parsed.autoBackupEnabled ?? true,
      autoBackupLastAt: parsed.autoBackupLastAt || "",
      autoBackupLastError: parsed.autoBackupLastError || "",
      pendingSync,
      deletedIds: parsed.deletedIds || initialData.deletedIds,
      historyPolicy: parsed.historyPolicy || initialData.historyPolicy,
      license: parsed.license || initialData.license,
      issuer: {
        ...initialData.issuer,
        ...parsed.issuer,
        taxRegime: parsed.issuer?.taxRegime || initialData.issuer.taxRegime,
        creditNoteSequential: parsed.issuer?.creditNoteSequential || 1,
        establishments: parsed.issuer?.establishments || initialData.issuer.establishments,
        establishmentsUpdatedAt: parsed.issuer?.establishmentsUpdatedAt || ""
      }
    };
    return publishLoadedData(sanitizeAppData(materializePendingPatches(normalized, pendingSync)), readRevision);
  } catch (error) {
    if (error instanceof PendingOutboxRecoveryError || error instanceof PendingSyncRequestIdMigrationError) throw error;
    throw new StorageRecoveryError("normalize", { snapshotExists: true, approximateSize: raw.length, cause: error });
  }
}

export type AppDataMutation = (current: AppData) => AppData | Promise<AppData>;

function enqueueStoredDataOperation<T>(operation: () => Promise<T>): Promise<T> {
  const currentOperation = storedDataQueue.then(operation, operation);
  storedDataQueue = currentOperation.then(() => undefined, () => undefined);
  return currentOperation;
}

async function prepareAppData(data: AppData) {
  const isolated = cloneAppData(data);
  const storageReadyData = isolated.pendingSync?.length
    ? { ...isolated, pendingSync: compactPendingItemsForStorage(sortPendingSyncFifo(isolated.pendingSync)) }
    : isolated;
  return sanitizeAppData(storageReadyData);
}

async function persistPreparedData(data: AppData): Promise<AppData> {
  await savePendingOutbox(data.pendingSync || []);
  const persisted = await saveMainSnapshotWithQuotaRecovery(data);
  storedDataRevision += 1;
  lastStoredData = cloneAppData(persisted);
  return persisted;
}

// Full intentional replacement. Normal state changes must use updateStoredData().
export async function saveData(data: AppData) {
  return enqueueStoredDataOperation(async () => persistPreparedData(await prepareAppData(data)));
}

/**
 * Serializes read-modify-write mutations against the latest durable AppData.
 * The mutation runs exactly once and must not persist data or perform side effects.
 */
export async function updateStoredData(mutation: AppDataMutation): Promise<AppData> {
  return enqueueStoredDataOperation(async () => {
    if (!lastStoredData) await loadData();
    if (!lastStoredData) throw new Error("No se pudo inicializar el estado local persistido.");
    const current = cloneAppData(lastStoredData);
    const next = await mutation(current);
    return persistPreparedData(await prepareAppData(next));
  });
}

async function saveMainSnapshotWithQuotaRecovery(data: AppData): Promise<AppData> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return data;
  } catch (error) {
    if (!isStorageQuotaError(error)) throw error;
  }

  const compacted = compactDataForStorage(data, "normal");
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(compacted));
    return compacted;
  } catch (error) {
    if (!isStorageQuotaError(error)) throw error;
  }

  const aggressive = compactDataForStorage(data, "aggressive");
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(aggressive));
  return aggressive;
}

async function loadPendingOutbox(): Promise<PendingSyncItem[]> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(PENDING_OUTBOX_KEY);
  } catch (error) {
    throw new PendingOutboxRecoveryError("read", { outboxExists: "unknown", cause: error });
  }
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new PendingOutboxRecoveryError("parse", { outboxExists: true, approximateSize: raw.length, cause: error });
  }

  try {
    if (!Array.isArray(parsed)) throw new TypeError("Pending outbox must be an array.");
    const validated = parsed.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new TypeError("Pending outbox item must be an object.");
      const pending = item as PendingSyncItem;
      if (!pending.id || !pending.createdAt || !pending.title || !Number.isFinite(Number(pending.attempts))) {
        throw new TypeError("Pending outbox item is invalid.");
      }
      return compactPendingItemForStorage(pending);
    });
    const migrated = migratePendingSyncItems(validated);
    const ordered = sortPendingSyncFifo(migrated.items);
    if (migrated.changed) await savePendingOutbox(ordered);
    return ordered;
  } catch (error) {
    if (error instanceof PendingSyncRequestIdMigrationError) throw error;
    throw new PendingOutboxRecoveryError("validate", { outboxExists: true, approximateSize: raw.length, cause: error });
  }
}

function migratePendingSyncRequestId(pending: PendingSyncItem) {
  if (!pending.patch || typeof pending.patch !== "object" || Array.isArray(pending.patch)) {
    throw new PendingSyncRequestIdMigrationError(pending.id);
  }
  const patch = pending.patch as PendingSyncPatch;
  const hasRequestId = Object.prototype.hasOwnProperty.call(patch, "requestId");
  if (hasRequestId) {
    const rawRequestId = patch.requestId;
    const requestId = normalizeSyncRequestId(rawRequestId);
    if (!requestId) throw new PendingSyncRequestIdMigrationError(pending.id);
    return pending;
  }
  const identified = identifyIncrementalPatch(patch as never);
  return { ...pending, patch: identified };
}

function migratePendingSyncItems(items: PendingSyncItem[]) {
  let changed = false;
  const migrated = items.map((pending) => {
    const item = migratePendingSyncRequestId(pending);
    if (item !== pending) changed = true;
    return item;
  });
  return { items: migrated, changed };
}

export async function migrateStoredPendingSyncRequestIds() {
  return updateStoredData((current) => {
    const migrated = migratePendingSyncItems(current.pendingSync || []);
    return migrated.changed ? { ...current, pendingSync: migrated.items } : current;
  });
}

async function savePendingOutbox(pendingSync: PendingSyncItem[]) {
  if (!pendingSync.length) {
    await AsyncStorage.removeItem(PENDING_OUTBOX_KEY);
    return;
  }

  try {
    const completeQueue = compactPendingItemsForStorage(sortPendingSyncFifo(pendingSync));
    await AsyncStorage.setItem(PENDING_OUTBOX_KEY, serializePendingOutbox(completeQueue));
  } catch (error) {
    throw new PendingOutboxWriteError(error);
  }
}

function mergePendingSync(primary: PendingSyncItem[], secondary: PendingSyncItem[]) {
  const secondaryById = new Map<string, PendingSyncItem>();
  secondary.forEach((item) => {
    if (item?.id && !secondaryById.has(item.id)) secondaryById.set(item.id, item);
  });

  const mergedIds = new Set<string>();
  const merged = primary.flatMap((item) => {
    if (!item?.id || mergedIds.has(item.id)) return [];
    mergedIds.add(item.id);
    return [secondaryById.get(item.id) || item];
  });

  secondary.forEach((item) => {
    if (!item?.id || mergedIds.has(item.id)) return;
    mergedIds.add(item.id);
    merged.push(item);
  });

  return sortPendingSyncFifo(merged);
}

function buildPendingRecoverySnapshot(baseData: AppData, pendingSync: PendingSyncItem[]) {
  return sanitizeAppData(materializePendingPatches({
    ...baseData,
    backendUrl: resolveStoredBackendUrl(baseData.backendUrl),
    pendingSync,
    autoBackupLastError: `${pendingSync.length} cambio(s) pendiente(s) por sincronizar.`
  }, pendingSync));
}

function materializePendingPatches(snapshot: AppData, pendingSync: PendingSyncItem[]) {
  if (!pendingSync.length) return snapshot;
  const next: AppData = { ...snapshot };

  sortPendingSyncFifo(pendingSync).forEach((item) => {
      const patch = (item.patch || {}) as Partial<AppData>;
      if (patch.issuer) next.issuer = { ...next.issuer, ...patch.issuer };
      PENDING_PATCH_COLLECTIONS.forEach((key) => {
        const patchItems = (patch as Record<string, unknown>)[key];
        if (!Array.isArray(patchItems) || patchItems.length === 0) return;
        (next as Record<string, unknown>)[key] = mergeCollectionById((next as Record<string, unknown>)[key] as Array<{ id?: string }> || [], patchItems as Array<{ id?: string }>);
      });
  });

  return next;
}

function mergeCollectionById<T extends { id?: string }>(currentItems: T[], patchItems: T[]) {
  const byId = new Map<string, T>();
  currentItems.forEach((item) => {
    if (item?.id) byId.set(item.id, item);
  });
  patchItems.forEach((item) => {
    if (item?.id) byId.set(item.id, item);
  });
  return Array.from(byId.values());
}

export type StoredSession = {
  user: User;
  token: string;
  savedAt: string;
  passwordHash?: string;
  companyRuc?: string;
};

export async function loadSession() {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.user?.id || !parsed.user.email) return null;
    return parsed;
  } catch {
    await AsyncStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export async function saveSession(user: User, token = "", passwordHash = "", companyRuc = "") {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ user, token, passwordHash, companyRuc, savedAt: new Date().toISOString() }));
}

export async function clearSession() {
  await AsyncStorage.removeItem(SESSION_KEY);
}
