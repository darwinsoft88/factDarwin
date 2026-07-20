import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppData, PendingSyncItem, User } from "../types";
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
const PENDING_OUTBOX_LIMITS = {
  normalMaxItems: 80,
  emergencyMaxItems: 30,
  minimumItems: 10,
  targetChars: 1_500_000,
  emergencyChars: 650_000
} as const;

type StorageCompactMode = keyof typeof STORAGE_COMPACT_LIMITS;

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

function compactPatchForPendingStorage(patch: unknown) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return patch;
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

function compactPendingOutbox(pendingSync: PendingSyncItem[], maxItems: number, maxChars: number) {
  let compacted = pendingSync.slice(0, maxItems).map(compactPendingItemForStorage);
  while (compacted.length > PENDING_OUTBOX_LIMITS.minimumItems && serializePendingOutbox(compacted).length > maxChars) {
    compacted = compacted.slice(0, -1);
  }
  return compacted;
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

export async function loadData() {
  let raw: string | null = null;
  let parsed: AppData;

  try {
    raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const pendingSync = await loadPendingOutbox();
      return pendingSync.length ? buildPendingRecoverySnapshot(initialData, pendingSync) : initialData;
    }
    parsed = JSON.parse(raw) as AppData;
  } catch {
    if (raw) await AsyncStorage.removeItem(STORAGE_KEY);
    const pendingSync = await loadPendingOutbox();
    return pendingSync.length ? buildPendingRecoverySnapshot(initialData, pendingSync) : initialData;
  }

  try {
    const pendingOutbox = await loadPendingOutbox();
    const pendingSync = mergePendingSync(parsed.pendingSync || [], pendingOutbox);
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
    return sanitizeAppData(materializePendingPatches(normalized, pendingSync));
  } catch {
    await AsyncStorage.removeItem(STORAGE_KEY);
    const pendingSync = await loadPendingOutbox();
    return pendingSync.length ? buildPendingRecoverySnapshot(initialData, pendingSync) : initialData;
  }
}

export async function saveData(data: AppData) {
  const storageReadyData = data.pendingSync?.length
    ? { ...data, pendingSync: compactPendingItemsForStorage(data.pendingSync) }
    : data;
  const sanitized = sanitizeAppData(storageReadyData);
  await savePendingOutbox(sanitized.pendingSync || []);
  await saveMainSnapshotWithQuotaRecovery(sanitized);
}

async function saveMainSnapshotWithQuotaRecovery(data: AppData) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return;
  } catch (error) {
    if (!isStorageQuotaError(error)) throw error;
  }

  const compacted = compactDataForStorage(data, "normal");
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(compacted));
    return;
  } catch (error) {
    if (!isStorageQuotaError(error)) throw error;
  }

  const aggressive = compactDataForStorage(data, "aggressive");
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(aggressive));
}

async function loadPendingOutbox(): Promise<PendingSyncItem[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingSyncItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => Boolean(item?.id && item.createdAt && item.title))
      .slice(0, 100)
      .map(compactPendingItemForStorage);
  } catch {
    await AsyncStorage.removeItem(PENDING_OUTBOX_KEY);
    return [];
  }
}

async function savePendingOutbox(pendingSync: PendingSyncItem[]) {
  if (!pendingSync.length) {
    await AsyncStorage.removeItem(PENDING_OUTBOX_KEY);
    return;
  }

  const normal = compactPendingOutbox(pendingSync, PENDING_OUTBOX_LIMITS.normalMaxItems, PENDING_OUTBOX_LIMITS.targetChars);
  try {
    await AsyncStorage.setItem(PENDING_OUTBOX_KEY, serializePendingOutbox(normal));
    return;
  } catch (error) {
    if (!isStorageQuotaError(error)) throw error;
  }

  const emergency = compactPendingOutbox(pendingSync, PENDING_OUTBOX_LIMITS.emergencyMaxItems, PENDING_OUTBOX_LIMITS.emergencyChars);
  try {
    await AsyncStorage.setItem(PENDING_OUTBOX_KEY, serializePendingOutbox(emergency));
    return;
  } catch (error) {
    if (!isStorageQuotaError(error)) throw error;
  }

  const minimum = compactPendingOutbox(
    pendingSync,
    PENDING_OUTBOX_LIMITS.minimumItems,
    Math.floor(PENDING_OUTBOX_LIMITS.emergencyChars / 2)
  );
  try {
    await AsyncStorage.setItem(PENDING_OUTBOX_KEY, serializePendingOutbox(minimum));
  } catch (error) {
    if (!isStorageQuotaError(error)) throw error;
  }
}

function mergePendingSync(primary: PendingSyncItem[], secondary: PendingSyncItem[]) {
  const byId = new Map<string, PendingSyncItem>();
  [...secondary, ...primary].forEach((item) => {
    if (item?.id) byId.set(item.id, item);
  });
  return Array.from(byId.values())
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 100);
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

  pendingSync
    .slice()
    .reverse()
    .forEach((item) => {
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
