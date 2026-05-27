import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppData, User } from "./types";
import { sanitizeAppData } from "./validation";

// Clave de almacenamiento para AsyncStorage. Cambiar si se necesita mantener varias versiones o entornos.
const STORAGE_KEY = "factura-sri-mobile:v1";
const SESSION_KEY = "factura-sri-mobile:session:v1";
// Para desarrollo web en localhost usa el backend local; en produccion se debe configurar EXPO_PUBLIC_BACKEND_URL.
const localWebBackendUrl = typeof window !== "undefined" && typeof window.location?.hostname === "string" && ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:4000"
  : "";
const DEFAULT_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || localWebBackendUrl || "";
const today = new Date();
// La licencia de prueba dura 30 días a partir de la fecha actual. Se puede ajustar según las necesidades.
const trialExpires = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

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
    maxEmissionPoints: 999,
    features: {
      sales: true,
      sri: true,
      inventory: true,
      reports: true,
      multiDevice: true,
      multiEmissionPoint: true
    },
    notes: "Empresa demo para pruebas internas. Los clientes finales deben crear su propia cuenta."
  }
};

export async function loadData() {
  let raw: string | null = null;
  let parsed: AppData;

  try {
    raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return initialData;
    parsed = JSON.parse(raw) as AppData;
  } catch {
    if (raw) await AsyncStorage.removeItem(STORAGE_KEY);
    return initialData;
  }

  try {
    return sanitizeAppData({
      ...initialData,
      ...parsed,
      inventoryMovements: parsed.inventoryMovements || [],
      auditLogs: parsed.auditLogs || [],
      receivedRetentions: parsed.receivedRetentions || [],
      guides: parsed.guides || [],
      cashClosings: parsed.cashClosings || [],
      autoBackupEnabled: parsed.autoBackupEnabled ?? true,
      autoBackupLastAt: parsed.autoBackupLastAt || "",
      autoBackupLastError: parsed.autoBackupLastError || "",
      pendingSync: parsed.pendingSync || [],
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
    });
  } catch {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return initialData;
  }
}

export async function saveData(data: AppData) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeAppData(data)));
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
