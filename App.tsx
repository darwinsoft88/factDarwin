import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Network from "expo-network";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  StatusBar as NativeStatusBar,
  Text,
  TextInput,
  View
} from "react-native";
import { AuthorizationResponse, BackendCompanyOption, BackendHealthResponse, BackupSummary, BackendLicenseStatus, IdentityLookupResponse, TechnicalLog, authorizeInvoice, authorizeRemissionGuide, backupAppData, changeBackendPassword, checkBackendHealth, getCompanyAssetsStatus, getTechnicalLogs, loginBackend, lookupIdentityData, mergeBackendData, registerBackend, requestPasswordReset, reserveDocumentSequence, restoreAppData, sendInvoiceEmail, sendTestEmail, uploadCompanyCertificate, uploadCompanyLogo } from "./src/services/backend";
import { buildRideHtml } from "./src/services/ride";
import { hashPassword } from "./src/services/security";
import { buildCreditNoteXml, buildInvoiceXml, buildRemissionGuideXml, calculateLineDiscount, calculateLineSubtotal, calculateLineTax, calculateLineTotal, calculateTotalDiscount, calculateTotals, createAccessKey, createCreditNoteAccessKey, createGuideAccessKey, grossToNetUnitPrice, money, nextSequence } from "./src/services/sri";
import { clearSession, initialData, loadData, loadSession, saveData, saveSession } from "./src/storage";
import { AppData, AppLicense, AuditLog, CashClosing, Client, DocumentType, InventoryMovement, InventoryMovementType, Issuer, IssuerEstablishment, PaymentMethod, PendingSyncItem, Product, ReceivedRetention, RemissionGuide, RetentionTaxType, Sale, SaleItem, User, UserRole } from "./src/types";
import { findDuplicateClient, findDuplicateProductCode, normalizeClientIdentification, normalizeProductCode, sanitizeAppData } from "./src/validation";

type Tab = "dashboard" | "ventas" | "clientes" | "productos" | "inventario" | "caja" | "guias" | "usuarios" | "reportes" | "sri";
type SyncState = "synced" | "pending" | "syncing" | "error";
type ActionHandler = () => void | Promise<void>;

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const parseDecimal = (value: string) => Number(value.replace(",", "."));
const roundMoney = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const MAX_DAILY_RETRIES = 3;
const LIST_BATCH_SIZE = 25;
const AUDIT_LOG_LIMIT = 500;
const AUTO_BACKUP_DEBOUNCE_MS = Platform.OS === "web" ? 3000 : 1000;
const REMOTE_REFRESH_THROTTLE_MS = Platform.OS === "web" ? 5000 : 30000;
const WEB_REMOTE_REFRESH_INTERVAL_MS = 7000;
const CONNECTIVITY_SYNC_THROTTLE_MS = 6000;
const APP_BRAND = "FactuDarwin";
const APP_TAGLINE = "Facturacion electronica Ecuador";
const documentTypeOptions = [
  { label: "Factura", value: "factura" },
  { label: "Nota de venta", value: "nota_venta" },
  { label: "Proforma", value: "proforma" }
];

function maxEmissionPointsForLicense(license?: AppLicense | BackendLicenseStatus) {
  if (license?.plan === "trial" || isProLicensePlan(license?.plan)) return Math.max(999, Number(license?.maxEmissionPoints || 999));
  return 1;
}

function isProLicensePlan(plan?: string) {
  return String(plan || "").startsWith("pro_");
}

function normalizeLicensePlanValue(plan?: string) {
  if (plan === "mensual") return "basico_mensual";
  if (plan === "anual") return "basico_anual";
  if (plan === "pro") return "pro_anual";
  if (["trial", "basico_mensual", "basico_anual", "pro_mensual", "pro_anual"].includes(String(plan))) return String(plan);
  return "trial";
}

function canUseEmissionScope(issuer: Issuer, license: AppLicense | BackendLicenseStatus | undefined, establishmentId: string) {
  const allowed = normalizedEstablishments(issuer).filter((item) => item.active !== false).slice(0, maxEmissionPointsForLicense(license));
  return allowed.some((item) => item.id === establishmentId);
}

function activeIssuer(data: AppData): Issuer {
  return issuerWithEstablishment(data.issuer, activeEstablishment(data.issuer));
}

function activeEstablishment(issuer: Issuer): IssuerEstablishment {
  const establishments = normalizedEstablishments(issuer);
  return establishments.find((item) => item.id === issuer.activeEstablishmentId && item.active)
    || establishments.find((item) => item.active)
    || establishments[0]
    || {
      id: "001-001",
      name: "Matriz",
      establishment: "001",
      emissionPoint: "001",
      address: issuer.address || "",
      sequential: issuer.sequential || 1,
      remissionSequential: issuer.remissionSequential || 1,
      creditNoteSequential: issuer.creditNoteSequential || 1,
      active: true
    };
}

function issuerWithEstablishment(issuer: Issuer, establishment: IssuerEstablishment): Issuer {
  return {
    ...issuer,
    activeEstablishmentId: establishment.id,
    establishment: establishment.establishment,
    emissionPoint: establishment.emissionPoint,
    address: establishment.address || issuer.address,
    sequential: establishment.sequential,
    remissionSequential: establishment.remissionSequential || 1,
    creditNoteSequential: establishment.creditNoteSequential || 1
  };
}

function normalizedEstablishments(issuer: Issuer): IssuerEstablishment[] {
  const fallback: IssuerEstablishment = {
    id: `${issuer.establishment || "001"}-${issuer.emissionPoint || "001"}`,
    name: "Matriz",
    establishment: issuer.establishment || "001",
    emissionPoint: issuer.emissionPoint || "001",
    address: issuer.address || "",
    sequential: issuer.sequential || 1,
    remissionSequential: issuer.remissionSequential || 1,
    creditNoteSequential: issuer.creditNoteSequential || 1,
    active: true
  };
  const source = Array.isArray(issuer.establishments) && issuer.establishments.length > 0 ? issuer.establishments : [fallback];
  const normalized = source.map((item) => {
    const establishment = normalizeThreeDigits(item.establishment);
    const emissionPoint = normalizeThreeDigits(item.emissionPoint);
    return {
      ...item,
      id: `${establishment}-${emissionPoint}`,
      name: String(item.name || `Establecimiento ${establishment}-${emissionPoint}`).trim(),
      establishment,
      emissionPoint,
      address: String(item.address || issuer.address || "").trim(),
      sequential: Math.max(1, Number(item.sequential || 1)),
      remissionSequential: Math.max(1, Number(item.remissionSequential || 1)),
      creditNoteSequential: Math.max(1, Number(item.creditNoteSequential || 1)),
      active: item.active !== false,
      updatedAt: item.updatedAt || ""
    };
  });
  return normalizeEstablishmentNames(normalized);
}

function editableEstablishments(issuer: Issuer): IssuerEstablishment[] {
  const source = Array.isArray(issuer.establishments) && issuer.establishments.length > 0 ? issuer.establishments : normalizedEstablishments(issuer);
  return source.map((item) => {
    const establishment = normalizeThreeDigits(item.establishment);
    const emissionPoint = normalizeThreeDigits(item.emissionPoint);
    return {
      ...item,
      id: `${establishment}-${emissionPoint}`,
      name: String(item.name ?? ""),
      establishment,
      emissionPoint,
      address: String(item.address || issuer.address || ""),
      sequential: Math.max(1, Number(item.sequential || 1)),
      remissionSequential: Math.max(1, Number(item.remissionSequential || 1)),
      creditNoteSequential: Math.max(1, Number(item.creditNoteSequential || 1)),
      active: item.active !== false,
      updatedAt: item.updatedAt || ""
    };
  });
}

function normalizeEstablishmentNames(establishments: IssuerEstablishment[]) {
  const matrizCandidates = establishments.filter((item) => item.name.trim().toLowerCase() === "matriz");
  const matrizId = matrizCandidates.find((item) => item.id === "001-001")?.id || matrizCandidates[0]?.id || "";
  const seenNames = new Set<string>();

  return establishments.map((item) => {
    let name = item.name.trim();
    if (name.toLowerCase() === "matriz" && item.id !== matrizId) {
      name = `Sucursal ${item.establishment}-${item.emissionPoint}`;
    }
    const key = name.toLowerCase();
    if (seenNames.has(key)) {
      name = `${name} ${item.establishment}-${item.emissionPoint}`;
    }
    seenNames.add(name.toLowerCase());
    return { ...item, name };
  });
}

function normalizeThreeDigits(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  return (digits || "1").padStart(3, "0").slice(-3);
}

function updateIssuerEstablishmentSequence(issuer: Issuer, establishmentId: string, field: "sequential" | "remissionSequential" | "creditNoteSequential", nextValue: number): Issuer {
  const establishments = normalizedEstablishments(issuer).map((item) => item.id === establishmentId ? { ...item, [field]: nextValue } : item);
  const active = establishments.find((item) => item.id === establishmentId) || activeEstablishment({ ...issuer, establishments });
  return {
    ...issuerWithEstablishment({ ...issuer, establishments, activeEstablishmentId: active.id }, active),
    establishments
  };
}

function issuerForSale(issuer: Issuer, sale: Pick<Sale, "establishment" | "emissionPoint" | "establishmentName">): Issuer {
  if (!sale.establishment || !sale.emissionPoint) return issuer;
  const establishment = normalizedEstablishments(issuer).find((item) => item.establishment === sale.establishment && item.emissionPoint === sale.emissionPoint) || {
    ...activeEstablishment(issuer),
    id: `${sale.establishment}-${sale.emissionPoint}`,
    name: sale.establishmentName || `${sale.establishment}-${sale.emissionPoint}`,
    establishment: sale.establishment,
    emissionPoint: sale.emissionPoint
  };
  return issuerWithEstablishment(issuer, establishment);
}

function issuerForGuide(issuer: Issuer, guide: Pick<RemissionGuide, "establishment" | "emissionPoint" | "establishmentName">): Issuer {
  return issuerForSale(issuer, guide);
}
const paymentOptions = [
  { label: "01 - sin sistema financiero", value: "01" },
  { label: "20 - otros sistema financiero", value: "20" },
  { label: "16 - Tarjeta debito", value: "16" },
  { label: "19 - Tarjeta credito", value: "19" },
  { label: "15 - Compensacion de deudas", value: "15" },
  { label: "17 - Dinero electronico", value: "17" },
  { label: "18 - Tarjeta prepago", value: "18" },
  { label: "21 - Endoso de titulos", value: "21" }
];
const roleOptions: { label: string; value: UserRole }[] = [
  { label: "Administrador", value: "admin" },
  { label: "Vendedor", value: "vendedor" },
  { label: "Cajero", value: "cajero" },
  { label: "Contador", value: "contador" }
];
const licensePlanOptions = [
  { label: "Demo", value: "trial" },
  { label: "Basico mensual", value: "basico_mensual" },
  { label: "Basico anual", value: "basico_anual" },
  { label: "Pro mensual", value: "pro_mensual" },
  { label: "Pro anual", value: "pro_anual" }
];
const retentionTaxOptions = [
  { label: "IVA", value: "IVA" },
  { label: "Fuente / renta", value: "RENTA" }
];
const monthOptions = [
  { label: "Enero", value: "1" },
  { label: "Febrero", value: "2" },
  { label: "Marzo", value: "3" },
  { label: "Abril", value: "4" },
  { label: "Mayo", value: "5" },
  { label: "Junio", value: "6" },
  { label: "Julio", value: "7" },
  { label: "Agosto", value: "8" },
  { label: "Septiembre", value: "9" },
  { label: "Octubre", value: "10" },
  { label: "Noviembre", value: "11" },
  { label: "Diciembre", value: "12" }
];

function tabLabel(tab: Tab) {
  const labels: Record<Tab, string> = {
    dashboard: "INICIO",
    ventas: "VENTAS",
    clientes: "CLIENTES",
    productos: "PRODUCTOS",
    inventario: "INVENTARIO",
    caja: "CAJA",
    guias: "GUIAS",
    usuarios: "USUARIOS",
    reportes: "REPORTES",
    sri: "SRI"
  };

  return labels[tab];
}

function roleLabel(role: UserRole) {
  return roleOptions.find((option) => option.value === role)?.label || "Vendedor";
}

function productMinStock(product: Product) {
  return Number.isFinite(Number(product.minStock)) ? Number(product.minStock) : 5;
}

function productCost(product: Product | undefined) {
  return Number.isFinite(Number(product?.cost)) ? Number(product?.cost) : 0;
}

function appLicenseStatus(license?: AppLicense | BackendLicenseStatus) {
  const today = new Date();
  const expires = parseInputDate(String(license?.expiresAt || ""), "end");
  const expiredByDate = expires ? expires.getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() : false;
  const rawStatus = String(license?.status || "trial");
  const effectiveStatus = rawStatus === "suspended" ? "suspended" : expiredByDate || rawStatus === "expired" ? "expired" : rawStatus;
  const active = (rawStatus === "active" || rawStatus === "trial") && !expiredByDate;
  const daysLeft = expires ? Math.ceil((expires.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000) : 0;
  return { active, effectiveStatus, daysLeft };
}

function licenseStatusLabel(license?: AppLicense | BackendLicenseStatus) {
  const status = appLicenseStatus(license);
  if (status.effectiveStatus === "suspended") return "Licencia suspendida";
  if (status.effectiveStatus === "expired") return "Licencia vencida";
  const plan = licensePlanOptions.find((option) => option.value === normalizeLicensePlanValue(license?.plan))?.label || "Demo";
  return `${plan} | vence ${license?.expiresAt || "sin fecha"} | ${Math.max(0, status.daysLeft)} dias`;
}

function compactLicenseStatusLabel(license?: AppLicense | BackendLicenseStatus) {
  const status = appLicenseStatus(license);
  if (status.effectiveStatus === "suspended") return "Suspendida";
  if (status.effectiveStatus === "expired") return "Vencida";
  const plan = licensePlanOptions.find((option) => option.value === normalizeLicensePlanValue(license?.plan))?.label || "Demo";
  return `${plan} activo`;
}

function tabsForRole(role: UserRole): Tab[] {
  if (role === "admin") return ["dashboard", "ventas", "clientes", "productos", "inventario", "caja", "guias", "reportes", "usuarios", "sri"];
  if (role === "cajero") return ["dashboard", "ventas", "clientes", "caja", "reportes"];
  if (role === "contador") return ["dashboard", "caja", "reportes"];
  return ["dashboard", "ventas", "clientes", "productos", "inventario", "caja", "guias", "reportes"];
}

function filterTabsByLicense(tabs: Tab[], license: AppLicense | undefined, role: UserRole) {
  if (role === "admin") return tabs;
  const status = appLicenseStatus(license);
  if (!status.active) return tabs.filter((tab) => ["dashboard", "reportes"].includes(tab));
  const features = license?.features;
  return tabs.filter((tab) => {
    if (tab === "ventas" && features?.sales === false) return false;
    if (tab === "guias" && (features?.sales === false || features?.sri === false)) return false;
    if (tab === "inventario" && features?.inventory === false) return false;
    if (tab === "reportes" && features?.reports === false) return false;
    return true;
  });
}

function canDeleteCatalog(role: UserRole) {
  return role === "admin";
}

function canAccessSensitiveSupport(role: UserRole) {
  return role === "admin" || role === "contador";
}

function canManageFiscalAdjustments(role: UserRole) {
  return role === "admin" || role === "contador";
}

function canRetryDocuments(role: UserRole) {
  return role === "admin" || role === "contador";
}

function canVoidDocuments(role: UserRole) {
  return role === "admin" || role === "contador";
}

function canIssueFromInternalDocuments(role: UserRole) {
  return role === "admin" || role === "vendedor" || role === "cajero";
}

function canEditCatalog(role: UserRole) {
  return role === "admin" || role === "vendedor" || role === "cajero";
}
type StartupErrorBoundaryState = {
  message: string;
};

class StartupErrorBoundary extends React.Component<{ children: React.ReactNode }, StartupErrorBoundaryState> {
  state: StartupErrorBoundaryState = { message: "" };

  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  render() {
    if (this.state.message) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#f8fafc", padding: 18, justifyContent: "center" }}>
          <View style={{ borderWidth: 1, borderColor: "#fecaca", backgroundColor: "#fef2f2", borderRadius: 8, padding: 16, gap: 10 }}>
            <Text style={{ color: "#991b1b", fontSize: 20, fontWeight: "900" }}>FactuDarwin no pudo iniciar</Text>
            <Text style={{ color: "#7f1d1d", lineHeight: 20 }}>{this.state.message}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => this.setState({ message: "" })}
              style={{ backgroundColor: "#0b6f68", borderRadius: 8, padding: 12, alignItems: "center" }}
            >
              <Text style={{ color: "#ffffff", fontWeight: "900" }}>Reintentar</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

// Solo para pruebas iniciales. En producción, se debe crear al menos un usuario administrador desde el registro o la configuración inicial.
function AppContent() {
  const headerTopPadding = Platform.OS === "android" ? (NativeStatusBar.currentHeight || 0) + 6 : 12;
  const [data, setData] = useState<AppData>(initialData);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<User | null>(null);
  const [backendToken, setBackendToken] = useState("");
  const [syncState, setSyncState] = useState<SyncState>("synced");
  const [authMode, setAuthMode] = useState<"login" | "register" | "forgot">("login");
  const [registering, setRegistering] = useState(false);
  const [registerStatus, setRegisterStatus] = useState<{ tone: "info" | "error" | "success"; message: string } | null>(null);
  const [recoveringPassword, setRecoveringPassword] = useState(false);
  const [recoverStatus, setRecoverStatus] = useState<{ tone: "info" | "error" | "success"; message: string } | null>(null);
  const [loginStatus, setLoginStatus] = useState<{ tone: "info" | "error" | "success"; message: string } | null>(null);
  const [loginErrorModalMessage, setLoginErrorModalMessage] = useState("");
  const [passwordChangeVisible, setPasswordChangeVisible] = useState(false);
  const [newPasswordForm, setNewPasswordForm] = useState({ password: "", confirm: "" });
  const [newPasswordVisible, setNewPasswordVisible] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordChangeStatus, setPasswordChangeStatus] = useState<{ tone: "info" | "error" | "success"; message: string } | null>(null);
  const [companyOptions, setCompanyOptions] = useState<BackendCompanyOption[]>([]);
  const [establishmentOptionsVisible, setEstablishmentOptionsVisible] = useState(false);
  const [establishmentSwitcherVisible, setEstablishmentSwitcherVisible] = useState(false);
  const [pendingLogin, setPendingLogin] = useState<{ data: AppData; user: User; token: string; passwordHash?: string } | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [recoveryIdentifier, setRecoveryIdentifier] = useState("");
  const [authBackendUrl, setAuthBackendUrl] = useState(initialData.backendUrl);
  const [registerForm, setRegisterForm] = useState({
    ruc: "",
    businessName: "",
    tradeName: "",
    adminName: "",
    email: "",
    password: "",
    confirmPassword: ""
  });

  const emptyRegisterForm = {
    ruc: "",
    businessName: "",
    tradeName: "",
    adminName: "",
    email: "",
    password: "",
    confirmPassword: ""
  };
  const [tab, setTab] = useState<Tab>("dashboard");
  const [xmlPreview, setXmlPreview] = useState("");
  const [appMenuVisible, setAppMenuVisible] = useState(false);
  const [syncCenterVisible, setSyncCenterVisible] = useState(false);
  const [supportVisible, setSupportVisible] = useState(false);
  const [supportDiagnostic, setSupportDiagnostic] = useState("");
  const [supportLoading, setSupportLoading] = useState(false);
  const [syncActionLoading, setSyncActionLoading] = useState(false);
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const autoBackupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoBackupRunningRef = useRef(false);
  const pendingAutoBackupRef = useRef<AppData | null>(null);
  const backendTokenRef = useRef("");
  const dataRef = useRef<AppData>(initialData);
  const sessionRef = useRef<User | null>(null);
  const syncStateRef = useRef<SyncState>("synced");
  const remoteRefreshRunningRef = useRef(false);
  const lastRemoteRefreshRef = useRef(0);
  const connectivitySyncRunningRef = useRef(false);
  const lastConnectivitySyncRef = useRef(0);

  useEffect(() => {
    Promise.all([loadData(), loadSession()])
      .then(([storedData, storedSession]) => {
        setData(storedData);
        dataRef.current = storedData;
        if (storedSession?.user) {
          setSession(storedSession.user);
          sessionRef.current = storedSession.user;
          if (storedSession.user.mustChangePassword) {
            setPasswordChangeVisible(true);
            setPasswordChangeStatus({ tone: "info", message: "Por seguridad, cree una nueva contrasena para reemplazar la clave temporal." });
          }
          setBackendToken(storedSession.token || "");
          backendTokenRef.current = storedSession.token || "";
          setEmail(storedSession.user.email);
          if (storedData.issuer.ruc && storedSession.companyRuc !== storedData.issuer.ruc) {
            void saveSession(storedSession.user, storedSession.token || "", storedSession.passwordHash || "", storedData.issuer.ruc);
          }
        }
      })
      .catch(() => setData(initialData))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (event) => setKeyboardInset(event.endCoordinates.height));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardInset(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
// Para desarrollo, se puede cargar una sesión de prueba automáticamente. En producción, se debe iniciar sin sesión para mostrar la pantalla de login o registro.
  useEffect(() => {
    if (ready && !session && data.users.length === 0) {
      setAuthMode("register");
    }
  }, [data.users.length, ready, session]);

  useEffect(() => {
    backendTokenRef.current = backendToken;
  }, [backendToken]);

  useEffect(() => {
    dataRef.current = data;
    setAuthBackendUrl(data.backendUrl);
  }, [data]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    syncStateRef.current = syncState;
  }, [syncState]);

  const availableTabs = useMemo<Tab[]>(() => {
    if (!session) return [];
    return filterTabsByLicense(tabsForRole(session.role), data.license, session.role);
  }, [data.license, session]);

  useEffect(() => {
    if (session && !availableTabs.includes(tab)) {
      setTab("dashboard");
    }
  }, [availableTabs, session, tab]);

  useEffect(() => {
    return () => {
      if (autoBackupTimerRef.current) clearTimeout(autoBackupTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return undefined;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void syncAfterConnectivityRestored("active");
      } else {
        void flushAutoBackup();
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || typeof document === "undefined") return undefined;

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void refreshFromBackend("active");
    };
    const timer = window.setInterval(refreshIfVisible, WEB_REMOTE_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refreshIfVisible);
    window.addEventListener("online", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshIfVisible);
      window.removeEventListener("online", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, []);

  const persist = async (next: AppData) => {
    const sanitized = sanitizeAppData(next);
    setData(sanitized);
    setSyncState(sanitized.autoBackupEnabled === false ? "synced" : "pending");
    await saveData(sanitized);
    scheduleAutoBackup(sanitized);
  };

  const scheduleAutoBackup = (snapshot: AppData) => {
    if (!ready || snapshot.autoBackupEnabled === false || !snapshot.backendUrl) return;
    pendingAutoBackupRef.current = snapshot;
    if (autoBackupTimerRef.current) clearTimeout(autoBackupTimerRef.current);

    autoBackupTimerRef.current = setTimeout(() => {
      void flushAutoBackup();
    }, AUTO_BACKUP_DEBOUNCE_MS);
  };

  const flushAutoBackup = async () => {
    if (autoBackupTimerRef.current) {
      clearTimeout(autoBackupTimerRef.current);
      autoBackupTimerRef.current = null;
    }

    const snapshot = pendingAutoBackupRef.current;
    if (!snapshot) return;
    pendingAutoBackupRef.current = null;
    await runAutoBackup(snapshot);
  };

  const runAutoBackup = async (snapshot: AppData) => {
    if (snapshot.autoBackupEnabled === false) return;
    if (autoBackupRunningRef.current) {
      pendingAutoBackupRef.current = snapshot;
      return;
    }
    autoBackupRunningRef.current = true;
    setSyncState("syncing");

    try {
      const token = await ensureBackendToken(snapshot.backendUrl);
      const flushed = await flushPendingSyncQueue(snapshot.backendUrl, token, snapshot);
      snapshot = flushed;
      let uploadSnapshot = snapshot;
      try {
        const remote = await restoreAppData<AppData>(snapshot.backendUrl, token);
        if (remote?.data) {
          uploadSnapshot = mergeAppDataSnapshots(remote.data, snapshot);
        }
      } catch {
        uploadSnapshot = snapshot;
      }
      const backupResult = await backupAppData(snapshot.backendUrl, uploadSnapshot, token);
      const updated = { ...snapshot, autoBackupLastAt: backupResult.updatedAt || new Date().toISOString(), autoBackupLastError: "" };
      setData((current) => {
        const merged = mergeAppDataSnapshots(uploadSnapshot, current);
        merged.autoBackupLastAt = updated.autoBackupLastAt;
        merged.autoBackupLastError = "";
        dataRef.current = merged;
        void saveData(merged);
        return merged;
      });
      setSyncState("synced");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo ejecutar el respaldo automatico.";
      const updated = { ...snapshot, autoBackupLastError: shortText(message, 180) };
      setData((current) => {
        const merged = { ...current, autoBackupLastError: updated.autoBackupLastError };
        void saveData(merged);
        return merged;
      });
      setSyncState("error");
    } finally {
      autoBackupRunningRef.current = false;
      const pending = pendingAutoBackupRef.current;
      if (pending) {
        pendingAutoBackupRef.current = null;
        void runAutoBackup(pending);
      }
    }
  };

  const flushPendingSyncQueue = async (backendUrl: string, token: string, snapshot: AppData) => {
    const pending = snapshot.pendingSync || [];
    if (pending.length === 0) return snapshot;

    const remaining: PendingSyncItem[] = [];
    for (const item of pending) {
      try {
        await mergeBackendData(backendUrl, item.patch, token);
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo enviar pendiente.";
        remaining.push({
          ...item,
          attempts: item.attempts + 1,
          lastError: shortText(message, 180)
        });
      }
    }

    const updated = {
      ...snapshot,
      pendingSync: remaining,
      autoBackupLastError: remaining.length ? `${remaining.length} cambio(s) pendiente(s) por sincronizar.` : ""
    };
    setData((current) => {
      const merged = { ...current, pendingSync: remaining, autoBackupLastError: updated.autoBackupLastError };
      dataRef.current = merged;
      void saveData(merged);
      return merged;
    });
    return updated;
  };

  const applyRemoteSnapshot = async (snapshot: { data: AppData; updatedAt: string }, reason: string) => {
    const current = dataRef.current;
    const mergedSnapshot = mergeAppDataSnapshots(snapshot.data, current);
    const restored = sanitizeAppData({
      ...mergedSnapshot,
      backendUrl: current.backendUrl,
      autoBackupEnabled: current.autoBackupEnabled,
      autoBackupLastAt: snapshot.updatedAt,
      autoBackupLastError: ""
    });
    setData(restored);
    dataRef.current = restored;
    setSyncState("synced");
    await saveData(restored);
    if (reason !== "login") {
      showMessage("Datos actualizados", `Se cargaron cambios del servidor (${formatAuditDate(snapshot.updatedAt)}).`);
    }
  };

  const enterSession = async (nextData: AppData, nextUser: User, token: string, passwordHash = "") => {
    let sessionToken = token;
    if (!sessionToken) {
    const storedSession = await loadSession();
      const sameUser = storedSession?.user && (
        storedSession.user.id === nextUser.id ||
        storedSession.user.email.trim().toLowerCase() === nextUser.email.trim().toLowerCase() ||
        (storedSession.companyRuc && storedSession.companyRuc === nextData.issuer.ruc)
      );
      if (sameUser && storedSession?.token) sessionToken = storedSession.token;
    }
    await saveData(nextData);
    await saveSession(nextUser, sessionToken, passwordHash, nextData.issuer.ruc);
    setData(nextData);
    dataRef.current = nextData;
    setBackendToken(sessionToken);
    backendTokenRef.current = sessionToken;
    setSession(nextUser);
    sessionRef.current = nextUser;
    setSyncState("synced");
    setLoginStatus(null);
    setCompanyOptions([]);
    setPendingLogin(null);
    setEstablishmentOptionsVisible(false);
    setTab("dashboard");
    if (nextUser.mustChangePassword) {
      setNewPasswordForm({ password: "", confirm: "" });
      setPasswordChangeStatus({ tone: "info", message: "Por seguridad, cree una nueva contrasena para reemplazar la clave temporal." });
      setPasswordChangeVisible(true);
    }
  };

  const submitNewPassword = async () => {
    const nextPassword = newPasswordForm.password.trim();
    if (nextPassword.length < 8) {
      setPasswordChangeStatus({ tone: "error", message: "La nueva contrasena debe tener al menos 8 caracteres." });
      return;
    }
    if (nextPassword !== newPasswordForm.confirm.trim()) {
      setPasswordChangeStatus({ tone: "error", message: "Las contrasenas no coinciden." });
      return;
    }
    if (!sessionRef.current) return;
    setChangingPassword(true);
    setPasswordChangeStatus({ tone: "info", message: "Guardando nueva contrasena..." });
    try {
      const result = await changeBackendPassword(dataRef.current.backendUrl, nextPassword, backendTokenRef.current);
      const changedUser = result.user!;
      const passwordHash = await hashPassword(nextPassword);
      const updatedUser: User = {
        ...sessionRef.current,
        ...changedUser,
        role: (changedUser.role || sessionRef.current.role) as UserRole,
        passwordHash,
        mustChangePassword: false
      };
      const nextUsers = dataRef.current.users.map((user) =>
        user.id === updatedUser.id || user.email.trim().toLowerCase() === updatedUser.email.trim().toLowerCase()
          ? { ...user, password: undefined, passwordHash, mustChangePassword: false, updatedAt: new Date().toISOString() }
          : user
      );
      const nextData = { ...dataRef.current, users: nextUsers };
      await saveData(nextData);
      await saveSession(updatedUser, result.token || backendTokenRef.current, passwordHash, nextData.issuer.ruc);
      setData(nextData);
      dataRef.current = nextData;
      setSession(updatedUser);
      sessionRef.current = updatedUser;
      setBackendToken(result.token || backendTokenRef.current);
      backendTokenRef.current = result.token || backendTokenRef.current;
      setPasswordChangeVisible(false);
      setPasswordChangeStatus(null);
      Alert.alert("Contrasena actualizada", "Su nueva contrasena quedo guardada correctamente.");
    } catch (error) {
      setPasswordChangeStatus({ tone: "error", message: error instanceof Error ? error.message : "No se pudo cambiar la contrasena." });
    } finally {
      setChangingPassword(false);
    }
  };

  const chooseLoginEstablishment = async (establishmentId: string) => {
    if (!pendingLogin) return;
    const establishment = normalizedEstablishments(pendingLogin.data.issuer).find((item) => item.id === establishmentId);
    if (!establishment) return;
    const nextIssuer = issuerWithEstablishment({ ...pendingLogin.data.issuer, activeEstablishmentId: establishment.id }, establishment);
    await enterSession({ ...pendingLogin.data, issuer: nextIssuer }, pendingLogin.user, pendingLogin.token, pendingLogin.passwordHash || "");
  };

  const refreshFromBackend = async (reason: "login" | "active" | "manual" = "manual") => {
    const current = dataRef.current;
    if (!sessionRef.current || current.autoBackupEnabled === false || !current.backendUrl) return;
    if ((current.pendingSync || []).length > 0 || pendingAutoBackupRef.current || autoBackupRunningRef.current) {
      if (reason === "manual") showMessage("Sincronizacion pendiente", "Primero se debe terminar de subir el cambio local antes de cargar datos del servidor.");
      return;
    }
    if (remoteRefreshRunningRef.current) return;

    const now = Date.now();
    if (reason !== "manual" && now - lastRemoteRefreshRef.current < REMOTE_REFRESH_THROTTLE_MS) return;
    remoteRefreshRunningRef.current = true;
    lastRemoteRefreshRef.current = now;

    try {
      const token = await ensureBackendToken(current.backendUrl);
      const snapshot = await restoreAppData<AppData>(current.backendUrl, token);
      if (!snapshot?.data) return;

      const remoteUpdatedAt = new Date(snapshot.updatedAt).getTime();
      const localSyncedAt = current.autoBackupLastAt ? new Date(current.autoBackupLastAt).getTime() : 0;
      if (!Number.isFinite(remoteUpdatedAt) || remoteUpdatedAt <= localSyncedAt + 1000) {
        if (reason === "manual") showMessage("Datos al dia", "Este dispositivo ya tiene la ultima copia del servidor.");
        return;
      }

      await applyRemoteSnapshot({ data: snapshot.data, updatedAt: snapshot.updatedAt }, reason);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo actualizar desde el servidor.";
      setData((latest) => {
        const merged = { ...latest, autoBackupLastError: shortText(`Actualizacion servidor: ${message}`, 180) };
        dataRef.current = merged;
        void saveData(merged);
        return merged;
      });
      setSyncState("error");
    } finally {
      remoteRefreshRunningRef.current = false;
    }
  };

  const login = async (companyId = "") => {
    const identifier = email.trim();
    const backendUrl = authBackendUrl.trim();
    const normalizedIdentifier = identifier.toLowerCase();
    setLoginStatus(null);
    setLoginErrorModalMessage("");
    if (!companyId) setCompanyOptions([]);
    if (!identifier || !password) {
      const message = "Ingrese correo o RUC y clave para iniciar sesion.";
      setLoginStatus({ tone: "error", message });
      setLoginErrorModalMessage(message);
      return;
    }
    if (/^\d+$/.test(identifier) && identifier.length !== 13) {
      const message = "El RUC debe tener 13 digitos. Revise el numero e intente nuevamente.";
      setLoginStatus({ tone: "error", message });
      setLoginErrorModalMessage(message);
      return;
    }
    if (!isValidUrl(backendUrl)) {
      const message = "Ingrese una URL valida del servidor.";
      setLoginStatus({ tone: "error", message });
      setLoginErrorModalMessage(message);
      return;
    }

    try {
      setLoginStatus({ tone: "info", message: "Validando acceso..." });
      const result = await loginBackend(backendUrl, identifier, password, companyId);
      const snapshot = await restoreAppData<AppData>(backendUrl, result.token || "");
      if (!result.user || !snapshot?.data) {
        const message = "El servidor valido el acceso, pero no devolvio los datos de la empresa. Intente nuevamente.";
        setLoginStatus({ tone: "error", message });
        Alert.alert("No se pudo cargar la empresa", message);
        return;
      }
      const restored = sanitizeAppData({
        ...snapshot.data,
        backendUrl,
        autoBackupEnabled: true,
        autoBackupLastAt: snapshot.updatedAt,
        autoBackupLastError: ""
      });
      const loginRuc = /^\d{13}$/.test(identifier) ? identifier : "";
      const restoredRuc = restored.issuer.ruc.replace(/\D/g, "");
      if (loginRuc && restoredRuc && restoredRuc !== loginRuc) {
        const message = `El servidor devolvio datos del RUC ${restoredRuc}, pero usted ingreso ${loginRuc}. Se cancelo el ingreso para evitar mezcla de empresas.`;
        setLoginStatus({ tone: "error", message });
        setLoginErrorModalMessage(message);
        return;
      }
      await saveData(restored);
      setData(restored);
      dataRef.current = restored;
      const remoteUser = {
        id: result.user.id,
        companyId: result.user.companyId,
        name: result.user.name,
        email: result.user.email,
        role: (result.user.role || "vendedor") as UserRole,
        mustChangePassword: Boolean(result.user.mustChangePassword)
      };
      const token = result.token || "";
      const passwordHash = await hashPassword(password);
      const establishments = normalizedEstablishments(restored.issuer).filter((item) => item.active !== false);
      if (establishments.length > 1) {
        setPendingLogin({ data: restored, user: remoteUser, token, passwordHash });
        setEstablishmentOptionsVisible(true);
        setLoginStatus(null);
        setCompanyOptions([]);
        return;
      }
      await enterSession(restored, remoteUser, token, passwordHash);
      return;
    } catch (error) {
      const options = error instanceof Error ? (error as Error & { companyOptions?: BackendCompanyOption[] }).companyOptions : undefined;
      if (options?.length) {
        setCompanyOptions(options);
        setLoginStatus({ tone: "info", message: "Elija la empresa con la que desea trabajar." });
        return;
      }
      const message = loginErrorMessage(error);
      if (!isBackendConnectionError(error)) {
        const friendly = /^\d{13}$/.test(identifier) && message.includes("No encontramos")
          ? "No encontramos una empresa activa con ese RUC o la clave no coincide."
          : message;
        setLoginStatus({ tone: "error", message: friendly });
        setLoginErrorModalMessage(friendly);
        return;
      }
      setLoginStatus({ tone: "info", message: "Sin conexion con el servidor. Validando sesion guardada en este dispositivo..." });
    }

    const passwordHash = await hashPassword(password);
      const storedSession = await loadSession();
    if (storedSession?.user) {
      const storedEmailMatches = storedSession.user.email.trim().toLowerCase() === normalizedIdentifier;
      const rucMatches = /^\d{13}$/.test(identifier) && (storedSession.companyRuc === identifier || data.issuer.ruc === identifier);
      const passwordMatches = storedSession.passwordHash ? storedSession.passwordHash === passwordHash : Boolean(storedSession.token);
      if ((storedEmailMatches || rucMatches) && passwordMatches) {
        const localData = sanitizeAppData({ ...data, backendUrl, autoBackupEnabled: true, autoBackupLastError: "" });
        await enterSession(localData, storedSession.user, storedSession.token || "", storedSession.passwordHash || passwordHash);
        return;
      }
    }
    const found = data.users.find((user) => {
      const emailMatches = user.email.trim().toLowerCase() === normalizedIdentifier;
      return emailMatches && (user.passwordHash === passwordHash || user.password === password);
    });
    const rucUser = /^\d{13}$/.test(identifier) && data.issuer.ruc === identifier
      ? data.users.find((user) => user.passwordHash === passwordHash || user.password === password)
      : undefined;
    const localUser = found || rucUser;
    if (!localUser) {
      const message = "No hay conexion con el servidor y no existe una sesion local valida para esos datos.";
      setLoginStatus({ tone: "error", message });
      setLoginErrorModalMessage(message);
      return;
    }
    const localEstablishments = normalizedEstablishments(data.issuer).filter((item) => item.active !== false);
    const localData = sanitizeAppData({ ...data, backendUrl, autoBackupEnabled: true, autoBackupLastError: "" });
    if (localEstablishments.length > 1) {
      setPendingLogin({ data: localData, user: localUser, token: "", passwordHash });
      setEstablishmentOptionsVisible(true);
      setLoginStatus(null);
      return;
    }
    await enterSession(localData, localUser, "", passwordHash);
  };

  const registerTenant = async () => {
    if (registering) return;
    setRegisterStatus(null);
    const backendUrl = authBackendUrl.trim();
    const form = {
      ...registerForm,
      ruc: registerForm.ruc.trim(),
      businessName: registerForm.businessName.trim(),
      tradeName: registerForm.tradeName.trim(),
      adminName: registerForm.adminName.trim(),
      email: registerForm.email.trim().toLowerCase()
    };
    if (!form.ruc || !form.businessName || !form.adminName || !form.email || !form.password) {
      setRegisterStatus({ tone: "error", message: "Complete RUC, negocio, administrador, correo y contrasena." });
      Alert.alert("Datos incompletos", "Ingrese RUC, nombre del negocio, nombre del administrador, correo y contrasena.");
      return;
    }
    if (!isValidUrl(backendUrl)) {
      setRegisterStatus({ tone: "error", message: "Ingrese una URL valida del servidor." });
      Alert.alert("URL del servidor", "Ingrese una URL valida del servidor para crear la cuenta.");
      return;
    }
    if (form.password.length < 8) {
      setRegisterStatus({ tone: "error", message: "La contrasena debe tener al menos 8 caracteres." });
      Alert.alert("Contrasena corta", "Use al menos 8 caracteres para proteger la cuenta.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setRegisterStatus({ tone: "error", message: "Las contrasenas no coinciden." });
      Alert.alert("Contrasenas distintas", "Confirme la misma contrasena.");
      return;
    } // Validacion basica de formato de correo. En el backend se validara la unicidad del correo y el formato del RUC.
    setRegistering(true);
    setRegisterStatus({ tone: "info", message: "Creando cuenta y preparando la empresa..." });
    try {
      const result = await registerBackend<AppData>(backendUrl, {
        company: {
          ruc: form.ruc,
          businessName: form.businessName,
          tradeName: form.tradeName || form.businessName,
          address: "Ecuador"
        },
        admin: {
          name: form.adminName,
          email: form.email,
          password: form.password
        },
        device: {
          deviceId: `${Platform.OS}-${uid()}`,
          deviceLabel: Platform.OS,
          platform: Platform.OS
        }
      });
      const snapshot = result.snapshot!;
      const registeredData = sanitizeAppData({
        ...initialData,
        ...snapshot.data,
        backendUrl,
        autoBackupEnabled: true,
        autoBackupLastAt: snapshot.updatedAt,
        autoBackupLastError: "",
        pendingSync: []
      });
      await saveData(registeredData);
      const user = {
        id: result.user!.id,
        name: result.user!.name,
        email: result.user!.email,
        role: (result.user!.role || "admin") as UserRole
      };
      const passwordHash = await hashPassword(form.password);
      const enterApp = () => {
        setData(registeredData);
        dataRef.current = registeredData;
        setBackendToken(result.token || "");
        backendTokenRef.current = result.token || "";
        setSession(user);
        sessionRef.current = user;
        void saveSession(user, result.token || "", passwordHash, registeredData.issuer.ruc);
        setEmail(form.email);
        setPassword("");
        setAuthMode("login");
        setRegisterForm(emptyRegisterForm);
        setRegisterStatus(null);
        setRegistering(false);
        setSyncState("synced");
        setOnboardingVisible(true);
      };
      setRegisterStatus({ tone: "success", message: "Cuenta creada. Demo activa por 30 dias." });
      enterApp();
      showMessage("Cuenta creada", "Demo activa por 30 dias. Ya puede configurar su empresa y empezar a vender.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Revise los datos e intente nuevamente.";
      setRegistering(false);
      setRegisterStatus({ tone: "error", message });
      Alert.alert("No se pudo crear la cuenta", message);
    }
  };

  const recoverPassword = async () => {
    if (recoveringPassword) return;
    const backendUrl = authBackendUrl.trim();
    const identifier = recoveryIdentifier.trim() || email.trim();
    setRecoverStatus(null);

    if (!isValidUrl(backendUrl)) {
      setRecoverStatus({ tone: "error", message: "Ingrese una URL valida del servidor." });
      return;
    }
    if (!identifier) {
      setRecoverStatus({ tone: "error", message: "Ingrese el correo o RUC de la cuenta." });
      return;
    }

    setRecoveringPassword(true);
    setRecoverStatus({ tone: "info", message: "Enviando clave temporal..." });
    try {
      const result = await requestPasswordReset(backendUrl, identifier);
      setRecoverStatus({ tone: "success", message: result.message || `Clave temporal enviada a ${result.email || "su correo"}.` });
      setEmail(identifier);
      setPassword("");
    } catch (error) {
      setRecoverStatus({ tone: "error", message: error instanceof Error ? error.message : "No se pudo recuperar la contrasena." });
    } finally {
      setRecoveringPassword(false);
    }
  };

  const ensureBackendToken = async (backendUrl: string) => {
    if (backendTokenRef.current) return backendTokenRef.current;
    const storedSession = await loadSession();
    if (storedSession?.token) {
      backendTokenRef.current = storedSession.token;
      setBackendToken(storedSession.token);
      return storedSession.token;
    }
    if (!password) {
      throw new Error("Para sincronizar debe iniciar sesion una vez con internet. Luego la app seguira trabajando offline con el token guardado.");
    }
    const result = await loginBackend(backendUrl, email, password, sessionRef.current?.companyId || "");
    const token = result.token || "";
    backendTokenRef.current = token;
    setBackendToken(token);
    if (sessionRef.current) {
      const passwordHash = await hashPassword(password);
      await saveSession(sessionRef.current, token, passwordHash, dataRef.current.issuer.ruc);
    }
    return token;
  };

  const logout = () => {
    setAppMenuVisible(false);
    setOnboardingVisible(false);
    setEstablishmentOptionsVisible(false);
    setEstablishmentSwitcherVisible(false);
    setPendingLogin(null);
    setPasswordChangeVisible(false);
    setNewPasswordForm({ password: "", confirm: "" });
    setPasswordChangeStatus(null);
    setBackendToken("");
    backendTokenRef.current = "";
    setSession(null);
    sessionRef.current = null;
    void clearSession();
    setTab("dashboard");
    setAuthMode("login");
    setRegistering(false);
    setRegisterStatus(null);
    setRegisterForm(emptyRegisterForm);
  };

  const switchActiveEstablishment = async (establishmentId: string) => {
    const establishments = normalizedEstablishments(data.issuer);
    const allowed = establishments.filter((item) => item.active !== false).slice(0, maxEmissionPointsForLicense(data.license));
    const next = allowed.find((item) => item.id === establishmentId);
    if (!next) {
      Alert.alert("Establecimiento no disponible", "Ese punto de emision no esta activo o no esta permitido por la licencia.");
      return;
    }

    const nextIssuer = issuerWithEstablishment({ ...data.issuer, establishments, activeEstablishmentId: next.id }, next);
    const nextData = appendAudit(
      { ...data, issuer: nextIssuer },
      session || undefined,
      "ACTIVE_ESTABLISHMENT_CHANGED",
      "issuer",
      data.issuer.ruc,
      `Establecimiento activo cambiado a ${next.name} ${next.establishment}-${next.emissionPoint}`,
      { establishment: next.establishment, emissionPoint: next.emissionPoint }
    );

    setEstablishmentSwitcherVisible(false);
    setAppMenuVisible(false);
    await persist(nextData);
    await syncPatchToBackend(data.backendUrl, backendToken, { baseData: data, issuer: nextIssuer, auditLogs: nextData.auditLogs.slice(0, 1) }, "Establecimiento pendiente de sincronizar", nextData, persist);
    showMessage("Establecimiento cambiado", `Ahora factura con ${next.name} ${next.establishment}-${next.emissionPoint}.`);
  };

  const openAdminSettings = (focus: "configuracion" | "licencia") => {
    setAppMenuVisible(false);
    if (availableTabs.includes("sri")) {
      setTab("sri");
      return;
    }
    Alert.alert(focus === "licencia" ? "Licencia" : "Configuracion", "Esta seccion esta disponible para usuarios administradores.");
  };

  const openSupport = () => {
    setAppMenuVisible(false);
    setSupportVisible(true);
    setSupportDiagnostic(buildSupportDiagnostic(dataRef.current, sessionRef.current, syncState));
    void refreshSupportDiagnostic();
  };

  const runManualSync = async () => {
    setAppMenuVisible(false);
    if (dataRef.current.autoBackupEnabled === false || !dataRef.current.backendUrl) {
      const enabled = sanitizeAppData({ ...dataRef.current, autoBackupEnabled: true, autoBackupLastError: "" });
      setData(enabled);
      dataRef.current = enabled;
      await saveData(enabled);
    }
    await flushAutoBackup();
    const current = dataRef.current;
    if (current.autoBackupEnabled !== false && current.backendUrl && ((current.pendingSync || []).length > 0 || syncStateRef.current !== "synced" || Boolean(current.autoBackupLastError))) {
      await runAutoBackup(current);
    }
    await refreshFromBackend("manual");
  };

  const hasReachableInternet = (networkState: Network.NetworkState) =>
    networkState.isInternetReachable === true || (networkState.isInternetReachable !== false && networkState.isConnected === true);

  const syncAfterConnectivityRestored = async (reason: "network" | "active" | "pending") => {
    const current = dataRef.current;
    if (!sessionRef.current || !current.backendUrl || current.autoBackupEnabled === false) return;
    if ((current.pendingSync || []).length === 0 && !pendingAutoBackupRef.current && syncStateRef.current === "synced" && !current.autoBackupLastError) {
      if (reason === "active") await refreshFromBackend("active");
      return;
    }
    const now = Date.now();
    if (connectivitySyncRunningRef.current || now - lastConnectivitySyncRef.current < CONNECTIVITY_SYNC_THROTTLE_MS) return;

    try {
      const networkState = await Network.getNetworkStateAsync();
      if (!hasReachableInternet(networkState)) return;
    } catch {
      return;
    }

    connectivitySyncRunningRef.current = true;
    lastConnectivitySyncRef.current = now;
    try {
      await flushAutoBackup();
      const latest = dataRef.current;
      if (latest.backendUrl && latest.autoBackupEnabled !== false && ((latest.pendingSync || []).length > 0 || syncStateRef.current !== "synced" || Boolean(latest.autoBackupLastError))) {
        await runAutoBackup(latest);
      }
      if ((dataRef.current.pendingSync || []).length === 0) {
        await refreshFromBackend("active");
      }
    } finally {
      connectivitySyncRunningRef.current = false;
    }
  };

  const openSyncCenter = () => {
    setAppMenuVisible(false);
    setSyncCenterVisible(true);
  };

  const retryPendingSync = async () => {
    setSyncActionLoading(true);
    try {
      await runManualSync();
      showMessage("Sincronizacion", formatSyncStatus(syncState, dataRef.current));
    } finally {
      setSyncActionLoading(false);
    }
  };

  const testSyncServer = async () => {
    setSyncActionLoading(true);
    try {
      const health = await checkBackendHealth(dataRef.current.backendUrl);
      showMessage("Servidor OK", `Backend responde: ${health.ok ? "SI" : "NO"}\nServicio: ${health.service || "FactuDarwin"}\nBase: ${health.database?.engine || "desconocida"}`);
    } catch (error) {
      showMessage("Servidor no disponible", error instanceof Error ? error.message : "No se pudo probar el servidor.");
    } finally {
      setSyncActionLoading(false);
    }
  };

  const refreshSupportDiagnostic = async () => {
    const current = dataRef.current;
    setSupportLoading(true);
    try {
      const health = current.backendUrl ? await checkBackendHealth(current.backendUrl) : undefined;
      let logs: TechnicalLog[] = [];
      if (sessionRef.current && canAccessSensitiveSupport(sessionRef.current.role) && backendTokenRef.current) {
        try {
          logs = await getTechnicalLogs(current.backendUrl, backendTokenRef.current, 8);
        } catch {
          logs = [];
        }
      }
      setSupportDiagnostic(buildSupportDiagnostic(current, sessionRef.current, syncState, health, logs));
    } catch (error) {
      setSupportDiagnostic(buildSupportDiagnostic(current, sessionRef.current, syncState, undefined, [], error instanceof Error ? error.message : "No se pudo probar el servidor."));
    } finally {
      setSupportLoading(false);
    }
  };

  const shareSupportDiagnostic = async () => {
    const text = supportDiagnostic || buildSupportDiagnostic(dataRef.current, sessionRef.current, syncState);
    try {
      const uri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}factudarwin-soporte.txt`;
      await FileSystem.writeAsStringAsync(uri, text, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "text/plain", dialogTitle: "Compartir diagnostico" });
        return;
      }
      showMessage("Diagnostico", text);
    } catch (error) {
      showMessage("No se pudo compartir", error instanceof Error ? error.message : "Intente nuevamente.");
    }
  };

  useEffect(() => {
    if (!ready || !session || data.autoBackupEnabled !== false || !data.backendUrl) return;
    const enabled = sanitizeAppData({ ...data, autoBackupEnabled: true, autoBackupLastError: "" });
    setData(enabled);
    dataRef.current = enabled;
    setSyncState("pending");
    void saveData(enabled);
    scheduleAutoBackup(enabled);
  }, [data, ready, session]);

  useEffect(() => {
    if (!ready || !session) return undefined;
    const subscription = Network.addNetworkStateListener((networkState) => {
      if (hasReachableInternet(networkState)) {
        void syncAfterConnectivityRestored("network");
      }
    });

    void syncAfterConnectivityRestored("pending");
    return () => subscription.remove();
  }, [ready, session?.id]);

  if (!ready) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.title}>Cargando...</Text>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.screen}>
        <ExpoStatusBar style="dark" />
        <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.loginPanel} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}>
          <View style={styles.loginBrandRow}>
            <View style={styles.loginBrandMark}>
              <Text style={styles.loginBrandMarkText}>FD</Text>
            </View>
            <Text style={styles.loginBrand}>{APP_BRAND}</Text>
          </View>
          {authMode === "login" ? (
            <>
              <View style={styles.authCard}>
                <Text style={styles.authTitle}>INICIAR SESION</Text>
                <Input label="URL del servidor" value={authBackendUrl} onChangeText={setAuthBackendUrl} autoCapitalize="none" />
                <Input label="Correo o RUC" value={email} onChangeText={setEmail} autoCapitalize="none" />
                <Input
                  label="Clave"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showLoginPassword}
                  autoCapitalize="none"
                  autoComplete="current-password"
                  rightElement={<PasswordVisibilityButton visible={showLoginPassword} onPress={() => setShowLoginPassword((visible) => !visible)} />}
                />
                <PrimaryButton label="Ingresar" onPress={() => login()} />
                {loginStatus ? <Text style={[styles.authFeedback, loginStatus.tone === "error" && styles.authFeedbackError, loginStatus.tone === "success" && styles.authFeedbackSuccess]}>{loginStatus.message}</Text> : null}
                {companyOptions.length > 0 ? (
                  <View style={styles.companyChoiceList}>
                    {companyOptions.map((company) => (
                      <Pressable key={company.id} style={styles.companyChoice} onPress={() => login(company.id)}>
                        <Text style={styles.companyChoiceTitle}>{company.tradeName || company.businessName || "Empresa"}</Text>
                        <Text style={styles.companyChoiceMeta}>RUC {company.ruc} | {company.role || "usuario"}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
              <Pressable style={styles.authLinkButton} onPress={() => setAuthMode("register")}>
                <Text style={styles.authLinkText}>No tienes cuenta? Registrate</Text>
              </Pressable>
              <Pressable
                style={styles.authLinkButton}
                onPress={() => {
                  setRecoveryIdentifier(email);
                  setRecoverStatus(null);
                  setAuthMode("forgot");
                }}
              >
                <Text style={styles.authMutedLink}>Olvide contrasena</Text>
              </Pressable>
            </>
          ) : authMode === "register" ? (
            <>
              <View style={styles.authCard}>
                <Text style={styles.authTitle}>CREAR CUENTA</Text>
                <Text style={styles.authSubtitle}>Registre su propia empresa con RUC activo en el SRI</Text>
                <Input label="URL del servidor" value={authBackendUrl} onChangeText={setAuthBackendUrl} autoCapitalize="none" />
                <Input label="RUC" value={registerForm.ruc} onChangeText={(ruc) => setRegisterForm({ ...registerForm, ruc })} keyboardType="number-pad" />
                <Input label="Razon social o nombre del negocio" value={registerForm.businessName} onChangeText={(businessName) => setRegisterForm({ ...registerForm, businessName })} placeholder="Ej. Comercial Andina" />
                <Input label="Nombre comercial (opcional)" value={registerForm.tradeName} onChangeText={(tradeName) => setRegisterForm({ ...registerForm, tradeName })} placeholder="Ej. Market Andina" />
                <Input label="Nombre de quien administrara la cuenta" value={registerForm.adminName} onChangeText={(adminName) => setRegisterForm({ ...registerForm, adminName })} placeholder="Ej. Maria Torres" />
                <Input label="Correo del administrador" value={registerForm.email} onChangeText={(value) => setRegisterForm({ ...registerForm, email: value })} autoCapitalize="none" placeholder="correo@empresa.com" />
                <Input label="Contrasena" value={registerForm.password} onChangeText={(value) => setRegisterForm({ ...registerForm, password: value })} secureTextEntry />
                <Input label="Confirmar contrasena" value={registerForm.confirmPassword} onChangeText={(value) => setRegisterForm({ ...registerForm, confirmPassword: value })} secureTextEntry />
                <View style={styles.authActionRow}>
                  <Pressable style={[styles.authActionPrimary, registering && styles.disabledButton]} onPress={registerTenant} disabled={registering}>
                    <Text style={styles.primaryButtonText}>{registering ? "Creando..." : "Crear cuenta"}</Text>
                  </Pressable>
                  <Pressable style={styles.authActionSecondary} onPress={() => { setAuthMode("login"); setRegisterStatus(null); setRegistering(false); }}>
                    <Text style={styles.authActionSecondaryText}>Regresar</Text>
                  </Pressable>
                </View>
                {registerStatus ? <Text style={[styles.authFeedback, registerStatus.tone === "error" && styles.authFeedbackError, registerStatus.tone === "success" && styles.authFeedbackSuccess]}>{registerStatus.message}</Text> : null}
              </View>
            </>
          ) : (
            <>
              <View style={styles.authCard}>
                <Text style={styles.authTitle}>RECUPERAR CONTRASENA</Text>
                <Text style={styles.authSubtitle}>Recibira una clave temporal en el correo registrado</Text>
                <Input label="URL del servidor" value={authBackendUrl} onChangeText={setAuthBackendUrl} autoCapitalize="none" />
                <Input label="Correo o RUC" value={recoveryIdentifier} onChangeText={setRecoveryIdentifier} autoCapitalize="none" />
                <PrimaryButton label={recoveringPassword ? "Enviando..." : "Enviar clave temporal"} onPress={recoverPassword} />
                {recoverStatus ? <Text style={[styles.authFeedback, recoverStatus.tone === "error" && styles.authFeedbackError, recoverStatus.tone === "success" && styles.authFeedbackSuccess]}>{recoverStatus.message}</Text> : null}
              </View>
              <Pressable style={styles.authLinkButton} onPress={() => { setAuthMode("login"); setRecoverStatus(null); setRecoveringPassword(false); }}>
                <Text style={styles.authLinkText}>Volver a iniciar sesion</Text>
              </Pressable>
            </>
          )}
          </ScrollView>
        </KeyboardAvoidingView>
        <Modal visible={Boolean(loginErrorModalMessage)} transparent animationType="fade" onRequestClose={() => setLoginErrorModalMessage("")}>
          <View style={styles.smallNoticeBackdrop}>
            <View style={styles.smallNoticeModal}>
              <Text style={styles.smallNoticeTitle}>No se pudo iniciar sesion</Text>
              <Text style={styles.smallNoticeText}>{loginErrorModalMessage}</Text>
              <Pressable style={styles.primaryButton} onPress={() => setLoginErrorModalMessage("")}>
                <Text style={styles.primaryButtonText}>Entendido</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
        <Modal visible={establishmentOptionsVisible} transparent animationType="fade" onRequestClose={() => undefined}>
          <View style={styles.smallNoticeBackdrop}>
            <View style={styles.establishmentPickerModal}>
              <Text style={styles.smallNoticeTitle}>Elija establecimiento</Text>
              <Text style={styles.smallNoticeText}>Seleccione con que sucursal o punto de emision va a trabajar.</Text>
              {(pendingLogin ? normalizedEstablishments(pendingLogin.data.issuer).filter((item) => item.active !== false) : []).map((item) => (
                <Pressable key={item.id} style={styles.establishmentPickerOption} onPress={() => { void chooseLoginEstablishment(item.id); }}>
                  <Text style={styles.companyChoiceTitle}>{item.name}</Text>
                  <Text style={styles.companyChoiceMeta}>{item.establishment}-{item.emissionPoint} | Sec. factura {item.sequential}</Text>
                </Pressable>
              ))}
              <Pressable style={styles.secondaryActionButton} onPress={() => { setPendingLogin(null); setEstablishmentOptionsVisible(false); }}>
                <Text style={styles.secondaryActionText}>Cancelar</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  const licenseState = appLicenseStatus(data.license);
  const syncNotice = syncState === "synced" && (data.pendingSync || []).length === 0 && data.autoBackupEnabled !== false ? "" : formatSyncStatus(syncState, data);
  const currentEstablishment = activeEstablishment(data.issuer);
  const switchableEstablishments = normalizedEstablishments(data.issuer).filter((item) => item.active !== false).slice(0, maxEmissionPointsForLicense(data.license));

  return (
    <SafeAreaView style={styles.screen}>
      <ExpoStatusBar style="dark" />
      <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
        <View style={[styles.header, { paddingTop: headerTopPadding }]}>
          <View style={styles.brandRow}>
            <CompanyLogoMark logoUrl={data.issuer.logoUrl} backendUrl={data.backendUrl} />
            <View style={styles.flex}>
              <Text style={styles.headerBrand}>{APP_BRAND}</Text>
              <View style={styles.headerMetaRow}>
                <Text style={styles.headerUser} numberOfLines={1}>{session.name || roleLabel(session.role)}</Text>
                <Text style={[styles.licensePill, !licenseState.active && styles.licensePillError]} numberOfLines={1}>{compactLicenseStatusLabel(data.license)}</Text>
              </View>
              <Text style={styles.scopeStatus} numberOfLines={1}>{currentEstablishment.name} {currentEstablishment.establishment}-{currentEstablishment.emissionPoint}</Text>
              {syncNotice ? <Text style={[styles.syncStatus, syncState === "error" && styles.syncStatusError]} numberOfLines={1}>{syncNotice}</Text> : null}
            </View>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Abrir menu" style={styles.headerMenuButton} onPress={() => setAppMenuVisible(true)}>
            <MenuIcon />
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={styles.tabsContent} keyboardShouldPersistTaps="handled">
          {availableTabs.map((item) => (
            <Pressable key={item} style={[styles.tab, tab === item && styles.tabActive]} onPress={() => setTab(item)}>
              <Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{tabLabel(item)}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <ScrollView
          contentContainerStyle={[styles.content, keyboardInset > 0 && { paddingBottom: keyboardInset + 220 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        >
          {tab === "dashboard" && <DashboardView data={data} user={session} onNavigate={setTab} />}
          {tab === "ventas" && <SalesView data={data} user={session} backendToken={backendToken} persist={persist} onXml={setXmlPreview} />}
          {tab === "clientes" && <ClientsView data={data} user={session} backendToken={backendToken} getBackendToken={ensureBackendToken} persist={persist} />}
          {tab === "productos" && <ProductsView data={data} user={session} backendToken={backendToken} persist={persist} />}
          {tab === "inventario" && <InventoryView data={data} user={session} backendToken={backendToken} persist={persist} />}
          {tab === "caja" && <CashClosingView data={data} user={session} backendToken={backendToken} persist={persist} />}
          {tab === "guias" && <GuidesView data={data} user={session} backendToken={backendToken} persist={persist} onXml={setXmlPreview} />}
          {tab === "usuarios" && session.role === "admin" && <UsersView data={data} user={session} backendToken={backendToken} persist={persist} />}
          {tab === "reportes" && <ReportsView data={data} onReport={setXmlPreview} />}
          {tab === "sri" && session.role === "admin" && <SriView data={data} user={session} backendToken={backendToken} getBackendToken={ensureBackendToken} persist={persist} onRefreshBackend={() => refreshFromBackend("manual")} />}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={appMenuVisible} transparent animationType="fade" onRequestClose={() => setAppMenuVisible(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setAppMenuVisible(false)}>
          <Pressable style={styles.appMenu}>
            <View style={styles.appMenuHeader}>
              <Text style={styles.appMenuTitle}>{session.name || roleLabel(session.role)}</Text>
              <Text style={styles.appMenuMeta}>{compactLicenseStatusLabel(data.license)}</Text>
            </View>
            <MenuAction icon="S" label="Sincronizar" onPress={() => { void runManualSync(); }} />
            <MenuAction icon="P" label="Pendientes sync" onPress={openSyncCenter} />
            {switchableEstablishments.length > 1 ? <MenuAction icon="E" label="Cambiar establecimiento" onPress={() => setEstablishmentSwitcherVisible(true)} /> : null}
            <MenuAction icon="C" label="Configuracion" onPress={() => openAdminSettings("configuracion")} />
            <MenuAction icon="L" label="Licencia" onPress={() => openAdminSettings("licencia")} />
            <MenuAction icon="?" label="Soporte" onPress={openSupport} />
            <View style={styles.appMenuDivider} />
            <MenuAction icon=">" label="Salir" tone="danger" onPress={logout} />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={syncCenterVisible} transparent animationType="slide" onRequestClose={() => setSyncCenterVisible(false)}>
        <View style={styles.creditModalBackdrop}>
          <View style={styles.diagnosticModal}>
            <View style={styles.creditModalHeader}>
              <View style={styles.flex}>
                <Text style={styles.creditModalTitle}>Sincronizacion</Text>
                <Text style={styles.creditModalMeta}>{formatSyncStatus(syncState, data)}</Text>
              </View>
              <Pressable style={styles.smallButton} onPress={() => setSyncCenterVisible(false)}>
                <Text style={styles.smallButtonText}>Cerrar</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.creditModalContent}>
              <View style={styles.operationGrid}>
                <OperationTile title="Pendientes" value={String((data.pendingSync || []).length)} detail="Cambios locales sin subir" tone={(data.pendingSync || []).length ? "warning" : "success"} />
                <OperationTile title="Estado" value={syncState === "syncing" ? "Subiendo" : syncState === "error" ? "Error" : "OK"} detail={data.autoBackupEnabled === false ? "Modo manual" : "Respaldo automatico"} tone={syncState === "error" ? "danger" : syncState === "syncing" || (data.pendingSync || []).length ? "warning" : "success"} />
              </View>
              <Text selectable style={styles.inlineInfo}>Servidor: {data.backendUrl || "sin URL configurada"}</Text>
              {data.autoBackupLastAt ? <Text style={styles.inlineInfo}>Ultima subida: {formatAuditDate(data.autoBackupLastAt)}</Text> : null}
              {data.autoBackupLastError ? <Text style={[styles.inlineInfo, styles.errorText]}>Ultimo error: {data.autoBackupLastError}</Text> : null}
              <View style={styles.buttonRow}>
                <Pressable style={[styles.primaryButton, syncActionLoading && styles.disabledButton]} onPress={() => { void retryPendingSync(); }} disabled={syncActionLoading}>
                  <Text style={styles.primaryButtonText}>{syncActionLoading ? "Procesando..." : "Reintentar pendientes"}</Text>
                </Pressable>
                <Pressable style={styles.secondaryActionButton} onPress={() => { void testSyncServer(); }} disabled={syncActionLoading}>
                  <Text style={styles.secondaryActionText}>Probar servidor</Text>
                </Pressable>
              </View>
              <Text style={styles.sectionMiniTitle}>Cola pendiente</Text>
              {(data.pendingSync || []).length === 0 ? <Empty text="No hay cambios pendientes. Este dispositivo esta limpio." /> : null}
              {(data.pendingSync || []).map((item) => (
                <View key={item.id} style={styles.pendingSyncCard}>
                  <Text style={styles.pendingSyncTitle}>{item.title}</Text>
                  <Text style={styles.pendingSyncMeta}>{formatAuditDate(item.createdAt)} | Intentos: {item.attempts}</Text>
                  {item.lastError ? <Text style={styles.pendingSyncError}>{item.lastError}</Text> : null}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={supportVisible} transparent animationType="slide" onRequestClose={() => setSupportVisible(false)}>
        <View style={styles.creditModalBackdrop}>
          <View style={styles.diagnosticModal}>
            <View style={styles.creditModalHeader}>
              <View style={styles.flex}>
                <Text style={styles.creditModalTitle}>Soporte</Text>
                <Text style={styles.creditModalMeta}>Diagnostico para revisar conexion, licencia y sincronizacion.</Text>
              </View>
              <Pressable style={styles.smallButton} onPress={() => setSupportVisible(false)}>
                <Text style={styles.smallButtonText}>Cerrar</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.creditModalContent}>
              <View style={styles.buttonRow}>
                <Pressable style={[styles.primaryButton, supportLoading && styles.disabledButton]} onPress={() => { void refreshSupportDiagnostic(); }} disabled={supportLoading}>
                  <Text style={styles.primaryButtonText}>{supportLoading ? "Revisando..." : "Actualizar diagnostico"}</Text>
                </Pressable>
                <Pressable style={styles.secondaryActionButton} onPress={() => { void shareSupportDiagnostic(); }}>
                  <Text style={styles.secondaryActionText}>Compartir</Text>
                </Pressable>
              </View>
              {supportLoading ? <Text style={styles.inlineInfo}>Consultando backend y logs tecnicos...</Text> : null}
              <Text selectable style={styles.diagnosticText}>{supportDiagnostic || buildSupportDiagnostic(data, session, syncState)}</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={establishmentSwitcherVisible} transparent animationType="fade" onRequestClose={() => setEstablishmentSwitcherVisible(false)}>
        <View style={styles.smallNoticeBackdrop}>
          <View style={styles.establishmentPickerModal}>
            <Text style={styles.smallNoticeTitle}>Cambiar establecimiento</Text>
            <Text style={styles.smallNoticeText}>Los proximos documentos usaran el punto seleccionado.</Text>
            {switchableEstablishments.map((item) => {
              const active = item.id === currentEstablishment.id;
              return (
                <Pressable key={item.id} style={[styles.establishmentPickerOption, active && styles.establishmentPickerOptionActive]} onPress={() => { void switchActiveEstablishment(item.id); }}>
                  <Text style={styles.companyChoiceTitle}>{item.name}</Text>
                  <Text style={styles.companyChoiceMeta}>{item.establishment}-{item.emissionPoint} | Sec. factura {item.sequential}</Text>
                </Pressable>
              );
            })}
            <Pressable style={styles.actionSheetCancel} onPress={() => setEstablishmentSwitcherVisible(false)}>
              <Text style={styles.actionSheetCancelText}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={onboardingVisible} transparent animationType="fade" onRequestClose={() => setOnboardingVisible(false)}>
        <View style={styles.onboardingBackdrop}>
          <View style={styles.onboardingCard}>
            <Text style={styles.onboardingEyebrow}>Cuenta lista</Text>
            <Text style={styles.onboardingTitle}>Preparemos la empresa</Text>
            <Text style={styles.onboardingText}>Complete estos pasos para que la app quede lista para facturar con su marca y datos SRI.</Text>
            <View style={styles.onboardingSteps}>
              <OnboardingStep number="1" title="Datos de empresa" text="RUC, razon social, direccion y secuenciales." />
              <OnboardingStep number="2" title="Logo del negocio" text="Se usara en RIDE, guias y reportes." />
              <OnboardingStep number="3" title="Firma electronica .p12" text="Necesaria para firmar y autorizar comprobantes." />
              <OnboardingStep number="4" title="Ambiente SRI" text="Empiece en pruebas y pase a produccion cuando todo este validado." />
            </View>
            <Pressable style={styles.onboardingPrimary} onPress={() => { setOnboardingVisible(false); setTab("sri"); }}>
              <Text style={styles.onboardingPrimaryText}>Configurar ahora</Text>
            </Pressable>
            <Pressable style={styles.onboardingSecondary} onPress={() => setOnboardingVisible(false)}>
              <Text style={styles.onboardingSecondaryText}>Despues</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={establishmentOptionsVisible} transparent animationType="fade" onRequestClose={() => undefined}>
        <View style={styles.smallNoticeBackdrop}>
          <View style={styles.establishmentPickerModal}>
            <Text style={styles.smallNoticeTitle}>Elija establecimiento</Text>
            <Text style={styles.smallNoticeText}>Seleccione con que sucursal o punto de emision va a trabajar.</Text>
            {(pendingLogin ? normalizedEstablishments(pendingLogin.data.issuer).filter((item) => item.active !== false) : []).map((item) => (
              <Pressable key={item.id} style={styles.establishmentPickerOption} onPress={() => { void chooseLoginEstablishment(item.id); }}>
                <Text style={styles.companyChoiceTitle}>{item.name}</Text>
                <Text style={styles.companyChoiceMeta}>{item.establishment}-{item.emissionPoint} | Sec. factura {item.sequential}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.secondaryActionButton} onPress={() => { setPendingLogin(null); setEstablishmentOptionsVisible(false); }}>
              <Text style={styles.secondaryActionText}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={passwordChangeVisible} transparent animationType="fade" onRequestClose={() => undefined}>
        <View style={styles.smallNoticeBackdrop}>
          <View style={styles.smallNoticeModal}>
            <Text style={styles.smallNoticeTitle}>Crear nueva contrasena</Text>
            <Text style={styles.smallNoticeText}>Ingresaste con una clave temporal. Para continuar, define una contrasena propia.</Text>
            <Input
              label="Nueva contrasena"
              value={newPasswordForm.password}
              onChangeText={(value) => setNewPasswordForm({ ...newPasswordForm, password: value })}
              secureTextEntry={!newPasswordVisible}
              autoCapitalize="none"
              autoComplete="new-password"
              rightElement={<PasswordVisibilityButton visible={newPasswordVisible} onPress={() => setNewPasswordVisible((visible) => !visible)} />}
            />
            <Input
              label="Confirmar contrasena"
              value={newPasswordForm.confirm}
              onChangeText={(value) => setNewPasswordForm({ ...newPasswordForm, confirm: value })}
              secureTextEntry={!newPasswordVisible}
              autoCapitalize="none"
              autoComplete="new-password"
            />
            {passwordChangeStatus ? <Text style={[styles.authFeedback, passwordChangeStatus.tone === "error" && styles.authFeedbackError, passwordChangeStatus.tone === "success" && styles.authFeedbackSuccess]}>{passwordChangeStatus.message}</Text> : null}
            <Pressable style={styles.primaryButton} onPress={() => { void submitNewPassword(); }} disabled={changingPassword}>
              <Text style={styles.primaryButtonText}>{changingPassword ? "Guardando..." : "Guardar nueva contrasena"}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(xmlPreview)} animationType="slide" onRequestClose={() => setXmlPreview("")}>
        <SafeAreaView style={styles.screen}>
          <View style={[styles.header, styles.xmlModalHeader, { paddingTop: headerTopPadding }]}>
            <Text style={styles.title}>Detalle tecnico</Text>
            <Pressable style={styles.smallButton} onPress={() => setXmlPreview("")}>
              <Text style={styles.smallButtonText}>Cerrar</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            <Text selectable style={styles.xml}>
              {xmlPreview}
            </Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
// eslint-disable-next-line complexity
function SalesView({ data, user, backendToken, persist, onXml }: { data: AppData; user: User; backendToken: string; persist: (data: AppData) => Promise<void>; onXml: (xml: string) => void }) {
  const [clientId, setClientId] = useState(data.clients[0]?.id ?? "");
  const [productId, setProductId] = useState(data.products[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [unitGrossPrice, setUnitGrossPrice] = useState(data.products[0] ? money(data.products[0].price) : "");
  const [grossDiscount, setGrossDiscount] = useState("0");
  const [discountMode, setDiscountMode] = useState<"amount" | "percent">("amount");
  const [documentType, setDocumentType] = useState<DocumentType>("factura");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("01");
  const [items, setItems] = useState<SaleItem[]>([]);
  const [editingSaleId, setEditingSaleId] = useState("");
  const [sourceTicketId, setSourceTicketId] = useState("");
  const [sourceProformaId, setSourceProformaId] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [retryingSaleId, setRetryingSaleId] = useState("");
  const [notice, setNotice] = useState("");
  const [issueNotice, setIssueNotice] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [saleScannerVisible, setSaleScannerVisible] = useState(false);
  const [priceOptionsVisible, setPriceOptionsVisible] = useState(false);
  const [editingLineIndex, setEditingLineIndex] = useState<number | null>(null);
  const [lineEditForm, setLineEditForm] = useState({
    quantity: "1",
    unitGrossPrice: "0",
    grossDiscount: "0",
    discountMode: "amount" as "amount" | "percent"
  });
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("TODAS");
  const [saleStartDate, setSaleStartDate] = useState("");
  const [saleEndDate, setSaleEndDate] = useState("");
  const [visibleClientCount, setVisibleClientCount] = useState(LIST_BATCH_SIZE);
  const [visibleProductCount, setVisibleProductCount] = useState(LIST_BATCH_SIZE);
  const [visibleSaleCount, setVisibleSaleCount] = useState(LIST_BATCH_SIZE);
  const [creditNoteSourceId, setCreditNoteSourceId] = useState("");
  const [creditNoteReason, setCreditNoteReason] = useState("Devolucion parcial");
  const [creditNoteQuantities, setCreditNoteQuantities] = useState<Record<string, string>>({});
  const [issuingCreditNote, setIssuingCreditNote] = useState(false);
  const [processingMessage, setProcessingMessage] = useState("");
  const [retentionSaleId, setRetentionSaleId] = useState("");
  const [retentionTaxType, setRetentionTaxType] = useState<RetentionTaxType>("IVA");
  const [retentionBase, setRetentionBase] = useState("");
  const [retentionPercentage, setRetentionPercentage] = useState("");
  const [retentionAmount, setRetentionAmount] = useState("");
  const [retentionDocumentNumber, setRetentionDocumentNumber] = useState("");
  const [retentionAuthorizationNumber, setRetentionAuthorizationNumber] = useState("");
  const [retentionReceivedAt, setRetentionReceivedAt] = useState(toInputDate(new Date()));
  const [retentionNotes, setRetentionNotes] = useState("");
  const [quickClientVisible, setQuickClientVisible] = useState(false);
  const [quickClientForm, setQuickClientForm] = useState({
    name: "",
    identification: "",
    email: "",
    phone: "",
    address: "",
    identificationType: "05" as Client["identificationType"]
  });

  const totals = useMemo(() => calculateTotals(items), [items]);
  const editingSale = useMemo(() => data.sales.find((sale) => sale.id === editingSaleId), [data.sales, editingSaleId]);
  const sourceTicket = useMemo(() => data.sales.find((sale) => sale.id === sourceTicketId), [data.sales, sourceTicketId]);
  const sourceProforma = useMemo(() => data.sales.find((sale) => sale.id === sourceProformaId), [data.sales, sourceProformaId]);
  const creditNoteSource = useMemo(() => data.sales.find((sale) => sale.id === creditNoteSourceId), [creditNoteSourceId, data.sales]);
  const creditNoteClient = useMemo(() => data.clients.find((client) => client.id === creditNoteSource?.clientId), [creditNoteSource, data.clients]);
  const retentionSale = useMemo(() => data.sales.find((sale) => sale.id === retentionSaleId), [data.sales, retentionSaleId]);
  const retentionClient = useMemo(() => data.clients.find((client) => client.id === retentionSale?.clientId), [retentionSale, data.clients]);
  const selectedProduct = useMemo(() => data.products.find((item) => item.id === productId), [data.products, productId]);
  const selectedClient = useMemo(() => data.clients.find((item) => item.id === clientId), [data.clients, clientId]);
  const filteredClientsForSale = useMemo(() => {
    const search = clientSearch.trim().toLowerCase();
    if (!search) return data.clients;
    return data.clients.filter((client) => client.name.toLowerCase().includes(search) || client.identification.includes(search));
  }, [clientSearch, data.clients]);
  const filteredProductsForSale = useMemo(() => {
    const search = productSearch.trim().toLowerCase();
    if (!search) return data.products;
    return data.products.filter((product) => product.name.toLowerCase().includes(search) || product.code.toLowerCase().includes(search));
  }, [data.products, productSearch]);
  const visibleClientsForSale = filteredClientsForSale.slice(0, visibleClientCount);
  const visibleProductsForSale = filteredProductsForSale.slice(0, visibleProductCount);

  useEffect(() => {
    setUnitGrossPrice(selectedProduct ? money(selectedProduct.price) : "");
  }, [selectedProduct]);

  useEffect(() => {
    setVisibleClientCount(LIST_BATCH_SIZE);
  }, [clientSearch]);

  useEffect(() => {
    setVisibleProductCount(LIST_BATCH_SIZE);
  }, [productSearch]);

  useEffect(() => {
    if (filteredClientsForSale.length === 0) return;
    if (filteredClientsForSale.some((client) => client.id === clientId)) return;
    setClientId(filteredClientsForSale[0]?.id || "");
  }, [clientId, filteredClientsForSale]);

  useEffect(() => {
    if (filteredProductsForSale.length === 0) return;
    if (filteredProductsForSale.some((product) => product.id === productId)) return;
    setProductId(filteredProductsForSale[0]?.id || "");
  }, [filteredProductsForSale, productId]);

  const currentGrossPrice = parseDecimal(unitGrossPrice);
  const currentNetPrice = selectedProduct && currentGrossPrice > 0 ? grossToNetUnitPrice(currentGrossPrice, selectedProduct.ivaRate) : 0;
  const currentQty = Math.max(0, parseDecimal(quantity) || 0);
  const currentGrossLineTotal = currentGrossPrice > 0 ? currentGrossPrice * currentQty : 0;
  const currentGrossDiscount =
    discountMode === "percent"
      ? currentGrossLineTotal * Math.max(0, parseDecimal(grossDiscount) || 0) / 100
      : Math.max(0, parseDecimal(grossDiscount) || 0);
  const currentDiscount = selectedProduct ? grossToNetUnitPrice(currentGrossDiscount, selectedProduct.ivaRate) : 0;
  const currentTaxPerUnit = selectedProduct ? calculateLineTax({ productId: selectedProduct.id, code: selectedProduct.code, name: selectedProduct.name, quantity: 1, unitPrice: currentNetPrice, discount: 0, ivaRate: selectedProduct.ivaRate }) : 0;
  const scopedSales = useMemo(() => data.sales.filter((sale) => saleInActiveScope(sale, data)), [data]);
  const filteredSales = useMemo(() => {
    const search = invoiceSearch.trim().toLowerCase();
    const startBoundary = saleStartDate.trim() ? parseInputDate(saleStartDate, "start") : null;
    const endBoundary = saleEndDate.trim() ? parseInputDate(saleEndDate, "end") : null;

    return scopedSales.filter((sale) => {
      const client = data.clients.find((item) => item.id === sale.clientId);
      const convertedDocument = sale.status === "ANULADA" && Boolean(sale.voidReason?.toLowerCase().includes("convertida a"));
      const matchesStatus = statusFilter === "TODAS" || sale.status === statusFilter || (statusFilter === "NOTA_CREDITO" && isCreditNoteSale(sale));
      const saleDate = new Date(sale.createdAt);
      const matchesStartDate = !saleStartDate.trim() || (startBoundary && !Number.isNaN(saleDate.getTime()) && saleDate >= startBoundary);
      const matchesEndDate = !saleEndDate.trim() || (endBoundary && !Number.isNaN(saleDate.getTime()) && saleDate <= endBoundary);
      const documentLabel = documentTypeLabel(sale);
      const matchesSearch =
        !search ||
        sale.sequence.toLowerCase().includes(search) ||
        sale.accessKey.toLowerCase().includes(search) ||
        sale.authorizationNumber?.toLowerCase().includes(search) ||
        documentLabel.toLowerCase().includes(search) ||
        client?.name.toLowerCase().includes(search) ||
        client?.identification.toLowerCase().includes(search);

      const hiddenConvertedInNormalView = statusFilter === "TODAS" && !search && convertedDocument;
      return !hiddenConvertedInNormalView && matchesStatus && matchesStartDate && matchesEndDate && matchesSearch;
    }).sort(compareSalesNewestFirst);
  }, [data.clients, invoiceSearch, saleEndDate, saleStartDate, scopedSales, statusFilter]);
  const visibleSales = filteredSales.slice(0, visibleSaleCount);

  useEffect(() => {
    setVisibleSaleCount(LIST_BATCH_SIZE);
  }, [invoiceSearch, saleEndDate, saleStartDate, statusFilter]);

  const setSalesDateRangeToday = () => {
    const today = toInputDate(new Date());
    setSaleStartDate(today);
    setSaleEndDate(today);
  };

  const setSalesDateRangeMonth = () => {
    const now = new Date();
    setSaleStartDate(toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)));
    setSaleEndDate(toInputDate(now));
  };

  const clearSalesDateRange = () => {
    setSaleStartDate("");
    setSaleEndDate("");
  };

  const invoiceStats = useMemo(() => {
    const authorized = scopedSales.filter((sale) => isInvoiceSale(sale) && sale.status === "AUTORIZADA");
    const rejected = scopedSales.filter((sale) => sale.status === "RECHAZADA");
    const internal = scopedSales.filter((sale) => sale.documentType === "nota_venta");
    const creditNotes = scopedSales.filter((sale) => sale.documentType === "nota_credito" && sale.status === "AUTORIZADA");
    const proformas = scopedSales.filter((sale) => sale.documentType === "proforma" && sale.status === "PROFORMA");
    const totalAuthorized = authorized.reduce((sum, sale) => sum + sale.total, 0) - creditNotes.reduce((sum, sale) => sum + sale.total, 0);
    const retentionTotal = (data.receivedRetentions || []).reduce((sum, retention) => sum + retention.amount, 0);

    return {
      count: scopedSales.length,
      authorized: authorized.length,
      internal: internal.length,
      creditNotes: creditNotes.length,
      proformas: proformas.length,
      rejected: rejected.length,
      totalAuthorized,
      retentionTotal
    };
  }, [data.receivedRetentions, scopedSales]);
  const creditNotePreviewItems = useMemo(() => {
    if (!creditNoteSource) return [];
    return buildCreditNoteItemsFromQuantities(creditNoteSource, data.sales, creditNoteQuantities);
  }, [creditNoteQuantities, creditNoteSource, data.sales]);
  const creditNotePreviewTotals = useMemo(() => calculateTotals(creditNotePreviewItems), [creditNotePreviewItems]);
  const selectedProductProjectedStock = selectedProduct ? selectedProduct.stock - Math.max(0, parseDecimal(quantity) || 0) : 0;
  const selectedProductLowStock = Boolean(selectedProduct && selectedProductProjectedStock <= productMinStock(selectedProduct));

  const adjustQuantity = (amount: number) => {
    const current = Math.max(0, parseDecimal(quantity) || 0);
    const next = Math.max(1, current + amount);
    setQuantity(formatQuantity(next));
  };

  const addProductToSale = (product: Product | undefined, qty: number, grossPrice: number, discountValue: number, mode: "amount" | "percent") => {
    setIssueNotice("");
    if (!product || !qty || qty <= 0 || !grossPrice || grossPrice <= 0) {
      Alert.alert("Producto requerido", "Seleccione un producto, cantidad valida y precio publico mayor a cero.");
      return;
    }
    if (mode === "percent" && discountValue > 100) {
      Alert.alert("Descuento invalido", "El porcentaje de descuento no puede ser mayor a 100%.");
      return;
    }
    const discountGrossValue = mode === "percent" ? grossPrice * qty * discountValue / 100 : discountValue;
    const activeDocumentType = sourceTicket || sourceProforma ? documentType : editingSale?.documentType || documentType;
    if (activeDocumentType !== "proforma") {
      const quantityInCart = items.filter((item) => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
      const availableStock = getAvailableStockForSale(product, editingSale || sourceTicket);
      if (availableStock < quantityInCart + qty) {
        Alert.alert("Stock insuficiente", `Disponible: ${availableStock}. En esta venta ya tiene ${quantityInCart}.`);
        return;
      }
    }
    const unitPrice = grossToNetUnitPrice(grossPrice, product.ivaRate);
    const discount = grossToNetUnitPrice(discountGrossValue, product.ivaRate);
    const lineBaseBeforeDiscount = qty * unitPrice;
    if (discount > lineBaseBeforeDiscount) {
      Alert.alert("Descuento invalido", "El descuento no puede ser mayor al valor del producto.");
      return;
    }
    setItems((current) => [
      ...current,
      {
        productId: product.id,
        code: product.code,
        name: product.name,
        quantity: qty,
        unitPrice,
        cost: productCost(product),
        discount,
        ivaRate: product.ivaRate
      }
    ]);
    setQuantity("1");
    setGrossDiscount("0");
    setDiscountMode("amount");
    setUnitGrossPrice(money(product.price));
    setProductSearch("");
    setIssueNotice(`Agregado: ${product.name} x${formatQuantity(qty)} | Total $${money(calculateLineTotal({ productId: product.id, code: product.code, name: product.name, quantity: qty, unitPrice, cost: productCost(product), discount, ivaRate: product.ivaRate }))}. Listo para escanear el siguiente producto.`);
  };

  const addItem = () => {
    const product = data.products.find((item) => item.id === productId);
    addProductToSale(product, parseDecimal(quantity), parseDecimal(unitGrossPrice), Math.max(0, parseDecimal(grossDiscount) || 0), discountMode);
  };

  const addScannedCodeToSale = (rawCode: string) => {
    const code = normalizeProductCode(rawCode);
    if (!code) {
      Alert.alert("Codigo requerido", "Escanee o ingrese el codigo de barras.");
      return;
    }
    const product = data.products.find((item) => normalizeProductCode(item.code) === code);
    if (!product) {
      Alert.alert("Producto no encontrado", `No existe producto con codigo ${code}. Primero guardelo en Productos.`);
      return;
    }
    setProductId(product.id);
    setProductSearch("");
    addProductToSale(product, 1, product.price, 0, "amount");
  };

  const addProductSearchSubmit = () => {
    const raw = productSearch.trim();
    if (!raw) {
      Alert.alert("Producto requerido", "Escriba o escanee un codigo, o busque por descripcion.");
      return;
    }
    const exactProduct = data.products.find((item) => normalizeProductCode(item.code) === normalizeProductCode(raw));
    if (exactProduct) {
      addScannedCodeToSale(raw);
      return;
    }
    if (selectedProduct) {
      addItem();
      return;
    }
    Alert.alert("Producto no encontrado", "No se encontro un producto con ese codigo o descripcion.");
  };

  const openPriceOptions = () => {
    if (!selectedProduct) {
      Alert.alert("Producto requerido", "Seleccione un producto para ajustar precio o descuento.");
      return;
    }
    setPriceOptionsVisible(true);
  };

  const openQuickClientEditor = () => {
    if (!selectedClient) {
      Alert.alert("Cliente requerido", "Seleccione un cliente para editarlo.");
      return;
    }
    setQuickClientForm({
      name: selectedClient.name,
      identification: selectedClient.identification,
      email: selectedClient.email,
      phone: selectedClient.phone || "",
      address: selectedClient.address,
      identificationType: selectedClient.identificationType
    });
    setQuickClientVisible(true);
  };

  const saveQuickClient = async () => {
    if (!selectedClient) return;
    const clientData = {
      ...quickClientForm,
      name: quickClientForm.name.trim(),
      identification: normalizeClientIdentification(quickClientForm.identification),
      email: quickClientForm.email.trim(),
      phone: quickClientForm.phone.trim(),
      address: quickClientForm.address.trim(),
      updatedAt: new Date().toISOString()
    };
    if (!clientData.name || !clientData.identification) {
      Alert.alert("Datos incompletos", "Ingrese nombre e identificacion del cliente.");
      return;
    }// Verificar duplicados por identificacion, ignorando el cliente que se esta editando
    const duplicate = findDuplicateClient(data.clients, clientData.identification, selectedClient.id);
    if (duplicate) {
      Alert.alert("Cliente duplicado", `Ya existe un cliente con esa identificacion: ${duplicate.name}.`);
      return;
    }
    const updatedClient = { ...selectedClient, ...clientData };
    const nextData = appendAudit({
      ...data,
      clients: data.clients.map((client) => client.id === selectedClient.id ? updatedClient : client)
    }, user, "CLIENT_UPDATED_FROM_SALE", "client", selectedClient.id, `Cliente actualizado desde venta: ${updatedClient.name}`);

    await persist(nextData);
    await syncPatchToBackend(data.backendUrl, backendToken, { baseData: data, clients: [updatedClient], auditLogs: nextData.auditLogs.slice(0, 1) }, "Cliente pendiente de sincronizar", nextData, persist);
    setQuickClientVisible(false);
    setIssueNotice("Cliente actualizado. Puede continuar con la venta.");
    showMessage("Cliente actualizado", "Datos corregidos. Puede continuar sin perder el detalle de la venta.");
  };

  const openLineEditor = (index: number) => {
    const item = items[index];
    if (!item) return;
    setEditingLineIndex(index);
    setLineEditForm({
      quantity: formatQuantity(item.quantity),
      unitGrossPrice: money(calculateGrossUnitPrice(item)),
      grossDiscount: money(calculateLineGrossDiscount(item)),
      discountMode: "amount"
    });
  };

  const closeLineEditor = () => {
    setEditingLineIndex(null);
    setLineEditForm({ quantity: "1", unitGrossPrice: "0", grossDiscount: "0", discountMode: "amount" });
  };

  const saveLineEdit = () => {
    if (editingLineIndex === null) return;
    const currentItem = items[editingLineIndex];
    if (!currentItem) return;
    const product = data.products.find((item) => item.id === currentItem.productId);
    const qty = parseDecimal(lineEditForm.quantity);
    const grossPrice = parseDecimal(lineEditForm.unitGrossPrice);
    const discountValue = Math.max(0, parseDecimal(lineEditForm.grossDiscount) || 0);
    if (!product || !qty || qty <= 0 || !grossPrice || grossPrice <= 0) {
      Alert.alert("Linea incompleta", "Ingrese cantidad y precio validos.");
      return;
    }
    if (lineEditForm.discountMode === "percent" && discountValue > 100) {
      Alert.alert("Descuento invalido", "El porcentaje de descuento no puede ser mayor a 100%.");
      return;
    }
    const activeDocumentType = sourceTicket || sourceProforma ? documentType : editingSale?.documentType || documentType;
    if (activeDocumentType !== "proforma") {
      const quantityInOtherLines = items.reduce((sum, item, index) => index !== editingLineIndex && item.productId === product.id ? sum + item.quantity : sum, 0);
      const availableStock = getAvailableStockForSale(product, editingSale || sourceTicket);
      if (availableStock < quantityInOtherLines + qty) {
        Alert.alert("Stock insuficiente", `Disponible: ${availableStock}. En otras lineas ya tiene ${quantityInOtherLines}.`);
        return;
      }
    }
    const discountGrossValue = lineEditForm.discountMode === "percent" ? grossPrice * qty * discountValue / 100 : discountValue;
    const unitPrice = grossToNetUnitPrice(grossPrice, currentItem.ivaRate);
    const discount = grossToNetUnitPrice(discountGrossValue, currentItem.ivaRate);
    if (discount > qty * unitPrice) {
      Alert.alert("Descuento invalido", "El descuento no puede ser mayor al valor del producto.");
      return;
    }
    setItems((current) => current.map((item, index) => index === editingLineIndex ? { ...item, quantity: qty, unitPrice, discount } : item));
    closeLineEditor();
    setIssueNotice("Detalle actualizado.");
  };

  const saveInternalSaleFromCurrentForm = async (options?: { offlineFallback?: boolean }) => {
    const createdAt = editingSale?.createdAt || new Date().toISOString();
    const savedAt = new Date().toISOString();
    const documentIssuer = activeIssuer(data);
    const documentEstablishment = activeEstablishment(data.issuer);
    const legacyScopeId = normalizedEstablishments(data.issuer)[0]?.id || documentEstablishment.id;
    const sequence = editingSale?.sequence || nextInternalSequence(data.sales, documentEstablishment.id, legacyScopeId);
    const sale: Sale = {
      id: editingSale?.id || uid(),
      documentType: "nota_venta",
      establishment: documentIssuer.establishment,
      emissionPoint: documentIssuer.emissionPoint,
      establishmentName: documentEstablishment.name,
      clientId,
      userId: editingSale?.userId || user.id,
      createdAt,
      sequence,
      accessKey: "",
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      paymentMethod,
      status: "INTERNA",
      items
    };
    const restoredProducts = editingSale && saleStatusReducesStock(editingSale.status) ? restoreSaleStock(data.products, editingSale) : data.products;
    const restoreMovements = editingSale && saleStatusReducesStock(editingSale.status) ? buildStockMovements(data.products, editingSale, "entrada", "Reverso por correccion de nota de venta", user.id, savedAt) : [];
    const saleMovements: InventoryMovement[] = [];
    const saleStockChanges = new Map<string, number>();
    items.forEach((item) => {
      saleStockChanges.set(item.productId, (saleStockChanges.get(item.productId) || 0) + item.quantity);
    });
    const nextProducts = restoredProducts.map((product) => {
      const quantity = saleStockChanges.get(product.id) || 0;
      if (quantity <= 0) return product;
      const stockAfter = product.stock - quantity;
      saleMovements.push({
        id: uid(),
        productId: product.id,
        productName: product.name,
        type: "salida",
        quantity,
        stockBefore: product.stock,
        stockAfter,
        reason: options?.offlineFallback ? "Ticket guardado sin internet" : editingSale ? "Nota de venta corregida" : "Nota de venta interna",
        reference: sequence,
        userId: user.id,
        createdAt: savedAt
      });
      return { ...product, stock: stockAfter, updatedAt: createdAt };
    });

    const nextSales = editingSale
      ? data.sales.map((item) => (item.id === editingSale.id ? sale : item))
      : sourceProforma
        ? [sale, ...data.sales.map((item) => item.id === sourceProforma.id ? { ...item, status: "ANULADA" as const, voidReason: `Convertida a ticket ${sale.sequence}`, voidedAt: savedAt, sriMessage: `Convertida a ticket ${sale.sequence}` } : item)]
        : [sale, ...data.sales];
    const nextData = appendAudit({
      ...data,
      products: nextProducts,
      inventoryMovements: [...restoreMovements, ...saleMovements, ...(data.inventoryMovements || [])],
      sales: nextSales
    }, user, editingSale ? "INTERNAL_SALE_UPDATED" : "INTERNAL_SALE_CREATED", "sale", sale.id, `${options?.offlineFallback ? "Ticket offline creado" : editingSale ? "Nota de venta actualizada" : "Nota de venta creada"}: ${sale.sequence}`, { total: sale.total });

    await persist(nextData);
    await syncSalePatchToBackend(data.backendUrl, backendToken, {
      baseData: data,
      sales: nextSales.filter((item) => [sale.id, sourceProforma?.id].filter(Boolean).includes(item.id)),
      products: nextProducts.filter((product) => saleStockChanges.has(product.id)),
      inventoryMovements: [...restoreMovements, ...saleMovements],
      auditLogs: nextData.auditLogs.slice(0, 1)
    }, nextData, persist);
    setItems([]);
    setEditingSaleId("");
    setSourceTicketId("");
    setSourceProformaId("");
    setDocumentType("factura");
    const message = options?.offlineFallback
      ? "Se guardo como ticket interno. Cuando vuelva internet, abra el ticket y use Facturar."
      : "La nota de venta se registro como movimiento interno.";
    setIssueNotice(message);
    showMessage(options?.offlineFallback ? "Venta guardada sin internet" : "Nota guardada", message);
  };

  const issue = async () => {
    setIssueNotice("");
    const client = data.clients.find((item) => item.id === clientId);
    if (!client || items.length === 0) {
      showMessage("Documento incompleto", "Seleccione cliente y agregue al menos un producto.");
      return;
    }
    const currentDocumentType = sourceTicket || sourceProforma ? documentType : editingSale?.documentType || documentType;
    const stockCredits = buildStockCredits(editingSale || sourceTicket);

    if (currentDocumentType === "proforma") {
      const validationErrors = validateBeforeProforma(data, items, totals);
      if (validationErrors.length > 0) {
        const message = validationErrors.map((error) => `- ${error}`).join("\n");
        setIssueNotice(message);
        showMessage("Revise antes de guardar", message);
        return;
      }

      const createdAt = editingSale?.createdAt || new Date().toISOString();
      const documentIssuer = activeIssuer(data);
      const documentEstablishment = activeEstablishment(data.issuer);
      const legacyScopeId = normalizedEstablishments(data.issuer)[0]?.id || documentEstablishment.id;
      const sequence = editingSale?.sequence || nextProformaSequence(data.sales, documentEstablishment.id, legacyScopeId);
      const sale: Sale = {
        id: editingSale?.id || uid(),
        documentType: "proforma",
        establishment: documentIssuer.establishment,
        emissionPoint: documentIssuer.emissionPoint,
        establishmentName: documentEstablishment.name,
        clientId,
        userId: editingSale?.userId || user.id,
        createdAt,
        sequence,
        accessKey: "",
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        paymentMethod,
        status: "PROFORMA",
        items
      };

      await persist(appendAudit({
        ...data,
        sales: editingSale ? data.sales.map((item) => (item.id === editingSale.id ? sale : item)) : [sale, ...data.sales]
      }, user, editingSale ? "PROFORMA_UPDATED" : "PROFORMA_CREATED", "sale", sale.id, `${editingSale ? "Proforma actualizada" : "Proforma creada"}: ${sale.sequence}`, { total: sale.total }));
      setItems([]);
      setEditingSaleId("");
      setSourceTicketId("");
      setSourceProformaId("");
      setDocumentType("factura");
      setIssueNotice("Proforma guardada. No descuenta inventario hasta convertirse.");
      showMessage("Proforma guardada", "La proforma quedo registrada como cotizacion.");
      return;
    }

    if (currentDocumentType === "nota_venta") {
      const validationErrors = validateBeforeInternalSale(data, items, totals, stockCredits);
      if (validationErrors.length > 0) {
        const message = validationErrors.map((error) => `- ${error}`).join("\n");
        setIssueNotice(message);
        showMessage("Revise antes de guardar", message);
        return;
      }

      await saveInternalSaleFromCurrentForm();
      return;
    }

    const invoiceClient = normalizeClientForInvoice(client);
    if (editingSale && getRetryInfo(editingSale).today >= MAX_DAILY_RETRIES) {
      const message = `Esta factura ya tiene ${MAX_DAILY_RETRIES} reintento(s) hoy. Corrija y vuelva a intentar manana.`;
      setIssueNotice(message);
      showMessage("Limite diario de reintentos", message);
      return;
    }

    const documentIssuer = activeIssuer(data);
    const documentEstablishment = activeEstablishment(data.issuer);
    const dataForDocument = { ...data, issuer: documentIssuer };
    const validationErrors = validateBeforeIssue(dataForDocument, invoiceClient, items, totals, stockCredits);
    validateEmissionPointLicense(data, documentIssuer, validationErrors);
    if (validationErrors.length > 0) {
      const message = validationErrors.map((error) => `- ${error}`).join("\n");
      setIssueNotice(message);
      showMessage("Revise antes de emitir", message);
      return;
    }
    const createdAt = editingSale?.createdAt || new Date().toISOString();
    let sequence = editingSale?.sequence || nextSequence(documentIssuer.sequential);
    let accessKey = editingSale?.accessKey || createAccessKey(new Date(createdAt), documentIssuer, sequence);
    let reservedByBackend = false;
    if (!editingSale) {
      try {
        setProcessingMessage("Preparando numero de factura...");
        const reserved = await reserveDocumentSequence(data.backendUrl, { documentType: "factura", issuer: documentIssuer, createdAt }, backendToken);
        if (Number(reserved.sequence) < Number(sequence)) {
          throw new Error(`El servidor devolvio el secuencial ${reserved.sequence}, menor al configurado ${sequence}. Guarde SRI y sincronice antes de emitir.`);
        }
        sequence = reserved.sequence || sequence;
        accessKey = reserved.accessKey || accessKey;
        reservedByBackend = true;
      } catch (error) {
        const message = userFriendlyActionError(error, "reserve-sequence");
        setIssueNotice(message);
        Alert.alert("Factura electronica requiere internet", `${message}\n\nPara emitir una factura electronica debe tener conexion a internet. Puede guardar esta venta como ticket interno y facturarla cuando vuelva la conexion.`, [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Guardar ticket",
            onPress: () => {
              void saveInternalSaleFromCurrentForm({ offlineFallback: true });
            }
          }
        ]);
        setProcessingMessage("");
        return;
      }
    }
    const retryAt = new Date().toISOString();
    const sale: Sale = {
      id: editingSale?.id || uid(),
      documentType: "factura",
      establishment: documentIssuer.establishment,
      emissionPoint: documentIssuer.emissionPoint,
      establishmentName: documentEstablishment.name,
      clientId,
      userId: editingSale?.userId || user.id,
      createdAt,
      sequence,
      accessKey,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      paymentMethod,
      status: "BORRADOR" as const,
      items,
      retryHistory: editingSale ? [...(editingSale.retryHistory || []), retryAt] : undefined
    };
    const saleForRetry: Sale = { ...sale, paymentMethod: sale.paymentMethod || "01" };
    if (!editingSale && isAccessKeyUsed(data, saleForRetry.accessKey)) {
      const message = `La clave de acceso ${saleForRetry.accessKey} ya existe en otro comprobante. Revise el secuencial antes de emitir.`;
      setIssueNotice(message);
      showMessage("Clave duplicada", message);
      return;
    }
    const unsignedXml = buildInvoiceXml(saleForRetry, invoiceClient, documentIssuer);
    setIssuing(true);
    setProcessingMessage(sourceTicket ? "Emitiendo factura desde ticket..." : sourceProforma ? "Emitiendo factura desde proforma..." : editingSale ? "Guardando correccion y reintentando emision..." : "Emitiendo factura...");
    setIssueNotice(sourceTicket ? "Emitiendo factura desde ticket..." : sourceProforma ? "Emitiendo factura desde proforma..." : editingSale ? "Guardando correccion y reintentando emision..." : "Guardando y emitiendo factura...");
    const restoredProducts = editingSale && saleStatusReducesStock(editingSale.status) ? restoreSaleStock(data.products, editingSale) : data.products;
    const restoreMovements = editingSale && saleStatusReducesStock(editingSale.status) ? buildStockMovements(data.products, editingSale, "entrada", "Reverso por correccion de factura", user.id, retryAt) : [];
    const savedDraftData: AppData = {
      ...data,
      issuer: editingSale ? data.issuer : updateIssuerEstablishmentSequence(data.issuer, documentEstablishment.id, "sequential", Math.max(documentIssuer.sequential + 1, Number(sequence) + 1)),
      products: restoredProducts,
      inventoryMovements: [...restoreMovements, ...(data.inventoryMovements || [])],
      sales: editingSale ? data.sales.map((item) => (item.id === editingSale.id ? saleForRetry : item)) : [saleForRetry, ...data.sales]
    };
    await persist(savedDraftData);

    let finalSale: Sale = saleForRetry;

    try {
      const sriResult = await authorizeInvoice(data.backendUrl, unsignedXml, backendToken);
      finalSale = {
        ...saleForRetry,
        accessKey: sriResult.accessKey || sale.accessKey,
        authorizationNumber: sriResult.authorizationNumber,
        authorizationDate: sriResult.authorizationDate,
        sriEnvironment: sriResult.sriEnvironment,
        sriMessage: sriResult.sriMessage,
        signedXml: sriResult.signedXml,
        authorizedXml: sriResult.authorizedXml,
        status: resolveInvoiceStatus(sriResult)
      };
      showMessage(explainSriResult(sriResult).title, sriUserMessage(sriResult));
    } catch (error) {
      const message = userFriendlyActionError(error, "authorize-invoice");
      finalSale = {
        ...sale,
        status: "RECHAZADA",
        sriMessage: message
      };
      setIssueNotice(message);
      showMessage("No se pudo firmar", message);
    }

    const shouldMoveStock = !sourceTicket && finalSale.status !== "RECHAZADA" && finalSale.status !== "ANULADA";
    const saleStockChanges = new Map<string, number>();
    if (shouldMoveStock) {
      items.forEach((item) => {
        saleStockChanges.set(item.productId, (saleStockChanges.get(item.productId) || 0) + item.quantity);
      });
    }
    const stockChangedProductIds = new Set<string>([
      ...Array.from(saleStockChanges.keys()),
      ...(editingSale?.items || []).map((item) => item.productId)
    ]);
    const saleMovements: InventoryMovement[] = [];
    const nextProducts = savedDraftData.products.map((product) => {
      const quantity = saleStockChanges.get(product.id) || 0;
      if (quantity <= 0) return product;
      const stockAfter = product.stock - quantity;
      saleMovements.push({
        id: uid(),
        productId: product.id,
        productName: product.name,
        type: "salida",
        quantity,
        stockBefore: product.stock,
        stockAfter,
        reason: editingSale ? "Venta corregida y facturada" : "Venta facturada",
        reference: sale.sequence,
        userId: user.id,
        createdAt
      });
      return { ...product, stock: stockAfter, updatedAt: retryAt };
    });

    const finalSales = savedDraftData.sales.map((item) => {
      if (item.id === finalSale.id) return finalSale;
      if (sourceTicket && finalSale.status === "AUTORIZADA" && item.id === sourceTicket.id) {
        return {
          ...item,
          status: "ANULADA" as const,
          voidReason: `Convertida a factura ${finalSale.sequence}`,
          voidedAt: new Date().toISOString(),
          sriMessage: `Convertida a factura ${finalSale.sequence}`
        };
      }
      if (sourceProforma && finalSale.status === "AUTORIZADA" && item.id === sourceProforma.id) {
        return {
          ...item,
          status: "ANULADA" as const,
          voidReason: `Convertida a factura ${finalSale.sequence}`,
          voidedAt: new Date().toISOString(),
          sriMessage: `Convertida a factura ${finalSale.sequence}`
        };
      }
      return item;
    });
    const finalData = appendAudit({
      ...savedDraftData,
      products: nextProducts,
      inventoryMovements: [...saleMovements, ...(savedDraftData.inventoryMovements || [])],
      sales: finalSales
    }, user, editingSale ? "INVOICE_REISSUED" : "INVOICE_CREATED", "sale", finalSale.id, `Factura ${finalSale.sequence} guardada con estado ${finalSale.status}`, { total: finalSale.total, status: finalSale.status, accessKey: finalSale.accessKey, sequenceSource: reservedByBackend ? "servidor" : "local" });
    await persist(finalData);
    await syncSalePatchToBackend(data.backendUrl, backendToken, {
      baseData: data,
      issuer: finalData.issuer,
      sales: finalSales.filter((item) => [finalSale.id, sourceTicket?.id, sourceProforma?.id].filter(Boolean).includes(item.id)),
      products: finalData.products.filter((product) => stockChangedProductIds.has(product.id)),
      inventoryMovements: [...restoreMovements, ...saleMovements],
      auditLogs: finalData.auditLogs.slice(0, 1)
    }, finalData, persist);
    setItems([]);
    setEditingSaleId("");
    setSourceTicketId("");
    setSourceProformaId("");
    setIssuing(false);
    setProcessingMessage("");
    setIssueNotice(finalSale.status === "AUTORIZADA" ? "Factura autorizada y guardada." : `Factura guardada con estado ${finalSale.status}.`);
    showMessage("Factura guardada", finalSale.status === "AUTORIZADA" ? "Factura autorizada y guardada correctamente." : `Factura guardada con estado ${finalSale.status}.`);
  };

  const createRide = async (sale: Sale, client: Client) => {
    if (sale.status !== "AUTORIZADA") {
      Alert.alert("RIDE no disponible", "El RIDE se genera cuando la factura esta autorizada.");
      return;
    }

    const html = buildRideHtml(sale, client, issuerForSale(data.issuer, sale));

    if (typeof window !== "undefined" && "document" in window) {
      openHtmlViewer(html, `RIDE ${sale.sequence}`);
      return;
    }

    await handlePdfDocument(html, `RIDE ${sale.sequence}`, "RIDE factura");
  };

  const createTicket = async (sale: Sale, client: Client) => {
    const pageHeightMm = estimateTicketPageHeightMm(sale);
    const html = buildInternalTicketHtml(sale, client, issuerForSale(data.issuer, sale), pageHeightMm);

    if (typeof window !== "undefined" && "document" in window) {
      openHtmlViewer(html, `Ticket ${sale.sequence}`);
      return;
    }

    await handleTicketDocument(html, `Ticket ${sale.sequence}`, pageHeightMm);
  };

  const createProforma = async (sale: Sale, client: Client) => {
    const html = buildProformaHtml(sale, client, issuerForSale(data.issuer, sale));

    if (typeof window !== "undefined" && "document" in window) {
      openHtmlViewer(html, `Proforma ${sale.sequence}`);
      return;
    }

    await handlePdfDocument(html, `Proforma ${sale.sequence}`, "Proforma");
  };

  const createCreditNoteRide = async (sale: Sale, client: Client, source?: Sale) => {
    if (sale.status !== "AUTORIZADA") {
      Alert.alert("RIDE no disponible", "La nota de credito debe estar autorizada.");
      return;
    }

    const html = buildCreditNoteRideHtml(sale, client, issuerForSale(data.issuer, sale), source);
    if (Platform.OS === "web") {
      openHtmlViewer(html, `Nota credito ${sale.sequence}`);
      return;
    }

    await handlePdfDocument(html, `Nota credito ${sale.sequence}`, "Nota de credito");
  };

  const sendSaleEmail = async (sale: Sale, client: Client, source?: Sale, showAlerts = true) => {
    if (sale.status !== "AUTORIZADA") {
      if (showAlerts) Alert.alert("Correo no disponible", "Solo se envia cuando el documento esta autorizado.");
      return false;
    }

    if (!client.email) {
      if (showAlerts) Alert.alert("Cliente sin email", "Agregue un correo al cliente.");
      return false;
    }

    const isCreditNote = isCreditNoteSale(sale);
    const documentLabel = isCreditNote ? "nota de credito" : "factura";
    const documentTitle = isCreditNote ? "Nota de credito" : "Factura";
    const saleIssuer = issuerForSale(data.issuer, sale);
    const documentNumber = `${saleIssuer.establishment}-${saleIssuer.emissionPoint}-${sale.sequence}`;

    try {
      setProcessingMessage(`Enviando ${documentLabel} al correo del cliente...`);
      const rideHtml = isCreditNote ? buildCreditNoteRideHtml(sale, client, saleIssuer, source) : buildRideHtml(sale, client, saleIssuer);
      const pdfBase64 = await createPdfBase64(rideHtml);
      await sendInvoiceEmail(data.backendUrl, {
        to: client.email,
        subject: `${documentTitle} ${documentNumber}`,
        html: rideHtml,
        pdfBase64,
        xml: sale.authorizedXml || sale.signedXml || (isCreditNote ? buildCreditNoteXml(sale, client, saleIssuer) : buildInvoiceXml(sale, client, saleIssuer)),
        documentType: isCreditNote ? "nota_credito" : "factura",
        documentNumber
      }, backendToken);
      const message = `La ${documentLabel} ${documentNumber} fue enviada a ${client.email} con sus documentos autorizados.`;
      await recordSaleEmailAttempt(sale, client.email, "sent");
      setNotice(message);
      if (showAlerts) {
        if (Platform.OS === "web") {
          window.alert(message);
        } else {
          Alert.alert(`${documentTitle} enviada`, message);
        }
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo enviar el correo.";
      await recordSaleEmailAttempt(sale, client.email, "failed", message);
      if (showAlerts) Alert.alert("Correo no enviado", message);
      return false;
    } finally {
      setProcessingMessage("");
    }
  };

  const emailSale = async (sale: Sale, client: Client) => {
    await sendSaleEmail(sale, client, data.sales.find((item) => item.id === sale.sourceSaleId));
  };

  const recordSaleEmailAttempt = async (sale: Sale, to: string, status: "sent" | "failed", error = "") => {
    if (!data.sales.some((item) => item.id === sale.id)) return;
    const sentAt = new Date().toISOString();
    const updatedSale: Sale = {
      ...sale,
      emailHistory: [{ to, sentAt, status, error: error || undefined }, ...(sale.emailHistory || [])].slice(0, 20)
    };
    const nextData = appendAudit({
      ...data,
      sales: data.sales.map((item) => (item.id === sale.id ? updatedSale : item))
    }, user, status === "sent" ? "EMAIL_SENT" : "EMAIL_FAILED", "sale", sale.id, status === "sent" ? `Correo enviado a ${to}` : `Correo fallido a ${to}`, { to, error });
    await persist(nextData);
    await syncSalePatchToBackend(data.backendUrl, backendToken, {
      baseData: data,
      sales: [updatedSale],
      auditLogs: nextData.auditLogs.slice(0, 1)
    }, nextData, persist);
  };

  const whatsappSale = async (sale: Sale, client: Client) => {
    if (!client.phone) {
      Alert.alert("Cliente sin telefono", "Agregue el numero de telefono del cliente.");
      return;
    }

    const saleIssuer = issuerForSale(data.issuer, sale);
    const html = buildRideHtml(sale, client, saleIssuer);

    if (Platform.OS === "web") {
      openHtmlViewer(html, `RIDE ${sale.sequence}`);
      return;
    }

    const file = await Print.printToFileAsync({ html, base64: false });

    if (!(await Sharing.isAvailableAsync())) {
      const phone = client.phone.replace(/\D/g, "");
      const message = [
        `Hola ${client.name},`,
        `Su factura ${saleIssuer.establishment}-${saleIssuer.emissionPoint}-${sale.sequence} fue autorizada por el SRI.`,
        `Total: $${money(sale.total)}`,
        `Autorizacion: ${sale.authorizationNumber || sale.accessKey}`
      ].join("\n");
      await Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
      return;
    }

    await Sharing.shareAsync(file.uri, {
      mimeType: "application/pdf",
      dialogTitle: "Enviar RIDE por WhatsApp",
      UTI: "com.adobe.pdf"
    });
  };

  const openCreditNoteForm = (sourceSale: Sale) => {
    const sourceClient = data.clients.find((client) => client.id === sourceSale.clientId);
    if (!isInvoiceSale(sourceSale) || sourceSale.status !== "AUTORIZADA") {
      Alert.alert("Nota de credito no disponible", "Solo se puede emitir nota de credito sobre facturas autorizadas.");
      return;
    }
    if (!sourceClient || isFinalConsumerClient(sourceClient)) {
      Alert.alert("Nota de credito no disponible", "No se puede emitir nota de credito para facturas a consumidor final. La factura debe tener datos de cliente con cedula, RUC, pasaporte o identificacion exterior.");
      return;
    }
    if (!hasCreditNoteBalance(data.sales, sourceSale)) {
      Alert.alert("Factura compensada", "Esta factura ya no tiene cantidades disponibles para nota de credito.");
      return;
    }

    const nextQuantities: Record<string, string> = {};
    sourceSale.items.forEach((item, index) => {
      nextQuantities[getCreditLineKey(item, index)] = "0";
    });
    setCreditNoteSourceId(sourceSale.id);
    setCreditNoteReason("Devolucion parcial");
    setCreditNoteQuantities(nextQuantities);
  };

  const fillCreditNoteTotal = () => {
    if (!creditNoteSource) return;
    const nextQuantities: Record<string, string> = {};
    creditNoteSource.items.forEach((item, index) => {
      const available = getCreditLineAvailable(data.sales, creditNoteSource, item, index);
      nextQuantities[getCreditLineKey(item, index)] = available > 0 ? formatQuantity(available) : "0";
    });
    setCreditNoteQuantities(nextQuantities);
  };

  const closeCreditNoteForm = () => {
    if (issuingCreditNote) return;
    setCreditNoteSourceId("");
    setCreditNoteReason("Devolucion parcial");
    setCreditNoteQuantities({});
  };

  const openRetentionForm = (sale: Sale) => {
    if (!isInvoiceSale(sale) || sale.status !== "AUTORIZADA") {
      Alert.alert("Retencion no disponible", "Solo se registran retenciones sobre facturas autorizadas.");
      return;
    }

    setRetentionSaleId(sale.id);
    setRetentionTaxType("IVA");
    setRetentionBase(money(sale.tax));
    setRetentionPercentage("");
    setRetentionAmount("");
    setRetentionDocumentNumber("");
    setRetentionAuthorizationNumber("");
    setRetentionReceivedAt(toInputDate(new Date()));
    setRetentionNotes("");
  };

  const closeRetentionForm = () => {
    setRetentionSaleId("");
  };

  const saveReceivedRetention = async () => {
    if (!retentionSale || !retentionClient) {
      Alert.alert("Retencion no disponible", "No se encontro la factura o el cliente.");
      return;
    }

    const base = roundMoney(parseDecimal(retentionBase || "0"));
    const percentage = roundMoney(parseDecimal(retentionPercentage || "0"));
    const calculatedAmount = roundMoney(base * (percentage / 100));
    const amount = roundMoney(parseDecimal(retentionAmount || String(calculatedAmount)));
    const receivedDate = parseInputDate(retentionReceivedAt, "start");

    if (!retentionDocumentNumber.trim()) {
      Alert.alert("Comprobante requerido", "Ingrese el numero del comprobante de retencion recibido.");
      return;
    }
    if (!receivedDate) {
      Alert.alert("Fecha invalida", "Ingrese la fecha en formato YYYY-MM-DD.");
      return;
    }
    if (base <= 0 || percentage <= 0 || amount <= 0) {
      Alert.alert("Valores invalidos", "Base, porcentaje y valor retenido deben ser mayores a cero.");
      return;
    }

    const retention: ReceivedRetention = {
      id: uid(),
      saleId: retentionSale.id,
      clientId: retentionClient.id,
      userId: user.id,
      createdAt: new Date().toISOString(),
      receivedAt: receivedDate.toISOString(),
      documentNumber: retentionDocumentNumber.trim(),
      authorizationNumber: retentionAuthorizationNumber.trim(),
      taxType: retentionTaxType,
      base,
      percentage,
      amount,
      notes: retentionNotes.trim()
    };

    await persist(appendAudit({
      ...data,
      receivedRetentions: [retention, ...(data.receivedRetentions || [])]
    }, user, "RETENTION_RECEIVED_CREATED", "retention", retention.id, `Retencion recibida ${retention.taxType} $${money(retention.amount)} para factura ${retentionSale.sequence}`, { saleId: retentionSale.id, documentNumber: retention.documentNumber }));

    closeRetentionForm();
    showMessage("Retencion guardada", `Se registro una retencion de ${retention.taxType} por $${money(retention.amount)}.`);
  };

  const issueCreditNote = async () => {
    const sourceSale = creditNoteSource;
    const client = creditNoteClient;
    if (!sourceSale || !client) {
      Alert.alert("Nota de credito no disponible", "No se encontro la factura o el cliente de origen.");
      return;
    }
    if (!isInvoiceSale(sourceSale) || sourceSale.status !== "AUTORIZADA") {
      Alert.alert("Nota de credito no disponible", "Solo se puede emitir nota de credito sobre facturas autorizadas.");
      return;
    }
    if (isFinalConsumerClient(client)) {
      Alert.alert("Nota de credito no disponible", "No se puede emitir nota de credito para facturas a consumidor final. La factura debe tener datos de cliente con cedula, RUC, pasaporte o identificacion exterior.");
      return;
    }

    const reason = creditNoteReason.trim();
    if (!reason) {
      Alert.alert("Motivo requerido", "Ingrese el motivo de la nota de credito.");
      return;
    }

    const validationErrors = validateCreditNoteQuantities(sourceSale, data.sales, creditNoteQuantities);
    if (validationErrors.length > 0) {
      Alert.alert("Revise cantidades", validationErrors.join("\n"));
      return;
    }

    const creditItems = buildCreditNoteItemsFromQuantities(sourceSale, data.sales, creditNoteQuantities);
    if (creditItems.length === 0) {
      Alert.alert("Seleccione productos", "Ingrese una cantidad mayor a cero en al menos un producto o servicio.");
      return;
    }

    const creditTotals = calculateTotals(creditItems);

    const createdAt = new Date().toISOString();
    const documentIssuer = issuerForSale(data.issuer, sourceSale);
    const documentEstablishment = {
      ...activeEstablishment(data.issuer),
      id: `${documentIssuer.establishment}-${documentIssuer.emissionPoint}`,
      name: sourceSale.establishmentName || `${documentIssuer.establishment}-${documentIssuer.emissionPoint}`,
      establishment: documentIssuer.establishment,
      emissionPoint: documentIssuer.emissionPoint
    };
    const licenseErrors: string[] = [];
    validateEmissionPointLicense(data, documentIssuer, licenseErrors);
    if (licenseErrors.length > 0) {
      const message = licenseErrors.join("\n");
      showMessage("Plan requerido", message);
      return;
    }
    let sequence = nextSequence(documentIssuer.creditNoteSequential || 1);
    let accessKey = createCreditNoteAccessKey(new Date(createdAt), documentIssuer, sequence);
    try {
      setProcessingMessage("Preparando numero de nota de credito...");
      const reserved = await reserveDocumentSequence(data.backendUrl, { documentType: "nota_credito", issuer: documentIssuer, createdAt }, backendToken);
      if (Number(reserved.sequence) < Number(sequence)) {
        throw new Error(`El servidor devolvio el secuencial ${reserved.sequence}, menor al configurado ${sequence}. Guarde SRI y sincronice antes de emitir.`);
      }
      sequence = reserved.sequence || sequence;
      accessKey = reserved.accessKey || accessKey;
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo preparar el numero de nota de credito.";
      Alert.alert("Numero no preparado", message);
      setProcessingMessage("");
      return;
    }
    const supportDocumentNumber = `${documentIssuer.establishment}-${documentIssuer.emissionPoint}-${sourceSale.sequence}`;
    const creditNote: Sale = {
      id: uid(),
      documentType: "nota_credito",
      establishment: documentIssuer.establishment,
      emissionPoint: documentIssuer.emissionPoint,
      establishmentName: documentEstablishment.name,
      sourceSaleId: sourceSale.id,
      clientId: sourceSale.clientId,
      userId: user.id,
      createdAt,
      sequence,
      accessKey,
      subtotal: creditTotals.subtotal,
      tax: creditTotals.tax,
      total: creditTotals.total,
      paymentMethod: sourceSale.paymentMethod || "01",
      status: "BORRADOR",
      items: creditItems,
      supportDocumentType: "01",
      supportDocumentNumber,
      supportAuthorizationNumber: sourceSale.authorizationNumber || sourceSale.accessKey,
      supportIssueDate: formatSriDate(new Date(sourceSale.createdAt)),
      creditReason: reason
    };

    if (isAccessKeyUsed(data, creditNote.accessKey)) {
      Alert.alert("Clave duplicada", `La clave de acceso ${creditNote.accessKey} ya existe. Revise el secuencial de notas de credito.`);
      return;
    }

    const xml = buildCreditNoteXml(creditNote, client, documentIssuer);
    setRetryingSaleId(sourceSale.id);
    setIssuingCreditNote(true);
    setProcessingMessage("Emitiendo nota de credito...");
    const draftData: AppData = {
      ...data,
      issuer: updateIssuerEstablishmentSequence(data.issuer, documentEstablishment.id, "creditNoteSequential", Math.max((documentIssuer.creditNoteSequential || 1) + 1, Number(sequence) + 1)),
      sales: [creditNote, ...data.sales]
    };
    await persist(draftData);

    try {
      const sriResult = await authorizeInvoice(data.backendUrl, xml, backendToken);
      const finalCreditNote: Sale = {
        ...creditNote,
        accessKey: sriResult.accessKey || creditNote.accessKey,
        authorizationNumber: sriResult.authorizationNumber,
        authorizationDate: sriResult.authorizationDate,
        sriEnvironment: sriResult.sriEnvironment,
        sriMessage: sriResult.sriMessage,
        signedXml: sriResult.signedXml,
        authorizedXml: sriResult.authorizedXml,
        status: resolveInvoiceStatus(sriResult)
      };
      const stockMovements: InventoryMovement[] = [];
      const nextProducts = finalCreditNote.status === "AUTORIZADA"
        ? data.products.map((product) => {
            const returnedQuantity = finalCreditNote.items.filter((item) => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
            if (returnedQuantity <= 0) return product;
            const stockAfter = product.stock + returnedQuantity;
            stockMovements.push({
              id: uid(),
              productId: product.id,
              productName: product.name,
              type: "entrada",
              quantity: returnedQuantity,
              stockBefore: product.stock,
              stockAfter,
              reason: `Nota de credito ${finalCreditNote.sequence}`,
              reference: sourceSale.sequence,
              userId: user.id,
              createdAt
            });
            return { ...product, stock: stockAfter, updatedAt: createdAt };
          })
        : data.products;
      const finalSales = draftData.sales.map((sale) => (sale.id === finalCreditNote.id ? finalCreditNote : sale));
      const fullyCredited = finalCreditNote.status === "AUTORIZADA" && !hasCreditNoteBalance(finalSales, sourceSale);

      const patchedSales = finalSales.map((sale) => {
        if (sale.id === finalCreditNote.id) return finalCreditNote;
        if (sale.id === sourceSale.id && fullyCredited) {
          return { ...sale, voidReason: `Compensada con nota de credito ${finalCreditNote.sequence}: ${reason}`, voidedAt: createdAt };
        }
        return sale;
      });
      const finalData = appendAudit({
        ...draftData,
        products: nextProducts,
        inventoryMovements: [...stockMovements, ...(draftData.inventoryMovements || [])],
        sales: patchedSales
      }, user, "CREDIT_NOTE_CREATED", "sale", finalCreditNote.id, `Nota de credito ${finalCreditNote.sequence} para factura ${sourceSale.sequence}: ${finalCreditNote.status}`, { sourceSaleId: sourceSale.id, total: finalCreditNote.total, status: finalCreditNote.status });
      await persist(finalData);
      await syncSalePatchToBackend(data.backendUrl, backendToken, {
        baseData: data,
        issuer: finalData.issuer,
        sales: patchedSales.filter((sale) => [finalCreditNote.id, sourceSale.id].includes(sale.id)),
        products: finalData.products.filter((product) => stockMovements.some((movement) => movement.productId === product.id)),
        inventoryMovements: stockMovements,
        auditLogs: finalData.auditLogs.slice(0, 1)
      }, finalData, persist);
      let creditNoteEmailSent = false;
      if (finalCreditNote.status === "AUTORIZADA") {
        creditNoteEmailSent = await sendSaleEmail(finalCreditNote, client, sourceSale, false);
        setCreditNoteSourceId("");
        setCreditNoteReason("Devolucion parcial");
        setCreditNoteQuantities({});
      }
      Alert.alert(explainSriResult(sriResult).title, finalCreditNote.status === "AUTORIZADA" ? `Nota de credito autorizada, stock devuelto${creditNoteEmailSent ? " y enviada al correo del cliente" : ""}.` : sriUserMessage(sriResult));
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo emitir la nota de credito.";
      await persist(appendAudit({
        ...draftData,
        sales: draftData.sales.map((sale) => (sale.id === creditNote.id ? { ...creditNote, status: "RECHAZADA", sriMessage: message, signedXml: xml } : sale))
      }, user, "CREDIT_NOTE_FAILED", "sale", creditNote.id, `Nota de credito ${creditNote.sequence} rechazada`, { error: message }));
      Alert.alert("Nota de credito rechazada", message);
    } finally {
      setRetryingSaleId("");
      setIssuingCreditNote(false);
      setProcessingMessage("");
    }
  };

  const retrySale = async (sale: Sale, client: Client) => {
    if (!isInvoiceSale(sale) && !isCreditNoteSale(sale)) {
      Alert.alert("Documento interno", "Este documento no se envia al SRI.");
      return;
    }
    if (sale.status === "ANULADA") {
      Alert.alert("Documento anulado", "Este documento ya fue anulado localmente y no se puede reintentar.");
      return;
    }
    const retryInfo = getRetryInfo(sale);
    if (retryInfo.today >= MAX_DAILY_RETRIES) {
      const message = `Esta factura ya tiene ${retryInfo.today} reintento(s) hoy. Revise el detalle del documento antes de volver a intentar manana.`;
      setNotice(message);
      Alert.alert("Limite diario de reintentos", message);
      return;
    }
    setRetryingSaleId(sale.id);
    setProcessingMessage(`Reintentando ${documentTypeLabel(sale).toLowerCase()}...`);
    const saleIssuer = issuerForSale(data.issuer, sale);
    const unsignedXml = isCreditNoteSale(sale) ? buildCreditNoteXml(sale, client, saleIssuer) : buildInvoiceXml(sale, client, saleIssuer);
    const retryAt = new Date().toISOString();

    try {
      const sriResult = await authorizeInvoice(data.backendUrl, unsignedXml, backendToken);
      const updatedSale: Sale = {
        ...sale,
        accessKey: sriResult.accessKey || sale.accessKey,
        authorizationNumber: sriResult.authorizationNumber,
        authorizationDate: sriResult.authorizationDate,
        sriEnvironment: sriResult.sriEnvironment,
        sriMessage: sriResult.sriMessage,
        signedXml: sriResult.signedXml,
        authorizedXml: sriResult.authorizedXml,
        status: resolveInvoiceStatus(sriResult),
        retryHistory: [...(sale.retryHistory || []), retryAt]
      };
      const stockMovements: InventoryMovement[] = [];
      const shouldDiscountStock = isInvoiceSale(sale) && saleNeedsStockDiscount(sale.status) && updatedSale.status !== "RECHAZADA" && updatedSale.status !== "ANULADA";
      const shouldRestoreCreditStock = isCreditNoteSale(sale) && sale.status !== "AUTORIZADA" && updatedSale.status === "AUTORIZADA";
      const stockSourceSale = shouldRestoreCreditStock ? data.sales.find((item) => item.id === sale.sourceSaleId) : undefined;
      const nextProducts = shouldDiscountStock
        ? data.products.map((product) => {
            const soldQuantity = sale.items.filter((item) => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
            if (soldQuantity <= 0) return product;
            const stockAfter = product.stock - soldQuantity;
            stockMovements.push({
              id: uid(),
              productId: product.id,
              productName: product.name,
              type: "salida",
              quantity: soldQuantity,
              stockBefore: product.stock,
              stockAfter,
              reason: "Reenvio autorizado",
              reference: sale.sequence,
              userId: user.id,
              createdAt: retryAt
            });
            return { ...product, stock: stockAfter, updatedAt: retryAt };
          })
        : shouldRestoreCreditStock
          ? data.products.map((product) => {
              const returnedQuantity = sale.items.filter((item) => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
              if (returnedQuantity <= 0) return product;
              const stockAfter = product.stock + returnedQuantity;
              stockMovements.push({
                id: uid(),
                productId: product.id,
                productName: product.name,
                type: "entrada",
                quantity: returnedQuantity,
                stockBefore: product.stock,
                stockAfter,
                reason: `Reenvio nota de credito ${sale.sequence}`,
                reference: stockSourceSale?.sequence || sale.sequence,
                userId: user.id,
                createdAt: retryAt
              });
              return { ...product, stock: stockAfter, updatedAt: retryAt };
            })
        : data.products;

      await persist(appendAudit({
        ...data,
        products: nextProducts,
        inventoryMovements: [...stockMovements, ...(data.inventoryMovements || [])],
        sales: data.sales.map((item) => (item.id === sale.id ? updatedSale : item))
      }, user, isCreditNoteSale(sale) ? "CREDIT_NOTE_RETRIED" : "INVOICE_RETRIED", "sale", sale.id, `Reenvio de ${documentTypeLabel(sale)} ${sale.sequence}: ${updatedSale.status}`, { status: updatedSale.status, accessKey: updatedSale.accessKey }));
      Alert.alert(explainSriResult(sriResult).title, updatedSale.status === "AUTORIZADA" ? `${documentTypeLabel(sale)} autorizada.` : sriUserMessage(sriResult));
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo reintentar el documento.";
      await persist(appendAudit({
        ...data,
        sales: data.sales.map((item) => (item.id === sale.id ? { ...item, status: "RECHAZADA", sriMessage: message, retryHistory: [...(sale.retryHistory || []), retryAt] } : item))
      }, user, isCreditNoteSale(sale) ? "CREDIT_NOTE_RETRY_FAILED" : "INVOICE_RETRY_FAILED", "sale", sale.id, `Reenvio fallido de ${documentTypeLabel(sale)} ${sale.sequence}`, { error: message }));
      Alert.alert("No se pudo reintentar", message);
    } finally {
      setRetryingSaleId("");
      setProcessingMessage("");
    }
  };

  const editSale = (sale: Sale) => {
    if (!canEditSale(sale)) {
      Alert.alert("Factura no editable", "Solo se pueden editar facturas no autorizadas y no anuladas.");
      return;
    }

    setEditingSaleId(sale.id);
    setSourceTicketId("");
    setDocumentType(sale.documentType || "factura");
    setClientId(sale.clientId);
    setPaymentMethod(sale.paymentMethod || "01");
    setItems(sale.items.map((item) => ({ ...item })));
    setIssueNotice(`Corrigiendo factura ${sale.sequence}. Se reintentara con la misma autorizacion.`);
    setNotice("");
    showMessage("Documento cargado", `${documentTypeLabel(sale)} ${sale.sequence} listo para editar.`);
  };

  const invoiceFromTicket = (sale: Sale) => {
    if (sale.documentType !== "nota_venta" || sale.status !== "INTERNA") {
      Alert.alert("Ticket no disponible", "Solo se pueden facturar tickets internos activos.");
      return;
    }

    setEditingSaleId("");
    setSourceTicketId(sale.id);
    setDocumentType("factura");
    setClientId(sale.clientId);
    setPaymentMethod(sale.paymentMethod || "01");
    setItems(sale.items.map((item) => ({ ...item })));
    setIssueNotice(`Facturando ticket ${sale.sequence}. Se usara el siguiente numero disponible.`);
    setNotice("");
    showMessage("Ticket cargado", `Ticket ${sale.sequence} listo para facturar.`);
  };

  const convertProforma = (sale: Sale, target: DocumentType) => {
    if (sale.documentType !== "proforma" || sale.status !== "PROFORMA") {
      Alert.alert("Proforma no disponible", "Solo se pueden convertir proformas activas.");
      return;
    }

    setEditingSaleId("");
    setSourceTicketId("");
    setSourceProformaId(sale.id);
    setDocumentType(target);
    setClientId(sale.clientId);
    setPaymentMethod(sale.paymentMethod || "01");
    setItems(sale.items.map((item) => ({ ...item })));
    setIssueNotice(target === "factura" ? `Facturando proforma ${sale.sequence}. Se usara el siguiente numero disponible.` : `Convirtiendo proforma ${sale.sequence} a ticket interno.`);
    setNotice("");
    showMessage("Proforma cargada", target === "factura" ? `Proforma ${sale.sequence} lista para facturar.` : `Proforma ${sale.sequence} lista para convertir a ticket.`);
  };

  const cancelEdit = () => {
    setEditingSaleId("");
    setSourceTicketId("");
    setSourceProformaId("");
    setItems([]);
    setIssueNotice("");
    setPaymentMethod("01");
    setDocumentType("factura");
    showMessage("Accion cancelada", "Se limpio el formulario y no se guardaron cambios.");
  };

  const voidSale = async (sale: Sale) => {
    if (sale.status === "AUTORIZADA") {
      Alert.alert("No se puede anular aqui", "Una factura autorizada requiere otro proceso. Use nota de credito o el flujo que corresponda.");
      return;
    }
    if (sale.status === "ANULADA") {
      Alert.alert("Factura anulada", "Esta factura ya esta anulada localmente.");
      return;
    }

    const voidedAt = new Date().toISOString();
    const defaultReason = isInvoiceSale(sale) ? "Anulada localmente antes de autorizacion" : sale.documentType === "proforma" ? "Proforma anulada localmente" : isCreditNoteSale(sale) ? "Nota de credito anulada localmente" : "Nota de venta anulada localmente";
    const reason = getLocalVoidReason(defaultReason);
    if (!reason) return;
    const restoreStock = saleStatusReducesStock(sale.status);
    const stockMovements: InventoryMovement[] = [];
    const nextProducts = restoreStock
      ? data.products.map((product) => {
          const soldQuantity = sale.items.filter((item) => item.productId === product.id).reduce((sum, item) => sum + item.quantity, 0);
          if (soldQuantity <= 0) return product;
          const stockAfter = product.stock + soldQuantity;
          stockMovements.push({
            id: uid(),
            productId: product.id,
            productName: product.name,
            type: "entrada",
            quantity: soldQuantity,
            stockBefore: product.stock,
            stockAfter,
            reason,
            reference: sale.sequence,
            userId: user.id,
            createdAt: voidedAt
          });
          return { ...product, stock: stockAfter, updatedAt: voidedAt };
        })
      : data.products;

    await persist(appendAudit({
      ...data,
      products: nextProducts,
      inventoryMovements: [...stockMovements, ...(data.inventoryMovements || [])],
      sales: data.sales.map((item) =>
        item.id === sale.id
          ? {
              ...item,
              status: "ANULADA",
              voidReason: reason,
              voidedAt,
              sriMessage: item.sriMessage || reason
            }
          : item
      )
    }, user, "DOCUMENT_VOIDED", "sale", sale.id, `Documento anulado: ${documentTypeLabel(sale)} ${sale.sequence}`, { reason, restoredStock: restoreStock }));
    const message = restoreStock ? "Documento anulado localmente y stock devuelto." : "Documento anulado localmente.";
    setNotice(message);
    Alert.alert("Documento anulado", message);
  };

  return (
    <View style={styles.stack}>
      <Section title={sourceTicket ? `Facturando ticket ${sourceTicket.sequence}` : sourceProforma ? `Convirtiendo proforma ${sourceProforma.sequence}` : editingSale ? `Corrigiendo ${documentTypeLabel(editingSale)} ${editingSale.sequence}` : "Nueva venta"}>
        {editingSale || sourceTicket || sourceProforma ? (
          <View style={styles.editNoticeBox}>
            <Text style={styles.noticeTitle}>{sourceTicket ? "Modo facturar ticket" : sourceProforma ? "Modo convertir proforma" : "Modo correccion"}</Text>
            <Text style={styles.noticeText}>
              {sourceTicket
                ? "Se creara una factura SRI nueva con el siguiente secuencial de factura. Si autoriza, el ticket quedara convertido y no se duplicara el stock."
                : sourceProforma
                  ? "Se creara un nuevo documento desde la proforma. La proforma no toca inventario ni SRI hasta convertirse."
                : "Puede corregir cliente, productos, precio, descuento o forma de pago. Se conservara la misma secuencia del documento."}
            </Text>
            <Pressable style={styles.smallButton} onPress={cancelEdit}>
              <Text style={styles.smallButtonText}>{sourceTicket ? "Cancelar facturacion" : sourceProforma ? "Cancelar conversion" : "Cancelar correccion"}</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.saleGroupCompact}>
          <Select
            label="Seleccionar tipo de documento"
            value={sourceTicket ? "factura" : sourceProforma ? documentType : editingSale ? editingSale.documentType || "factura" : documentType}
            onChange={(value) => !editingSale && !sourceTicket && !sourceProforma && setDocumentType(value as DocumentType)}
            options={documentTypeOptions}
          />
          <Text style={styles.inlineInfo}>
            {documentType === "proforma" || editingSale?.documentType === "proforma"
              ? "Cotizacion: no descuenta inventario y no se envia al SRI."
              : documentType === "nota_venta" || editingSale?.documentType === "nota_venta"
              ? "Movimiento interno: descuenta inventario y no se envia al SRI."
              : "Documento tributario: se firma y autoriza en el SRI."}
          </Text>
        </View>
        <View style={styles.saleGroup}>
          <Input label="Buscar cliente" value={clientSearch} onChangeText={setClientSearch} placeholder="Nombre, cedula o RUC" autoCapitalize="none" />
          <Select label={`Seleccionar cliente (${visibleClientsForSale.length}/${filteredClientsForSale.length})`} value={clientId} onChange={setClientId} options={visibleClientsForSale.map((item) => ({ label: item.name, value: item.id }))} />
          {filteredClientsForSale.length === 0 ? <Empty text="No hay clientes con esa busqueda." /> : null}
          {visibleClientsForSale.length < filteredClientsForSale.length ? <LoadMoreButton label="Cargar mas clientes" onPress={() => setVisibleClientCount((count) => count + LIST_BATCH_SIZE)} /> : null}
          {selectedClient ? (
            <View style={styles.inlineCard}>
              <View style={styles.flex}>
                <Text style={styles.inlineInfo}>{selectedClient.identification} | {selectedClient.email || "sin email"}</Text>
                <Text style={styles.inlineInfo}>{selectedClient.address || "sin direccion"}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Editar cliente" style={styles.quickEditButton} onPress={openQuickClientEditor}>
                <PencilIcon />
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={styles.saleGroup}>
          <View style={styles.scanBox}>
            <Input
              label="Buscar o escanear producto"
              value={productSearch}
              onChangeText={setProductSearch}
              placeholder="Codigo, barras o descripción"
              autoCapitalize="characters"
              onSubmitEditing={addProductSearchSubmit}
              rightElement={(
                <Pressable accessibilityRole="button" accessibilityLabel="Escanear producto con camara" style={styles.inputCameraButton} onPress={() => setSaleScannerVisible(true)}>
                  <CameraIcon />
                </Pressable>
              )}
            />
          </View>
          <Select label={`Seleccionar producto (${visibleProductsForSale.length}/${filteredProductsForSale.length})`} value={productId} onChange={setProductId} options={visibleProductsForSale.map((item) => ({ label: `${item.code} - ${item.name}`, value: item.id }))} />
          {filteredProductsForSale.length === 0 ? <Empty text="No hay productos con esa busqueda." /> : null}
          {visibleProductsForSale.length < filteredProductsForSale.length ? <LoadMoreButton label="Cargar mas productos" onPress={() => setVisibleProductCount((count) => count + LIST_BATCH_SIZE)} /> : null}
          {selectedProduct ? (
            <View style={styles.productSummaryCard}>
              <View style={styles.flex}>
                <Text style={styles.itemTitle}>{selectedProduct.name}</Text>
                <Text style={styles.inlineInfo}>Stock {selectedProduct.stock} | Min. {productMinStock(selectedProduct)} | Publico ${money(selectedProduct.price)} | IVA {money(selectedProduct.ivaRate * 100)}%</Text>
              </View>
            </View>
          ) : null}
          <View style={styles.saleControlsRow}>
            <View style={styles.quantityBlock}>
              <Text style={styles.label}>Cantidad</Text>
              <View style={styles.quantityStepper}>
                <Pressable style={styles.stepperButton} onPress={() => adjustQuantity(-1)}>
                  <Text style={styles.stepperButtonText}>-</Text>
                </Pressable>
                <TextInput style={styles.stepperInput} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholderTextColor="#7d8796" />
                <Pressable style={styles.stepperButton} onPress={() => adjustQuantity(1)}>
                  <Text style={styles.stepperButtonText}>+</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.flex}>
              <Text style={[styles.label, styles.optionsLabel]}>Opciones</Text>
              <Pressable style={styles.secondaryActionButton} onPress={openPriceOptions}>
                <Text style={styles.secondaryActionText}>Precio / descuento</Text>
              </Pressable>
            </View>
          </View>
          {selectedProductLowStock ? (
            <View style={styles.stockWarningBox}>
              <Text style={styles.stockWarningText}>Stock bajo: quedaria {formatQuantity(selectedProductProjectedStock)}. Minimo configurado {selectedProduct ? productMinStock(selectedProduct) : 0}.</Text>
            </View>
          ) : null}
          {selectedProduct ? (
            <View style={styles.taxPreview}>
              <Text style={styles.taxPreviewText}>
                Cant. {formatQuantity(currentQty)} | Total estimado ${money(currentGrossLineTotal - currentGrossDiscount)}
              </Text>
              <Text style={styles.taxPreviewText}>Precio ${money(currentGrossPrice || selectedProduct.price)} | Desc. ${money(currentGrossDiscount)}</Text>
            </View>
          ) : null}
          <Pressable style={styles.addButton} onPress={addItem}>
            <Text style={styles.addButtonText}>Agregar a la venta</Text>
          </Pressable>
        </View>

        {items.map((item, index) => (
          <ListItem
            key={`${item.productId}-${index}`}
            title={`${item.quantity} x ${item.name}`}
            meta={`Base $${money(calculateLineSubtotal(item))} | Desc. $${money(calculateLineDiscount(item))} | IVA $${money(calculateLineTax(item))} | Total $${money(calculateLineTotal(item))}`}
            editLabel="Editar"
            onEdit={() => openLineEditor(index)}
            onDelete={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}
          />
        ))}
        <View style={styles.saleGroupCompact}>
          <Select label="Forma de pago" value={paymentMethod} onChange={(value) => setPaymentMethod(value as PaymentMethod)} options={paymentOptions} />
        </View>
        <View style={styles.totalBox}>
          <Text style={styles.totalLine}>Subtotal: ${money(totals.subtotal)}</Text>
          <Text style={styles.totalLine}>Descuento: ${money(calculateTotalDiscount(items))}</Text>
          <Text style={styles.totalLine}>IVA: ${money(totals.tax)}</Text>
          <Text style={styles.totalStrong}>Total: ${money(totals.total)}</Text>
        </View>
        {issueNotice ? (
          <Pressable style={styles.issueNoticeBox} onPress={() => setIssueNotice("")}>
            <Text style={styles.issueNoticeText}>{issueNotice}</Text>
          </Pressable>
        ) : null}
        <PrimaryButton
          label={issuing ? "Procesando..." : sourceTicket ? "Facturar ticket" : sourceProforma ? (documentType === "factura" ? "Facturar proforma" : "Crear ticket desde proforma") : editingSale ? (editingSale.documentType === "nota_venta" || editingSale.documentType === "proforma" ? "Guardar correccion" : "Guardar y reintentar") : documentType === "proforma" ? "Guardar proforma" : documentType === "nota_venta" ? "Guardar nota de venta" : "Emitir factura"}
          onPress={issuing ? () => undefined : issue}
        />
      </Section>

      <Section title="Facturas">
        {notice ? (
          <Pressable style={styles.noticeBox} onPress={() => setNotice("")}>
            <Text style={styles.noticeTitle}>Factura enviada</Text>
            <Text style={styles.noticeText}>{notice}</Text>
          </Pressable>
        ) : null}
        <View style={styles.statsGrid}>
          <StatBox label="Emitidas" value={String(invoiceStats.count)} />
          <StatBox label="Autorizadas" value={String(invoiceStats.authorized)} />
          <StatBox label="Notas credito" value={String(invoiceStats.creditNotes)} />
          <StatBox label="Notas venta" value={String(invoiceStats.internal)} />
          <StatBox label="Proformas" value={String(invoiceStats.proformas)} />
          <StatBox label="Rechazadas" value={String(invoiceStats.rejected)} />
          <StatBox label="Total aut." value={`$${money(invoiceStats.totalAuthorized)}`} />
          <StatBox label="Retenciones" value={`$${money(invoiceStats.retentionTotal)}`} />
        </View>
        <Input label="Buscar documento" value={invoiceSearch} onChangeText={setInvoiceSearch} placeholder="Cliente, cedula, secuencial o clave" autoCapitalize="none" />
        <View style={styles.saleGroupCompact}>
          <Text style={styles.groupTitle}>Fecha del documento</Text>
          <View style={styles.row}>
            <View style={styles.flex}>
              <CalendarDateInput label="Desde" value={saleStartDate} onChange={setSaleStartDate} allowClear />
            </View>
            <View style={styles.flex}>
              <CalendarDateInput label="Hasta" value={saleEndDate} onChange={setSaleEndDate} allowClear />
            </View>
          </View>
          <View style={styles.actionGroup}>
            <Pressable style={styles.smallButton} onPress={setSalesDateRangeToday}>
              <Text style={styles.smallButtonText}>Hoy</Text>
            </Pressable>
            <Pressable style={styles.smallButton} onPress={setSalesDateRangeMonth}>
              <Text style={styles.smallButtonText}>Este mes</Text>
            </Pressable>
            <Pressable style={styles.smallButton} onPress={clearSalesDateRange}>
              <Text style={styles.smallButtonText}>Limpiar</Text>
            </Pressable>
          </View>
        </View>
        <Select
          label="Estado"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { label: "Todas", value: "TODAS" },
            { label: "Autorizadas", value: "AUTORIZADA" },
            { label: "Rechazadas", value: "RECHAZADA" },
            { label: "Recibidas", value: "RECIBIDA" },
            { label: "Firmadas", value: "FIRMADA" },
            { label: "Anuladas", value: "ANULADA" },
            { label: "Notas venta", value: "INTERNA" },
            { label: "Proformas", value: "PROFORMA" },
            { label: "Notas credito", value: "NOTA_CREDITO" }
          ]}
        />
        {data.sales.length === 0 ? <Empty text="Aun no hay ventas." /> : null}
        {data.sales.length > 0 && filteredSales.length === 0 ? <Empty text="No hay documentos con ese filtro." /> : null}
        {visibleSales.map((sale) => {
          const client = data.clients.find((item) => item.id === sale.clientId);
          return (
            <ListItem
              key={sale.id}
              title={`${sale.sequence} - ${client?.name ?? "Cliente"}`}
              meta={`${formatShortDate(sale.createdAt)} | ${documentTypeLabel(sale)} | ${sale.status} | $${money(sale.total)} | ${sale.authorizationNumber || sale.accessKey || "Interno"}${sale.sriMessage ? ` | ${shortText(sale.sriMessage, 90)}` : ""}`}
              badge={sale.status}
              onOpen={canAccessSensitiveSupport(user.role) ? () => client && onXml(formatSaleDetail(sale, client, data.issuer)) : undefined}
              secondaryLabel={(isInvoiceSale(sale) || isCreditNoteSale(sale)) && sale.status === "AUTORIZADA" ? "RIDE" : sale.documentType === "nota_venta" && sale.status === "INTERNA" ? "Ticket" : sale.documentType === "proforma" && sale.status === "PROFORMA" ? "Proforma" : undefined}
              onSecondary={() => {
                if (!client) return;
                if (isCreditNoteSale(sale)) return createCreditNoteRide(sale, client, data.sales.find((item) => item.id === sale.sourceSaleId));
                return isInvoiceSale(sale) ? createRide(sale, client) : sale.documentType === "proforma" ? createProforma(sale, client) : createTicket(sale, client);
              }}
              invoiceLabel={canIssueFromInternalDocuments(user.role) && sale.documentType === "nota_venta" && sale.status === "INTERNA" ? "Facturar" : undefined}
              onInvoice={() => invoiceFromTicket(sale)}
              ticketLabel={canIssueFromInternalDocuments(user.role) && sale.documentType === "proforma" && sale.status === "PROFORMA" ? "A ticket" : undefined}
              onTicket={() => convertProforma(sale, "nota_venta")}
              proformaInvoiceLabel={canIssueFromInternalDocuments(user.role) && sale.documentType === "proforma" && sale.status === "PROFORMA" ? "A factura" : undefined}
              onProformaInvoice={() => convertProforma(sale, "factura")}
              emailLabel={(isInvoiceSale(sale) || isCreditNoteSale(sale)) && sale.status === "AUTORIZADA" ? "Email" : undefined}
              onEmail={() => client && emailSale(sale, client)}
              whatsappLabel={isInvoiceSale(sale) && sale.status === "AUTORIZADA" ? "WhatsApp" : undefined}
              onWhatsapp={() => client && whatsappSale(sale, client)}
              supportLabel={canAccessSensitiveSupport(user.role) && isInvoiceSale(sale) && sale.status !== "AUTORIZADA" ? "Soporte" : undefined}
              onSupport={() => client && onXml(formatSaleDetail(sale, client, data.issuer))}
              creditNoteLabel={canManageFiscalAdjustments(user.role) && client && canIssueCreditNoteForSale(data.sales, sale, client) ? "Nota credito" : undefined}
              onCreditNote={() => client && openCreditNoteForm(sale)}
              retentionLabel={canManageFiscalAdjustments(user.role) && isInvoiceSale(sale) && sale.status === "AUTORIZADA" ? "Retencion" : undefined}
              onRetention={() => openRetentionForm(sale)}
              editLabel={canIssueFromInternalDocuments(user.role) && canEditSale(sale) ? "Editar" : undefined}
              onEdit={() => editSale(sale)}
              retryLabel={canRetryDocuments(user.role) && (isInvoiceSale(sale) || isCreditNoteSale(sale)) && sale.status !== "AUTORIZADA" && sale.status !== "ANULADA" ? (retryingSaleId === sale.id ? "..." : `Reintentar ${getRetryInfo(sale).today}/${MAX_DAILY_RETRIES}`) : undefined}
              onRetry={() => client && retrySale(sale, client)}
              cancelLabel={canVoidDocuments(user.role) && sale.status !== "AUTORIZADA" && sale.status !== "ANULADA" ? "Anular" : undefined}
              onCancel={() => voidSale(sale)}
            />
          );
        })}
        {visibleSales.length < filteredSales.length ? <LoadMoreButton label="Cargar mas documentos" onPress={() => setVisibleSaleCount((count) => count + LIST_BATCH_SIZE)} /> : null}
      </Section>

      <Section title="Retenciones recibidas">
        {(data.receivedRetentions || []).length === 0 ? <Empty text="Aun no hay retenciones recibidas." /> : null}
        {(data.receivedRetentions || []).slice(0, LIST_BATCH_SIZE).map((retention) => {
          const sale = data.sales.find((item) => item.id === retention.saleId);
          const client = data.clients.find((item) => item.id === retention.clientId);
          return (
            <ListItem
              key={retention.id}
              title={`${retention.taxType} ${retention.documentNumber}`}
              meta={`${formatShortDate(retention.receivedAt)} | ${client?.name || "Cliente"} | Factura ${sale ? documentNumber(sale, data.issuer) : ""} | Base $${money(retention.base)} | ${money(retention.percentage)}% | Retenido $${money(retention.amount)}`}
              badge="RETENCION"
              onOpen={canAccessSensitiveSupport(user.role) ? () => onXml(formatReceivedRetentionDetail(retention, sale, client, data.issuer)) : undefined}
            />
          );
        })}
      </Section>

      <Modal visible={Boolean(creditNoteSource)} transparent animationType="slide" onRequestClose={closeCreditNoteForm}>
        <View style={styles.creditModalBackdrop}>
          <View style={styles.creditModal}>
            <View style={styles.creditModalHeader}>
              <View style={styles.flex}>
                <Text style={styles.creditModalTitle}>Nota de credito</Text>
                <Text style={styles.creditModalMeta}>
                  {creditNoteSource ? `Factura ${documentNumber(creditNoteSource, data.issuer)}` : ""}
                </Text>
              </View>
              <Pressable style={styles.smallButton} onPress={closeCreditNoteForm}>
                <Text style={styles.smallButtonText}>Cerrar</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.creditModalContent}>
              <Input label="Motivo" value={creditNoteReason} onChangeText={setCreditNoteReason} placeholder="Ej: devolucion parcial" />
              <Pressable style={styles.creditSelectAllButton} onPress={fillCreditNoteTotal}>
                <Text style={styles.creditSelectAllText}>Seleccionar todo disponible</Text>
              </Pressable>
              {creditNoteSource?.items.map((item, index) => {
                const lineKey = getCreditLineKey(item, index);
                const available = getCreditLineAvailable(data.sales, creditNoteSource, item, index);
                const selectedQuantity = Math.max(0, parseDecimal(creditNoteQuantities[lineKey] || "0") || 0);
                const selectedItem = selectedQuantity > 0 ? buildCreditNoteItem(item, selectedQuantity, lineKey) : undefined;
                return (
                  <View key={lineKey} style={styles.creditLineCard}>
                    <Text style={styles.creditLineTitle}>{item.code} - {item.name}</Text>
                    <Text style={styles.creditLineMeta}>Facturado: {formatQuantity(item.quantity)} | Disponible: {formatQuantity(available)} | Total linea: ${money(calculateLineTotal(item))}</Text>
                    <View style={styles.row}>
                      <View style={styles.flex}>
                        <Input
                          label="Cantidad a devolver"
                          value={creditNoteQuantities[lineKey] || "0"}
                          onChangeText={(value) => setCreditNoteQuantities((current) => ({ ...current, [lineKey]: value }))}
                          keyboardType="decimal-pad"
                        />
                      </View>
                      <View style={styles.creditLineTotalBox}>
                        <Text style={styles.creditLineMeta}>Valor</Text>
                        <Text style={styles.creditLineTotal}>{selectedItem ? `$${money(calculateLineTotal(selectedItem))}` : "$0.00"}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
              <View style={styles.creditTotalsBox}>
                <Text style={styles.totalLine}>Subtotal: ${money(creditNotePreviewTotals.subtotal)}</Text>
                <Text style={styles.totalLine}>IVA: ${money(creditNotePreviewTotals.tax)}</Text>
                <Text style={styles.totalStrong}>Total nota credito: ${money(creditNotePreviewTotals.total)}</Text>
              </View>
              <PrimaryButton label={issuingCreditNote ? "Procesando..." : "Emitir nota de credito"} onPress={issuingCreditNote ? () => undefined : issueCreditNote} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(retentionSale)} transparent animationType="slide" onRequestClose={closeRetentionForm}>
        <View style={styles.creditModalBackdrop}>
          <View style={styles.creditModal}>
            <View style={styles.creditModalHeader}>
              <View style={styles.flex}>
                <Text style={styles.creditModalTitle}>Retencion recibida</Text>
                <Text style={styles.creditModalMeta}>
                  {retentionSale ? `Factura ${documentNumber(retentionSale, data.issuer)} | ${retentionClient?.name || "Cliente"}` : ""}
                </Text>
              </View>
              <Pressable style={styles.smallButton} onPress={closeRetentionForm}>
                <Text style={styles.smallButtonText}>Cerrar</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.creditModalContent}>
              <Select label="Impuesto retenido" value={retentionTaxType} onChange={(value) => {
                const nextType = value as RetentionTaxType;
                setRetentionTaxType(nextType);
                if (retentionSale) setRetentionBase(money(nextType === "IVA" ? retentionSale.tax : retentionSale.subtotal));
              }} options={retentionTaxOptions} />
              <Input label="No. comprobante recibido" value={retentionDocumentNumber} onChangeText={setRetentionDocumentNumber} placeholder="Ej: 001-001-000000123" />
              <Input label="Autorizacion" value={retentionAuthorizationNumber} onChangeText={setRetentionAuthorizationNumber} placeholder="Opcional" keyboardType="number-pad" />
              <CalendarDateInput label="Fecha recepcion" value={retentionReceivedAt} onChange={setRetentionReceivedAt} />
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Input label="Base" value={retentionBase} onChangeText={setRetentionBase} keyboardType="decimal-pad" />
                </View>
                <View style={styles.flex}>
                  <Input label="Porcentaje" value={retentionPercentage} onChangeText={setRetentionPercentage} keyboardType="decimal-pad" />
                </View>
              </View>
              <Input label="Valor retenido" value={retentionAmount} onChangeText={setRetentionAmount} placeholder="Se calcula si lo deja vacio" keyboardType="decimal-pad" />
              <Input label="Notas" value={retentionNotes} onChangeText={setRetentionNotes} placeholder="Opcional" />
              <View style={styles.creditTotalsBox}>
                <Text style={styles.totalLine}>Base: ${money(parseDecimal(retentionBase || "0") || 0)}</Text>
                <Text style={styles.totalLine}>Porcentaje: {money(parseDecimal(retentionPercentage || "0") || 0)}%</Text>
                <Text style={styles.totalStrong}>Valor estimado: ${money((parseDecimal(retentionBase || "0") || 0) * ((parseDecimal(retentionPercentage || "0") || 0) / 100))}</Text>
              </View>
              <PrimaryButton label="Guardar retencion" onPress={saveReceivedRetention} />
            </ScrollView>
          </View>
        </View>
      </Modal>
      <QuickClientEditor
        visible={quickClientVisible}
        form={quickClientForm}
        onChange={setQuickClientForm}
        onSave={saveQuickClient}
        onClose={() => setQuickClientVisible(false)}
      />
      <SaleLineEditor
        visible={editingLineIndex !== null}
        item={editingLineIndex !== null ? items[editingLineIndex] : undefined}
        form={lineEditForm}
        onChange={setLineEditForm}
        onSave={saveLineEdit}
        onClose={closeLineEditor}
      />
      <ProductPriceOptionsModal
        visible={priceOptionsVisible}
        product={selectedProduct}
        quantity={quantity}
        unitGrossPrice={unitGrossPrice}
        grossDiscount={grossDiscount}
        discountMode={discountMode}
        onQuantityChange={setQuantity}
        onUnitGrossPriceChange={setUnitGrossPrice}
        onGrossDiscountChange={setGrossDiscount}
        onDiscountModeChange={setDiscountMode}
        onAdd={() => {
          setPriceOptionsVisible(false);
          addItem();
        }}
        onClose={() => setPriceOptionsVisible(false)}
      />
      <BarcodeScannerModal
        visible={saleScannerVisible}
        title="Escanear producto"
        onClose={() => setSaleScannerVisible(false)}
        onScan={(code) => {
          setSaleScannerVisible(false);
          setProductSearch(code);
          addScannedCodeToSale(code);
        }}
      />
      <ProcessingOverlay visible={Boolean(processingMessage)} message={processingMessage} />
    </View>
  );
}

function resolveInvoiceStatus(result: AuthorizationResponse): Sale["status"] {
  const raw = `${result.authorizationStatus || ""} ${result.sriMessage || ""} ${JSON.stringify(result)}`.toUpperCase();

  if (result.ok === false) return "RECHAZADA";
  if (result.authorizationStatus === "AUTORIZADO" || raw.includes("<ESTADO>AUTORIZADO</ESTADO>")) return "AUTORIZADA";
  if (raw.includes("DEVUELTA") || raw.includes("RECHAZADA") || raw.includes("ERROR")) return "RECHAZADA";
  if (result.sent) return "RECIBIDA";
  return "FIRMADA";
}

function saleStatusReducesStock(status: Sale["status"]) {
  return status === "AUTORIZADA" || status === "RECIBIDA" || status === "FIRMADA" || status === "INTERNA";
}

function saleNeedsStockDiscount(status: Sale["status"]) {
  return !saleStatusReducesStock(status);
}

function canEditSale(sale: Sale) {
  return !isCreditNoteSale(sale) && sale.status !== "AUTORIZADA" && sale.status !== "ANULADA";
}

function isAccessKeyUsed(data: AppData, accessKey: string, currentId = "") {
  if (!accessKey) return false;
  return data.sales.some((sale) => sale.id !== currentId && sale.accessKey === accessKey) || (data.guides || []).some((guide) => guide.id !== currentId && guide.accessKey === accessKey);
}

function getCreditLineKey(item: SaleItem, index: number) {
  return item.sourceLineKey || `${item.productId || item.code}-${index}`;
}

function formatQuantity(value: number) {
  return Number(value.toFixed(6)).toString();
}

function sameCreditLine(sourceItem: SaleItem, creditItem: SaleItem) {
  return sourceItem.productId === creditItem.productId &&
    sourceItem.code === creditItem.code &&
    sourceItem.name === creditItem.name &&
    Math.abs(sourceItem.unitPrice - creditItem.unitPrice) < 0.000001 &&
    Math.abs(sourceItem.ivaRate - creditItem.ivaRate) < 0.000001;
}

function calculateGrossUnitPrice(item: SaleItem) {
  return roundMoney(item.unitPrice * (1 + item.ivaRate));
}

function calculateLineGrossDiscount(item: SaleItem) {
  return roundMoney(item.discount * (1 + item.ivaRate));
}

function getCreditedQuantityForLine(sales: Sale[], sourceSaleId: string, sourceItem: SaleItem, sourceIndex: number) {
  const lineKey = getCreditLineKey(sourceItem, sourceIndex);
  return sales
    .filter((sale) => sale.documentType === "nota_credito" && sale.sourceSaleId === sourceSaleId && sale.status === "AUTORIZADA")
    .flatMap((sale) => sale.items)
    .filter((item) => item.sourceLineKey ? item.sourceLineKey === lineKey : sameCreditLine(sourceItem, item))
    .reduce((sum, item) => sum + item.quantity, 0);
}

function getCreditLineAvailable(sales: Sale[], sourceSale: Sale, sourceItem: SaleItem, sourceIndex: number) {
  return Math.max(0, sourceItem.quantity - getCreditedQuantityForLine(sales, sourceSale.id, sourceItem, sourceIndex));
}

function hasCreditNoteBalance(sales: Sale[], sourceSale: Sale) {
  return sourceSale.items.some((item, index) => getCreditLineAvailable(sales, sourceSale, item, index) > 0.000001);
}

function buildCreditNoteItem(sourceItem: SaleItem, quantity: number, sourceLineKey: string): SaleItem {
  const ratio = sourceItem.quantity > 0 ? quantity / sourceItem.quantity : 0;
  return {
    ...sourceItem,
    quantity: Number(quantity.toFixed(6)),
    discount: Number((sourceItem.discount * ratio).toFixed(2)),
    sourceLineKey
  };
}

function buildCreditNoteItemsFromQuantities(sourceSale: Sale, sales: Sale[], quantities: Record<string, string>) {
  return sourceSale.items.flatMap((item, index) => {
    const lineKey = getCreditLineKey(item, index);
    const quantity = Math.max(0, parseDecimal(quantities[lineKey] || "0") || 0);
    const available = getCreditLineAvailable(sales, sourceSale, item, index);
    if (quantity <= 0 || quantity > available + 0.000001) return [];
    return [buildCreditNoteItem(item, quantity, lineKey)];
  });
}

function validateCreditNoteQuantities(sourceSale: Sale, sales: Sale[], quantities: Record<string, string>) {
  const errors: string[] = [];
  sourceSale.items.forEach((item, index) => {
    const lineKey = getCreditLineKey(item, index);
    const raw = quantities[lineKey] || "0";
    const quantity = parseDecimal(raw);
    const available = getCreditLineAvailable(sales, sourceSale, item, index);
    if (raw.trim() && (!Number.isFinite(quantity) || quantity < 0)) {
      errors.push(`${item.name}: cantidad invalida.`);
    }
    if (Number.isFinite(quantity) && quantity > available + 0.000001) {
      errors.push(`${item.name}: maximo disponible ${formatQuantity(available)}.`);
    }
  });
  return errors;
}

function getLocalVoidReason(defaultReason: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const reason = window.prompt("Motivo de anulacion local", defaultReason);
    return reason === null ? "" : (reason.trim() || defaultReason);
  }

  return defaultReason;
}

function formatSriDate(date: Date) {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function isInvoiceSale(sale: Sale) {
  return (sale.documentType || "factura") === "factura";
}

function isCreditNoteSale(sale: Sale) {
  return sale.documentType === "nota_credito";
}

function isFinalConsumerClient(client: Client) {
  const identification = client.identification.trim();
  return client.identificationType === "07" || identification === "9999999999999";
}

function canIssueCreditNoteForSale(sales: Sale[], sale: Sale, client: Client) {
  return isInvoiceSale(sale) &&
    sale.status === "AUTORIZADA" &&
    !isFinalConsumerClient(client) &&
    hasCreditNoteBalance(sales, sale);
}

function documentTypeLabel(sale: Sale) {
  if (isCreditNoteSale(sale)) return "Nota credito";
  if (isInvoiceSale(sale)) return "Factura SRI";
  if (sale.documentType === "proforma") return "Proforma";
  return "Nota de venta";
}

function documentNumber(sale: Sale, issuer: Issuer) {
  const scopedIssuer = issuerForSale(issuer, sale);
  if (sale.establishment && sale.emissionPoint) return `${scopedIssuer.establishment}-${scopedIssuer.emissionPoint}-${sale.sequence}`;
  return isInvoiceSale(sale) || isCreditNoteSale(sale) ? `${scopedIssuer.establishment}-${scopedIssuer.emissionPoint}-${sale.sequence}` : sale.sequence;
}

function compareSalesNewestFirst(a: Sale, b: Sale) {
  const dateDiff = timestampOf(b.createdAt) - timestampOf(a.createdAt);
  if (dateDiff !== 0) return dateDiff;
  const sequenceDiff = sequenceSortValue(b.sequence) - sequenceSortValue(a.sequence);
  if (sequenceDiff !== 0) return sequenceDiff;
  return b.id.localeCompare(a.id);
}

function sequenceSortValue(sequence: string) {
  const match = sequence.match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : 0;
}

function guideNumber(guide: RemissionGuide, issuer: Issuer) {
  const scopedIssuer = issuerForGuide(issuer, guide);
  return guide.establishment && guide.emissionPoint ? `${scopedIssuer.establishment}-${scopedIssuer.emissionPoint}-${guide.sequence}` : guide.sequence;
}

function activeScopeId(data: AppData) {
  const establishment = activeEstablishment(data.issuer);
  return establishment.id;
}

function documentScopeId(document: { establishment?: string; emissionPoint?: string; accessKey?: string }, fallbackIssuer: Issuer) {
  if (document.establishment && document.emissionPoint) return `${document.establishment}-${document.emissionPoint}`;
  const accessKeyScope = scopeIdFromAccessKey(document.accessKey || "");
  if (accessKeyScope) return accessKeyScope;
  return `${fallbackIssuer.establishment}-${fallbackIssuer.emissionPoint}`;
}

function scopeIdFromAccessKey(accessKey: string) {
  if (!/^\d{49}$/.test(accessKey)) return "";
  return `${accessKey.slice(24, 27)}-${accessKey.slice(27, 30)}`;
}

function saleInActiveScope(sale: Sale, data: AppData) {
  return documentScopeId(sale, data.issuer) === activeScopeId(data);
}

function guideInActiveScope(guide: RemissionGuide, data: AppData) {
  return documentScopeId(guide, data.issuer) === activeScopeId(data);
}

function closingInActiveScope(closing: CashClosing, data: AppData) {
  if (closing.establishment && closing.emissionPoint) return `${closing.establishment}-${closing.emissionPoint}` === activeScopeId(data);
  return true;
}

function scopedReportData(data: AppData, scopeId = activeScopeId(data)) {
  const sales = data.sales.filter((sale) => documentScopeId(sale, data.issuer) === scopeId);
  const saleIds = new Set(sales.map((sale) => sale.id));
  return {
    ...data,
    sales,
    guides: (data.guides || []).filter((guide) => documentScopeId(guide, data.issuer) === scopeId),
    receivedRetentions: (data.receivedRetentions || []).filter((retention) => !retention.saleId || saleIds.has(retention.saleId)),
    cashClosings: (data.cashClosings || []).filter((closing) => closing.establishment && closing.emissionPoint ? `${closing.establishment}-${closing.emissionPoint}` === scopeId : true)
  };
}

function nextInternalSequence(sales: Sale[], scopeId: string, legacyScopeId: string) {
  const next = sales
    .filter((sale) => sale.documentType === "nota_venta" && internalDocumentScopeId(sale, legacyScopeId) === scopeId)
    .map((sale) => Number((sale.sequence.match(/NV-(\d+)/) || [])[1] || 0))
    .reduce((max, value) => Math.max(max, value), 0) + 1;

  return `NV-${String(next).padStart(9, "0")}`;
}

function nextProformaSequence(sales: Sale[], scopeId: string, legacyScopeId: string) {
  const next = sales
    .filter((sale) => sale.documentType === "proforma" && internalDocumentScopeId(sale, legacyScopeId) === scopeId)
    .map((sale) => Number((sale.sequence.match(/PRO-(\d+)/) || [])[1] || 0))
    .reduce((max, value) => Math.max(max, value), 0) + 1;

  return `PRO-${String(next).padStart(9, "0")}`;
}

function internalDocumentScopeId(sale: Sale, legacyScopeId: string) {
  return sale.establishment && sale.emissionPoint ? `${sale.establishment}-${sale.emissionPoint}` : legacyScopeId;
}

function buildStockCredits(sale?: Sale) {
  const credits = new Map<string, number>();
  if (!sale || !saleStatusReducesStock(sale.status)) return credits;

  sale.items.forEach((item) => {
    credits.set(item.productId, (credits.get(item.productId) || 0) + item.quantity);
  });

  return credits;
}

function getAvailableStockForSale(product: Product, editingSale?: Sale) {
  return product.stock + (buildStockCredits(editingSale).get(product.id) || 0);
}

function restoreSaleStock(products: Product[], sale: Sale) {
  const credits = buildStockCredits(sale);

  return products.map((product) => {
    const quantity = credits.get(product.id) || 0;
    return quantity > 0 ? { ...product, stock: product.stock + quantity } : product;
  });
}

function buildStockMovements(products: Product[], sale: Sale, type: InventoryMovementType, reason: string, userId: string, createdAt: string) {
  const quantities = new Map<string, number>();
  sale.items.forEach((item) => {
    quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity);
  });

  return products.flatMap((product) => {
    const quantity = quantities.get(product.id) || 0;
    if (quantity <= 0) return [];
    const stockAfter = type === "entrada" ? product.stock + quantity : product.stock - quantity;

    return [{
      id: uid(),
      productId: product.id,
      productName: product.name,
      type,
      quantity,
      stockBefore: product.stock,
      stockAfter,
      reason,
      reference: sale.sequence,
      userId,
      createdAt
    }];
  });
}

function getRetryInfo(document: { retryHistory?: string[] }) {
  const today = dateKey(new Date());
  const todayAttempts = (document.retryHistory || []).filter((item) => dateKey(new Date(item)) === today).length;

  return {
    today: todayAttempts,
    remaining: Math.max(0, MAX_DAILY_RETRIES - todayAttempts)
  };
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shortText(value: string, maxLength: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 3)}...` : clean;
}

function userFriendlyActionError(error: unknown, action: "reserve-sequence" | "authorize-invoice" | "sync" | "email" | "generic" = "generic") {
  const raw = error instanceof Error ? error.message : String(error || "");
  const lower = raw.toLowerCase();
  const looksOffline = lower.includes("conexion") || lower.includes("network") || lower.includes("fetch") || lower.includes("failed to fetch") || lower.includes("internet") || lower.includes("servidor");

  if (looksOffline) {
    if (action === "reserve-sequence") {
      return "No hay internet o el servidor no esta disponible. Para emitir una factura electronica se necesita conexion a internet.";
    }
    if (action === "authorize-invoice") {
      return "No hay internet o el servidor no esta disponible. El documento quedo guardado y puede reintentarse cuando vuelva la conexion.";
    }
    if (action === "sync") {
      return "No hay internet. El cambio quedo guardado en este telefono y se sincronizara automaticamente cuando vuelva la conexion.";
    }
    if (action === "email") {
      return "No hay internet para enviar el correo. Intente nuevamente cuando vuelva la conexion.";
    }
    return "No hay internet o el servidor no esta disponible. Intente nuevamente cuando vuelva la conexion.";
  }

  if (lower.includes("licencia")) return raw;
  if (lower.includes("permiso")) return "Su usuario no tiene permiso para realizar esta accion.";
  return raw || "No se pudo completar la accion. Intente nuevamente.";
}

function formatSriResult(result: AuthorizationResponse) {
  const friendly = explainSriResult(result);
  return [
    "RESULTADO BACKEND / SRI",
    `Resumen: ${friendly.title}`,
    friendly.detail,
    friendly.action ? `Accion sugerida: ${friendly.action}` : "",
    "",
    JSON.stringify(
      {
        ok: result.ok,
        sent: result.sent,
        status: result.status,
        message: result.message,
        accessKey: result.accessKey,
        authorizationStatus: result.authorizationStatus,
        authorizationNumber: result.authorizationNumber,
        authorizationDate: result.authorizationDate,
        sriEnvironment: result.sriEnvironment,
        sriMessage: result.sriMessage,
        reception: result.reception,
        authorization: result.authorization,
        error: result.error
      },
      null,
      2
    ),
    "",
    "XML FIRMADO",
    result.signedXml || "No se recibio XML firmado."
  ].filter((line) => line !== "").join("\n");
}

async function handlePdfDocument(html: string, dialogTitle: string, documentTitle: string) {
  const file = await Print.printToFileAsync({ html, base64: false });
  const uri = await prepareGeneratedFile(file.uri, documentTitle, "pdf");

  if (Platform.OS === "web") return;

  Alert.alert(`${documentTitle} listo`, "Elija que desea hacer con el PDF.", [
    {
      text: "Ver",
      onPress: () => {
        void openPdfFile(uri, documentTitle);
      }
    },
    {
      text: "Enviar/guardar",
      onPress: () => {
        void shareGeneratedFile(uri, "application/pdf", dialogTitle, documentTitle);
      }
    },
    { text: "Cerrar", style: "cancel" }
  ]);
}

async function handleTicketDocument(html: string, dialogTitle: string, pageHeightMm: number) {
  if (Platform.OS === "web") return;
  const ticketPrintOptions = {
    html,
    width: mmToPrintPx(TICKET_PRINT_WIDTH_MM),
    height: mmToPrintPx(pageHeightMm),
    margins: { top: 0, right: 0, bottom: 0, left: 0 }
  };

  Alert.alert("Ticket POS listo", "Elija como desea sacar el ticket.", [
    {
      text: "Imprimir 80mm",
      onPress: () => {
        void Print.printAsync(ticketPrintOptions).catch((error) => {
          Alert.alert("No se pudo imprimir", error instanceof Error ? error.message : "Revise la impresora e intente nuevamente.");
        });
      }
    },
    {
      text: "Guardar PDF",
      onPress: async () => {
        try {
          const file = await Print.printToFileAsync({ ...ticketPrintOptions, base64: false });
          const uri = await prepareGeneratedFile(file.uri, "Ticket POS", "pdf");
          await shareGeneratedFile(uri, "application/pdf", dialogTitle, "Ticket POS");
        } catch (error) {
          Alert.alert("No se pudo guardar", error instanceof Error ? error.message : "Intente nuevamente.");
        }
      }
    },
    { text: "Cerrar", style: "cancel" }
  ]);
}

const TICKET_PRINT_WIDTH_MM = 80;

function estimateTicketPageHeightMm(sale: Sale) {
  const itemLines = sale.items.reduce((sum, item) => sum + Math.max(1, Math.ceil(String(item.name || "").length / 24)), 0);
  return Math.min(300, Math.max(120, 102 + itemLines * 8));
}

function mmToPrintPx(mm: number) {
  return Math.round((mm / 25.4) * 72);
}

async function createPdfBase64(html: string) {
  if (Platform.OS === "web") return "";
  const file = await Print.printToFileAsync({ html, base64: true });
  if (file.base64) return file.base64;
  if (file.uri) return FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
  return "";
}

function openHtmlViewer(html: string, title: string) {
  if (typeof window === "undefined" || !("document" in window)) return;

  const viewerHtml = buildHtmlViewerDocument(html, title);
  const tab = window.open("", "_blank");
  if (!tab) {
    Alert.alert("Ventana bloqueada", "Permita ventanas emergentes para ver el documento.");
    return;
  }

  tab.document.open();
  tab.document.write(viewerHtml);
  tab.document.close();
  tab.focus();
}

function buildHtmlViewerDocument(html: string, title: string) {
  const safeTitle = escapeHtml(title);
  const htmlPayload = JSON.stringify(html);
  const fileName = `${sanitizeFileName(title)}.html`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    html, body { margin: 0; height: 100%; font-family: Arial, sans-serif; background: #e5e7eb; }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 12px;
      background: #0f766e;
      color: #fff;
      box-shadow: 0 2px 10px rgba(15, 23, 42, 0.2);
    }
    .title { font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    button {
      border: 0;
      border-radius: 8px;
      padding: 9px 12px;
      font-weight: 800;
      color: #0f172a;
      background: #fff;
      cursor: pointer;
    }
    iframe { width: 100%; height: calc(100vh - 56px); border: 0; background: #fff; display: block; }
    @media print { .toolbar { display: none; } iframe { height: 100vh; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="title">${safeTitle}</div>
    <div class="actions">
      <button onclick="printDocument()">Imprimir / Guardar PDF</button>
      <button onclick="downloadHtml()">Descargar HTML</button>
    </div>
  </div>
  <iframe id="documentFrame" title="${safeTitle}"></iframe>
  <script>
    const documentHtml = ${htmlPayload};
    const blob = new Blob([documentHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const frame = document.getElementById("documentFrame");
    frame.src = url;
    function printDocument() {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    }
    function downloadHtml() {
      const link = document.createElement("a");
      link.href = url;
      link.download = ${JSON.stringify(fileName)};
      link.click();
    }
    window.addEventListener("beforeunload", () => URL.revokeObjectURL(url));
  </script>
</body>
</html>`;
}

async function prepareGeneratedFile(uri: string, title: string, extension: string) {
  const baseDirectory = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!baseDirectory) return uri;

  const namedUri = `${baseDirectory}${sanitizeFileName(title)}-${Date.now()}.${extension}`;
  try {
    await FileSystem.copyAsync({ from: uri, to: namedUri });
    return namedUri;
  } catch {
    return uri;
  }
}

async function openPdfFile(uri: string, fallbackTitle: string) {
  if (Platform.OS === "android") {
    try {
      const contentUri = await FileSystem.getContentUriAsync(uri);
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: contentUri,
        flags: 1,
        type: "application/pdf"
      });
      return;
    } catch {
      // Fall back to the share sheet when the device has no PDF viewer available.
    }
  }

  await shareGeneratedFile(uri, "application/pdf", fallbackTitle, fallbackTitle);
}

async function shareGeneratedFile(uri: string, mimeType: string, dialogTitle: string, fallbackTitle: string) {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType,
      dialogTitle
    });
  } else {
    Alert.alert(fallbackTitle, uri);
  }
}

function pickWebFile(accept: string): Promise<File | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}

function readWebFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",").pop() || "" : result);
    };
    reader.readAsDataURL(file);
  });
}

function explainSriResult(result: AuthorizationResponse) {
  const raw = `${result.error || ""} ${result.message || ""} ${result.status || ""} ${result.authorizationStatus || ""} ${result.sriMessage || ""} ${JSON.stringify(result.reception || {})} ${JSON.stringify(result.authorization || {})}`.toUpperCase();
  const text = shortText([result.error, result.message, result.sriMessage].filter(Boolean).join(" | "), 260);

  if (result.authorizationStatus === "AUTORIZADO" || raw.includes("<ESTADO>AUTORIZADO</ESTADO>")) {
    return {
      title: "Documento autorizado",
      detail: result.authorizationNumber ? `Autorizacion SRI: ${result.authorizationNumber}.` : "El SRI autorizo el comprobante.",
      action: ""
    };
  }
  if (raw.includes("CLAVE ACCESO REGISTRADA") || raw.includes("<IDENTIFICADOR>43</IDENTIFICADOR>")) {
    return {
      title: "Clave de acceso ya registrada",
      detail: "El SRI ya conoce ese documento. Si corresponde al mismo comprobante, use Reintentar para recuperar la autorizacion; si no, revise la numeracion.",
      action: "Verifique fecha, RUC, establecimiento y punto de emision."
    };
  }
  if (raw.includes("AMBIENTE") && raw.includes("NO COINCIDE")) {
    return {
      title: "Ambiente SRI no coincide",
      detail: text || "La app y el servidor estan configurados con ambientes diferentes.",
      action: "Revise el ambiente configurado antes de volver a emitir."
    };
  }
  if (raw.includes("CERTIFICADO") || raw.includes(".P12") || raw.includes("SRI_CERT_PASSWORD") || raw.includes("FIRMA")) {
    return {
      title: "Problema de firma electronica",
      detail: text || "No se pudo firmar el comprobante.",
      action: "Revise el certificado y su contrasena en configuracion."
    };
  }
  if (raw.includes("DEVUELTA")) {
    return {
      title: "Documento devuelto por recepcion SRI",
      detail: text || "El SRI recibio el comprobante pero lo devolvio por validacion.",
      action: "Abra el detalle del documento y revise la informacion tributaria."
    };
  }
  if (raw.includes("NO AUTORIZADO") || raw.includes("RECHAZADA") || raw.includes("ERROR")) {
    return {
      title: "Documento no autorizado",
      detail: text || "El SRI no autorizo el comprobante.",
      action: "Revise el detalle, corrija el comprobante y use Reintentar."
    };
  }
  if (result.sent === false || result.status === "DRY_RUN") {
    return {
      title: "Documento preparado en pruebas",
      detail: result.message || "El servidor preparo el documento pero no lo envio al SRI.",
      action: "Active SRI_ALLOW_SEND=true solo cuando este listo para enviar al SRI."
    };
  }

  return {
    title: result.ok ? "Respuesta SRI recibida" : "Respuesta SRI con observaciones",
    detail: text || "Revise el detalle tecnico.",
    action: result.ok ? "" : "Use el detalle del documento para revisar la respuesta completa."
  };
}

function sriUserMessage(result: AuthorizationResponse) {
  const friendly = explainSriResult(result);
  return [friendly.detail, friendly.action].filter(Boolean).join("\n\n");
}

function formatSaleDetail(sale: Sale, client: Client, issuer: AppData["issuer"]) {
  const retryInfo = getRetryInfo(sale);
  const isCreditNote = isCreditNoteSale(sale);
  return [
    isCreditNote ? "NOTA DE CREDITO" : isInvoiceSale(sale) ? "FACTURA" : sale.documentType === "proforma" ? "PROFORMA" : "NOTA DE VENTA",
    `Documento: ${documentTypeLabel(sale)}`,
    `Estado: ${sale.status}`,
    `Cliente: ${client.name}`,
    `Total: $${money(sale.total)}`,
    isInvoiceSale(sale) || isCreditNote ? `Clave de acceso: ${sale.accessKey}` : `Secuencia interna: ${sale.sequence}`,
    isCreditNote && sale.supportDocumentNumber ? `Factura modificada: ${sale.supportDocumentNumber}` : "",
    isCreditNote && sale.creditReason ? `Motivo nota credito: ${sale.creditReason}` : "",
    sale.authorizationNumber ? `Numero autorizacion: ${sale.authorizationNumber}` : "",
    sale.authorizationDate ? `Fecha autorizacion: ${sale.authorizationDate}` : "",
    sale.sriEnvironment ? `Ambiente SRI: ${sale.sriEnvironment}` : "",
    `Reenvios hoy: ${retryInfo.today}/${MAX_DAILY_RETRIES}`,
    sale.voidReason ? `Motivo anulacion: ${sale.voidReason}` : "",
    sale.voidedAt ? `Fecha anulacion: ${sale.voidedAt}` : "",
    sale.sriMessage ? `Mensaje SRI: ${sale.sriMessage}` : "",
    sale.emailHistory?.[0] ? `Ultimo correo: ${formatEmailHistoryEntry(sale.emailHistory[0])}` : "",
    "",
    isInvoiceSale(sale) || isCreditNote ? (sale.authorizedXml ? "XML AUTORIZADO" : sale.signedXml ? "XML FIRMADO" : "XML GENERADO") : sale.documentType === "proforma" ? "DETALLE PROFORMA" : "DETALLE INTERNO",
    isCreditNote ? sale.authorizedXml || sale.signedXml || buildCreditNoteXml(sale, client, issuer) : isInvoiceSale(sale) ? sale.authorizedXml || sale.signedXml || buildInvoiceXml(sale, client, issuer) : formatInternalSaleDetail(sale)
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function formatEmailHistoryEntry(entry: NonNullable<Sale["emailHistory"]>[number]) {
  const status = entry.status === "sent" ? "enviado" : "fallido";
  return `${status} a ${entry.to} el ${formatAuditDate(entry.sentAt)}${entry.error ? ` | ${entry.error}` : ""}`;
}

function formatReceivedRetentionDetail(retention: ReceivedRetention, sale: Sale | undefined, client: Client | undefined, issuer: Issuer) {
  return [
    "RETENCION RECIBIDA",
    `Impuesto: ${retention.taxType}`,
    `Comprobante: ${retention.documentNumber}`,
    retention.authorizationNumber ? `Autorizacion: ${retention.authorizationNumber}` : "",
    `Fecha recepcion: ${formatShortDate(retention.receivedAt)}`,
    `Cliente: ${client?.name || "Cliente"}`,
    sale ? `Factura relacionada: ${documentNumber(sale, issuer)}` : "",
    sale?.authorizationNumber ? `Autorizacion factura: ${sale.authorizationNumber}` : "",
    `Base: $${money(retention.base)}`,
    `Porcentaje: ${money(retention.percentage)}%`,
    `Valor retenido: $${money(retention.amount)}`,
    retention.notes ? `Notas: ${retention.notes}` : ""
  ].filter((line) => line !== "").join("\n");
}

function formatInternalSaleDetail(sale: Sale) {
  const lines = sale.items.map((item) => `${item.quantity} x ${item.name} | Base $${money(calculateLineSubtotal(item))} | IVA $${money(calculateLineTax(item))} | Total $${money(calculateLineTotal(item))}`);

  return [
    `Subtotal: $${money(sale.subtotal)}`,
    `IVA referencial: $${money(sale.tax)}`,
    `Total: $${money(sale.total)}`,
    "",
    "PRODUCTOS",
    ...lines
  ].join("\n");
}

function buildInternalTicketHtml(sale: Sale, client: Client, issuer: Issuer, pageHeightMm = estimateTicketPageHeightMm(sale)) {
  const rows = sale.items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td class="right">${money(item.quantity)}</td>
          <td class="right">${money(calculateLineTotal(item) / item.quantity)}</td>
          <td class="right">${money(calculateLineTotal(item))}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: 80mm ${pageHeightMm}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: 80mm; min-height: ${pageHeightMm}mm; }
    body { font-family: Arial, sans-serif; color: #111827; font-size: 11px; margin: 0; padding: 3mm; background: #e5e7eb; }
    .ticket { width: 74mm; margin: 0 auto; padding: 4mm 3mm; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; }
    h1 { font-size: 15px; text-align: center; margin: 0 0 4px; }
    .center { text-align: center; }
    .muted { color: #64748b; font-size: 10px; }
    .line { border-top: 1px dashed #94a3b8; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { padding: 4px 0; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    th { text-align: left; font-size: 10px; }
    th:nth-child(2), th:nth-child(3), th:nth-child(4) { width: 17mm; }
    td { overflow-wrap: anywhere; }
    .right { text-align: right; }
    .total { font-size: 15px; font-weight: 800; }
    .meta { line-height: 1.35; overflow-wrap: anywhere; }
    @media screen { .ticket { box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12); } }
    @media print {
      html, body { width: 80mm; min-height: ${pageHeightMm}mm; }
      body { padding: 0; background: #ffffff; }
      .ticket { width: 74mm; margin: 0 auto; padding: 3mm; border: 0; border-radius: 0; box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="ticket">
    <h1>${escapeHtml(issuer.tradeName || issuer.businessName)}</h1>
    <div class="center muted">${escapeHtml(issuer.businessName)}</div>
    <div class="center muted">RUC ${escapeHtml(issuer.ruc)}</div>
    <div class="center muted">${escapeHtml(issuer.address)}</div>
    <div class="line"></div>
    <div class="meta"><strong>NOTA DE VENTA INTERNA</strong></div>
    <div class="meta">No. ${escapeHtml(documentNumber(sale, issuer))}</div>
    <div class="meta">Fecha: ${escapeHtml(formatShortDate(sale.createdAt))}</div>
    <div class="meta">Cliente: ${escapeHtml(client.name)}</div>
    <div class="meta">Identificacion: ${escapeHtml(client.identification)}</div>
    <div class="line"></div>
    <table>
      <thead><tr><th>Producto</th><th class="right">Cant.</th><th class="right">P.Unit</th><th class="right">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="line"></div>
    <table>
      <tr><td>Subtotal</td><td class="right">${money(sale.subtotal)}</td></tr>
      <tr><td>IVA ref.</td><td class="right">${money(sale.tax)}</td></tr>
      <tr><td class="total">TOTAL</td><td class="right total">${money(sale.total)}</td></tr>
    </table>
    <div class="line"></div>
    <div class="center muted">Documento interno no tributario</div>
  </div>
</body>
</html>`;
}

function buildProformaHtml(sale: Sale, client: Client, issuer: Issuer) {
  const rows = sale.items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.code)}</td>
          <td>${escapeHtml(item.name)}</td>
          <td class="right">${money(item.quantity)}</td>
          <td class="right">${money(calculateLineSubtotal(item) / item.quantity)}</td>
          <td class="right">${money(calculateLineDiscount(item))}</td>
          <td class="right">${money(calculateLineTax(item))}</td>
          <td class="right">${money(calculateLineTotal(item))}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    html, body { width: 100%; min-height: 100%; }
    body { font-family: Arial, sans-serif; color: #111827; font-size: 11px; margin: 0; padding: 12px; background: #e5e7eb; }
    .sheet { width: min(196mm, calc(100vw - 24px)); min-height: 276mm; margin: 0 auto; padding: 6mm; background: #ffffff; overflow: hidden; }
    h1 { font-size: 22px; margin: 0 0 6px; color: #0f766e; letter-spacing: 0; }
    .top { display: grid; grid-template-columns: minmax(0, 1fr) minmax(62mm, 82mm); gap: 10px; border-bottom: 2px solid #0f766e; padding-bottom: 10px; align-items: start; }
    .muted { color: #64748b; overflow-wrap: anywhere; }
    .box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 9px; margin-top: 10px; overflow-wrap: anywhere; }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; table-layout: fixed; }
    th, td { border: 1px solid #cbd5e1; padding: 6px; vertical-align: top; overflow-wrap: anywhere; }
    th { background: #f1f5f9; text-align: left; font-size: 10px; }
    th:nth-child(1) { width: 24mm; }
    th:nth-child(3) { width: 18mm; }
    th:nth-child(4), th:nth-child(5), th:nth-child(6), th:nth-child(7) { width: 22mm; }
    .right { text-align: right; }
    .total { font-size: 18px; font-weight: 800; }
    .note { margin-top: 14px; color: #64748b; font-size: 11px; }
    @media screen { .sheet { box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12); } }
    @media (max-width: 760px) {
      body { padding: 8px; }
      .sheet { width: calc(100vw - 16px); padding: 12px; min-height: auto; }
      .top, .grid { grid-template-columns: 1fr; }
      h1 { font-size: 20px; }
      table { font-size: 10px; }
      th, td { padding: 5px; }
      th:nth-child(1) { width: 62px; }
      th:nth-child(3) { width: 52px; }
      th:nth-child(4), th:nth-child(5), th:nth-child(6), th:nth-child(7) { width: 58px; }
    }
    @media print {
      body { padding: 0; background: #ffffff; }
      .sheet { width: 100%; min-height: auto; margin: 0; padding: 0; box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="sheet">
  <div class="top">
    <div>
      <h1>PROFORMA</h1>
      <div class="muted">No. ${escapeHtml(documentNumber(sale, issuer))}</div>
      <div class="muted">Fecha: ${escapeHtml(formatShortDate(sale.createdAt))}</div>
    </div>
    <div class="right">
      <strong>${escapeHtml(issuer.businessName)}</strong><br/>
      RUC ${escapeHtml(issuer.ruc)}<br/>
      ${escapeHtml(issuer.address)}
    </div>
  </div>
  <div class="grid">
    <div class="box">
      <strong>Cliente</strong><br/>
      ${escapeHtml(client.name)}<br/>
      ${escapeHtml(client.identification)}<br/>
      ${escapeHtml(client.address)}
    </div>
    <div class="box">
      <strong>Resumen</strong><br/>
      Subtotal: $${money(sale.subtotal)}<br/>
      IVA referencial: $${money(sale.tax)}<br/>
      <span class="total">Total: $${money(sale.total)}</span>
    </div>
  </div>
  <table>
    <thead>
      <tr><th>Codigo</th><th>Descripcion</th><th class="right">Cant.</th><th class="right">P.Unit</th><th class="right">Desc.</th><th class="right">IVA</th><th class="right">Total</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="note">Documento comercial no tributario. No descuenta inventario y no reemplaza factura autorizada.</div>
  </div>
</body>
</html>`;
}

function buildCreditNoteRideHtml(sale: Sale, client: Client, issuer: Issuer, source?: Sale) {
  const creditNoteNumber = `${issuer.establishment}-${issuer.emissionPoint}-${sale.sequence}`;
  const authorization = sale.authorizationNumber || sale.accessKey;
  const supportNumber = sale.supportDocumentNumber || (source ? documentNumber(source, issuer) : "");
  const supportAuthorization = sale.supportAuthorizationNumber || source?.authorizationNumber || "";
  const rows = sale.items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.code)}</td>
          <td>${escapeHtml(item.name)}</td>
          <td class="right">${money(item.quantity)}</td>
          <td class="right">${money(item.unitPrice)}</td>
          <td class="right">${money(calculateLineDiscount(item))}</td>
          <td class="right">${money(calculateLineTax(item))}</td>
          <td class="right">${money(calculateLineTotal(item))}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; }
    html, body { width: 100%; min-height: 100%; }
    body { font-family: Arial, sans-serif; color: #111827; font-size: 11px; margin: 0; padding: 12px; background: #e5e7eb; }
    .sheet { width: min(196mm, calc(100vw - 24px)); min-height: 276mm; margin: 0 auto; padding: 6mm; background: #ffffff; overflow: hidden; }
    h1 { font-size: 22px; margin: 0 0 6px; color: #1d4ed8; letter-spacing: 0; }
    .top { display: grid; grid-template-columns: minmax(0, 1fr) minmax(72mm, 88mm); gap: 10px; align-items: stretch; }
    .issuer { border: 1.5px solid #1d4ed8; border-radius: 6px; padding: 10px; min-height: 42mm; }
    .doc { border: 1.5px solid #1d4ed8; border-radius: 6px; padding: 10px; min-height: 42mm; }
    .company { font-size: 15px; font-weight: 800; margin-bottom: 6px; }
    .label { color: #475569; font-size: 10px; font-weight: 700; margin-top: 5px; }
    .value { color: #111827; font-weight: 700; overflow-wrap: anywhere; word-break: break-word; }
    .auth { font-size: 9px; line-height: 1.25; }
    .muted { color: #64748b; }
    .box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 9px; margin-top: 10px; min-height: 25mm; }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; table-layout: fixed; }
    th, td { border: 1px solid #cbd5e1; padding: 6px; vertical-align: top; }
    th { background: #eff6ff; text-align: left; }
    th:nth-child(1) { width: 24mm; }
    th:nth-child(3), th:nth-child(4), th:nth-child(5), th:nth-child(6), th:nth-child(7) { width: 22mm; }
    .right { text-align: right; }
    .totalPanel { margin-top: 10px; margin-left: auto; width: 70mm; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; }
    .totalRow { display: flex; justify-content: space-between; padding: 7px 9px; border-bottom: 1px solid #e5e7eb; }
    .totalRow:last-child { border-bottom: 0; background: #eff6ff; color: #1d4ed8; font-size: 15px; font-weight: 900; }
    .note { margin-top: 12px; color: #64748b; font-size: 10px; }
    @media screen { .sheet { box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12); } }
    @media print {
      body { padding: 0; background: #ffffff; }
      .sheet { width: 100%; min-height: auto; padding: 0; box-shadow: none; }
    }
    @media (max-width: 760px) {
      body { padding: 8px; }
      .sheet { width: calc(100vw - 16px); padding: 12px; }
      .top, .grid { grid-template-columns: 1fr; }
      .totalPanel { width: 100%; }
      table { font-size: 10px; }
      th, td { padding: 5px; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="top">
      <div class="issuer">
        <div class="company">${escapeHtml(issuer.businessName)}</div>
        <div><b>Nombre comercial:</b> ${escapeHtml(issuer.tradeName)}</div>
        <div><b>RUC:</b> ${escapeHtml(issuer.ruc)}</div>
        <div><b>Direccion matriz:</b> ${escapeHtml(issuer.address)}</div>
        <div><b>Obligado contabilidad:</b> ${issuer.accountingRequired}</div>
      </div>
      <div class="doc">
        <h1>NOTA DE CREDITO</h1>
        <div class="label">No.</div>
        <div class="value">${escapeHtml(creditNoteNumber)}</div>
        <div class="label">Numero de autorizacion</div>
        <div class="value auth">${escapeHtml(authorization)}</div>
        <div class="label">Fecha autorizacion</div>
        <div class="value">${escapeHtml(formatShortDate(sale.authorizationDate || sale.createdAt))}</div>
        <div class="label">Clave de acceso</div>
        <div class="value auth">${escapeHtml(sale.accessKey)}</div>
      </div>
    </div>

    <div class="grid">
      <div class="box">
        <strong>Cliente</strong><br/>
        ${escapeHtml(client.name)}<br/>
        Identificacion: ${escapeHtml(client.identification)}<br/>
        Direccion: ${escapeHtml(client.address)}
      </div>
      <div class="box">
        <strong>Factura modificada</strong><br/>
        Documento: ${escapeHtml(supportNumber)}<br/>
        Autorizacion: <span class="auth">${escapeHtml(supportAuthorization)}</span><br/>
        Motivo: ${escapeHtml(sale.creditReason || "Anulacion total de factura")}
      </div>
    </div>

    <table>
      <thead>
        <tr><th>Codigo</th><th>Descripcion</th><th class="right">Cant.</th><th class="right">P.Unit</th><th class="right">Desc.</th><th class="right">IVA</th><th class="right">Total</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totalPanel">
      <div class="totalRow"><span>Subtotal</span><strong>$${money(sale.subtotal)}</strong></div>
      <div class="totalRow"><span>IVA</span><strong>$${money(sale.tax)}</strong></div>
      <div class="totalRow"><span>Valor modificacion</span><strong>$${money(sale.total)}</strong></div>
    </div>
    <div class="note">Documento tributario electronico que modifica total o parcialmente una factura autorizada.</div>
  </div>
</body>
</html>`;
}

function validateGuideForm(transporterName: string, transporterIdentification: string, transporterType: "04" | "05" | "06", plate: string, startAddress: string, endAddress: string, route: string, reason: string, startDate: string, endDate: string) {
  const errors: string[] = [];
  const identification = transporterIdentification.trim();
  const start = parseInputDate(startDate, "start");
  const end = parseInputDate(endDate, "end");

  if (!transporterName.trim()) errors.push("Ingrese transportista.");
  if (transporterType === "04" && !isValidRuc(identification)) errors.push("El RUC del transportista no es valido.");
  if (transporterType === "05" && !isValidCedula(identification)) errors.push("La cedula del transportista no es valida.");
  if (transporterType === "06" && identification.length < 4) errors.push("El pasaporte del transportista es muy corto.");
  if (!plate.trim()) errors.push("Ingrese placa.");
  if (!startAddress.trim()) errors.push("Ingrese direccion de partida.");
  if (!endAddress.trim()) errors.push("Ingrese direccion de destino.");
  if (!route.trim()) errors.push("Ingrese ruta.");
  if (!reason.trim()) errors.push("Ingrese motivo de traslado.");
  if (!start) errors.push("Fecha inicio invalida. Use YYYY-MM-DD.");
  if (!end) errors.push("Fecha fin invalida. Use YYYY-MM-DD.");
  if (start && end && end < start) errors.push("La fecha fin no puede ser menor a la fecha inicio.");

  return errors;
}

function formatGuideDetail(guide: RemissionGuide, client: Client | undefined, issuer: Issuer, source?: Sale) {
  return [
    "GUIA DE REMISION",
    `Estado: ${guide.status}`,
    `Destinatario: ${client?.name || "Cliente"}`,
    `Secuencial: ${issuer.establishment}-${issuer.emissionPoint}-${guide.sequence}`,
    `Clave de acceso: ${guide.accessKey}`,
    guide.authorizationNumber ? `Numero autorizacion: ${guide.authorizationNumber}` : "",
    guide.authorizationDate ? `Fecha autorizacion: ${guide.authorizationDate}` : "",
    guide.sriEnvironment ? `Ambiente SRI: ${guide.sriEnvironment}` : "",
    guide.sriMessage ? `Mensaje SRI: ${guide.sriMessage}` : "",
    `Transportista: ${guide.transporterName}`,
    `Identificacion transportista: ${guide.transporterIdentification}`,
    `Placa: ${guide.plate}`,
    `Ruta: ${guide.route}`,
    `Motivo: ${guide.reason}`,
    "",
    guide.authorizedXml ? "XML AUTORIZADO" : guide.signedXml ? "XML FIRMADO" : "XML GENERADO",
    guide.authorizedXml || guide.signedXml || (client ? buildRemissionGuideXml(guide, client, issuer, source) : "")
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function buildGuideRideHtml(guide: RemissionGuide, client: Client, issuer: Issuer, source?: Sale) {
  const guideNumber = `${issuer.establishment}-${issuer.emissionPoint}-${guide.sequence}`;
  const environment = guide.sriEnvironment || (issuer.environment === "1" ? "PRUEBAS" : "PRODUCCION");
  const authorization = guide.authorizationNumber || guide.accessKey;
  const sourceNumber = source ? documentNumber(source, issuer) : "Sin sustento";
  const rows = guide.items
    .map(
      (item) => `
        <tr>
          <td class="center">${escapeHtml(item.code)}</td>
          <td>${escapeHtml(item.name)}</td>
          <td class="right">${money(item.quantity)}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 9mm; }
    body { font-family: Arial, sans-serif; color: #000; font-size: 10.5px; margin: 0; background: #fff; }
    .sheet { width: 194mm; min-height: 279mm; margin: 0 auto; box-sizing: border-box; }
    .top { display: grid; grid-template-columns: 1fr 1.05fr; gap: 6mm; align-items: stretch; }
    .left-head { min-height: 68mm; display: flex; flex-direction: column; }
    .logo { height: 25mm; display: flex; align-items: center; justify-content: center; color: #dc2626; font-size: 24px; font-weight: 900; margin-bottom: 4mm; }
    .logo-img { max-width: 58mm; max-height: 22mm; object-fit: contain; }
    .box { border: 1.4px solid #000; border-radius: 5px; padding: 8px; box-sizing: border-box; }
    .issuer { flex: 1; min-height: 0; }
    .issuer-info { line-height: 1.24; }
    .issuer-line { margin-top: 3px; }
    .company { font-weight: 800; margin-bottom: 8px; font-size: 11px; }
    .doc { min-height: 68mm; }
    .ruc { font-size: 15px; font-weight: 900; margin-bottom: 8px; }
    .title { font-size: 14px; font-weight: 800; margin-bottom: 8px; }
    .label { font-size: 8.5px; font-weight: 800; margin-top: 7px; text-transform: uppercase; }
    .value { margin-top: 3px; word-break: break-word; }
    .auth { font-size: 8.5px; line-height: 1.35; font-weight: 700; }
    .section { margin-top: 7px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 7px; }
    .kv { display: grid; grid-template-columns: 42mm 1fr; gap: 4px 7px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #000; padding: 5px 4px; vertical-align: top; }
    th { text-align: center; font-weight: 800; background: #f8fafc; }
    .right { text-align: right; }
    .center { text-align: center; }
    .small { font-size: 9px; }
    .footer { margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; }
    .signature { border-top: 1px solid #000; text-align: center; padding-top: 5px; margin-top: 18mm; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="top">
      <div class="left-head">
        <div class="logo">${issuer.logoUrl ? `<img class="logo-img" src="${escapeHtml(issuer.logoUrl)}" />` : "NO TIENE LOGO"}</div>
        <div class="box issuer">
        <div class="issuer-info">
          <div class="company">${escapeHtml(issuer.businessName)}</div>
          <div class="issuer-line"><b>Nombre Comercial:</b> ${escapeHtml(issuer.tradeName)}</div>
          <div class="issuer-line"><b>Direccion Matriz:</b> ${escapeHtml(issuer.address)}</div>
          <div class="issuer-line"><b>Direccion Sucursal:</b> ${escapeHtml(issuer.address)}</div>
          <div class="issuer-line"><b>Contribuyente especial:</b> ${issuer.specialTaxpayer}${issuer.specialTaxpayerResolution ? ` - ${escapeHtml(issuer.specialTaxpayerResolution)}` : ""}</div>
          <div class="issuer-line"><b>OBLIGADO A LLEVAR CONTABILIDAD:</b> ${issuer.accountingRequired}</div>
        </div>
        </div>
      </div>
      <div class="box doc">
        <div class="ruc">R.U.C.: ${escapeHtml(issuer.ruc)}</div>
        <div class="title">GUIA DE REMISION</div>
        <div class="label">No.</div>
        <div class="value">${escapeHtml(guideNumber)}</div>
        <div class="label">Numero de autorizacion</div>
        <div class="value auth">${escapeHtml(authorization)}</div>
        <div class="label">Fecha y hora de autorizacion</div>
        <div class="value">${escapeHtml(guide.authorizationDate || "")}</div>
        <div class="label">Ambiente</div>
        <div class="value">${escapeHtml(environment)}</div>
        <div class="label">Emision</div>
        <div class="value">NORMAL</div>
        <div class="label">Clave de acceso</div>
        <div class="value auth">${escapeHtml(guide.accessKey)}</div>
      </div>
    </div>

    <div class="box section">
      <div class="kv">
        <b>Identificacion transportista:</b><span>${escapeHtml(guide.transporterIdentification)}</span>
        <b>Razon social transportista:</b><span>${escapeHtml(guide.transporterName)}</span>
        <b>Placa:</b><span>${escapeHtml(guide.plate)}</span>
        <b>Punto de partida:</b><span>${escapeHtml(guide.startAddress)}</span>
        <b>Fecha inicio transporte:</b><span>${escapeHtml(formatGuideDate(guide.startDate))}</span>
        <b>Fecha fin transporte:</b><span>${escapeHtml(formatGuideDate(guide.endDate))}</span>
      </div>
    </div>

    <div class="grid">
      <div class="box">
        <b>Destinatario</b><br/>
        ${escapeHtml(client.name)}<br/>
        Identificacion: ${escapeHtml(client.identification)}<br/>
        Direccion: ${escapeHtml(guide.endAddress)}
      </div>
      <div class="box">
        <b>Traslado</b><br/>
        Motivo: ${escapeHtml(guide.reason)}<br/>
        Ruta: ${escapeHtml(guide.route)}<br/>
        Documento sustento: ${escapeHtml(sourceNumber)}
      </div>
    </div>

    <table>
      <thead><tr><th>Codigo</th><th>Descripcion</th><th class="right">Cantidad</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="footer">
      <div class="small">
        <b>Informacion adicional</b><br/>
        Destinatario: ${escapeHtml(client.name)}<br/>
        Transportista: ${escapeHtml(guide.transporterName)}<br/>
        Clave: ${escapeHtml(guide.accessKey)}
      </div>
      <div class="signature">Recibi conforme</div>
    </div>
  </div>
</body>
</html>`;
}

function formatGuideDate(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return formatShortDate(value);
}

function validateBeforeIssue(data: AppData, client: Client, items: SaleItem[], totals: { subtotal: number; tax: number; total: number }, stockCredits = new Map<string, number>()) {
  const errors: string[] = [];

  validateIssuer(data.issuer, data.backendUrl, errors);
  validateClient(client, errors);
  validateItems(data.products, items, errors, stockCredits);

  const recalculated = calculateTotals(items);
  if (totals.total <= 0 || recalculated.total <= 0) errors.push("El total de la factura debe ser mayor a cero.");
  if (money(totals.subtotal) !== money(recalculated.subtotal) || money(totals.tax) !== money(recalculated.tax) || money(totals.total) !== money(recalculated.total)) {
    errors.push("Los totales no cuadran. Quite y vuelva a agregar los productos.");
  }

  return errors;
}

function validateBeforeInternalSale(data: AppData, items: SaleItem[], totals: { subtotal: number; tax: number; total: number }, stockCredits = new Map<string, number>()) {
  const errors: string[] = [];

  validateItems(data.products, items, errors, stockCredits);
  const recalculated = calculateTotals(items);
  if (totals.total <= 0 || recalculated.total <= 0) errors.push("El total de la nota de venta debe ser mayor a cero.");
  if (money(totals.subtotal) !== money(recalculated.subtotal) || money(totals.tax) !== money(recalculated.tax) || money(totals.total) !== money(recalculated.total)) {
    errors.push("Los totales no cuadran. Quite y vuelva a agregar los productos.");
  }

  return errors;
}

function validateBeforeProforma(data: AppData, items: SaleItem[], totals: { subtotal: number; tax: number; total: number }) {
  const errors: string[] = [];

  validateItems(data.products, items, errors, new Map(), false);
  const recalculated = calculateTotals(items);
  if (totals.total <= 0 || recalculated.total <= 0) errors.push("El total de la proforma debe ser mayor a cero.");
  if (money(totals.subtotal) !== money(recalculated.subtotal) || money(totals.tax) !== money(recalculated.tax) || money(totals.total) !== money(recalculated.total)) {
    errors.push("Los totales no cuadran. Quite y vuelva a agregar los productos.");
  }

  return errors;
}

function validateIssuer(issuer: Issuer, backendUrl: string, errors: string[]) {
  if (!isValidRuc(issuer.ruc)) errors.push("El RUC del emisor no es valido.");
  if (!issuer.businessName.trim()) errors.push("Ingrese la razon social del emisor.");
  if (!issuer.tradeName.trim()) errors.push("Ingrese el nombre comercial del emisor.");
  if (issuer.email?.trim() && !isValidEmail(issuer.email)) errors.push("Ingrese un correo de contacto valido para la empresa.");
  if (!issuer.address.trim()) errors.push("Ingrese la direccion matriz del emisor.");
  if (!/^\d{3}$/.test(issuer.establishment)) errors.push("El establecimiento debe tener 3 digitos.");
  if (!/^\d{3}$/.test(issuer.emissionPoint)) errors.push("El punto de emision debe tener 3 digitos.");
  if (!Number.isInteger(Number(issuer.sequential)) || Number(issuer.sequential) <= 0) errors.push("El secuencial debe ser mayor a cero.");
  if (issuer.specialTaxpayer === "SI" && !issuer.specialTaxpayerResolution.trim()) errors.push("Ingrese la resolucion de contribuyente especial.");
  if (!isValidUrl(backendUrl)) errors.push("La URL del backend no es valida.");
}

function validateEmissionPointLicense(data: AppData, documentIssuer: Issuer, errors: string[]) {
  const scopeId = `${documentIssuer.establishment}-${documentIssuer.emissionPoint}`;
  if (!canUseEmissionScope(data.issuer, data.license, scopeId)) {
    errors.push(`Su plan actual no permite usar el punto de emision ${scopeId}. Actualice a Pro o seleccione el punto autorizado.`);
  }
}

function buildProductionChecklist(issuer: Issuer, backendUrl: string, connectionResult: string) {
  const sequentialOk = Number(issuer.sequential) > 0 && Number(issuer.remissionSequential || 1) > 0 && Number(issuer.creditNoteSequential || 1) > 0;
  const backendProduction = connectionResult.includes("Ambiente backend: production");
  const backendConnected = connectionResult.includes("Backend responde: SI");
  const certOk = connectionResult.includes("Certificado existe: SI") && connectionResult.includes("Clave certificado configurada: SI");
  const sriSendOk = connectionResult.includes("Envio real al SRI: ACTIVO");
  const baseChecks = [
    { label: "RUC emisor valido", ok: isValidRuc(issuer.ruc) },
    { label: "Establecimiento y punto de emision", ok: /^\d{3}$/.test(issuer.establishment) && /^\d{3}$/.test(issuer.emissionPoint) },
    { label: "Secuenciales factura/guia/nota credito", ok: sequentialOk },
    { label: "URL de servidor configurada", ok: Boolean(backendUrl && isValidUrl(backendUrl)) }
  ];
  const connectionChecks = [
    { label: "Servidor probado en esta sesion", ok: backendConnected, pendingLabel: "PENDIENTE" },
    { label: "Certificado y clave detectados", ok: certOk, pendingLabel: "PENDIENTE" }
  ];
  const productionChecks = [
    { label: "Ambiente app en produccion", ok: issuer.environment === "2", pendingLabel: "SOLO PRODUCCION" },
    { label: "Backend en produccion", ok: backendProduction, pendingLabel: "SOLO PRODUCCION" },
    { label: "Envio real SRI activo", ok: sriSendOk, pendingLabel: "SOLO PRODUCCION" }
  ];

  return { baseChecks, connectionChecks, productionChecks };
}

function validateClient(client: Client, errors: string[]) {
  if (!client.name.trim()) errors.push("Ingrese la razon social o nombre del cliente.");
  if (!client.address.trim()) errors.push("Ingrese la direccion del cliente.");
  if (client.email.trim() && !isValidEmail(client.email)) errors.push("Ingrese un email valido del cliente.");

  const identification = client.identification.trim();
  if (client.identificationType === "07") {
    if (identification !== "9999999999999") errors.push("Consumidor final debe usar identificacion 9999999999999.");
    return;
  }
  if (client.identificationType === "05" && !isValidCedula(identification)) errors.push("La cedula del cliente no es valida.");
  if (client.identificationType === "04" && !isValidRuc(identification)) errors.push("El RUC del cliente no es valido.");
  if (client.identificationType === "06" && identification.length < 4) errors.push("El pasaporte del cliente es muy corto.");
  if (client.identificationType === "08" && identification.length < 4) errors.push("La identificacion exterior del cliente es muy corta.");
}

function normalizeClientForInvoice(client: Client): Client {
  const identification = client.identification.trim();

  if (isValidRuc(identification)) {
    return { ...client, identification, identificationType: "04" };
  }

  if (isValidCedula(identification)) {
    return { ...client, identification, identificationType: "05" };
  }

  return { ...client, identification };
}

function validateItems(products: Product[], items: SaleItem[], errors: string[], stockCredits = new Map<string, number>(), checkStock = true) {
  const quantityByProduct = new Map<string, number>();

  items.forEach((item, index) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    if (!product) errors.push(`Producto ${index + 1}: ya no existe en el catalogo.`);
    if (!item.code.trim()) errors.push(`Producto ${index + 1}: falta codigo principal.`);
    if (!item.name.trim()) errors.push(`Producto ${index + 1}: falta descripcion.`);
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) errors.push(`Producto ${index + 1}: cantidad invalida.`);
    if (!Number.isFinite(item.unitPrice) || item.unitPrice <= 0) errors.push(`Producto ${index + 1}: precio invalido.`);
    if (!Number.isFinite(item.discount || 0) || (item.discount || 0) < 0) errors.push(`Producto ${index + 1}: descuento invalido.`);
    if (calculateLineDiscount(item) > item.quantity * item.unitPrice) errors.push(`Producto ${index + 1}: descuento mayor al subtotal.`);
    if (![0, 0.15].includes(item.ivaRate)) errors.push(`Producto ${index + 1}: IVA no soportado.`);
    quantityByProduct.set(item.productId, (quantityByProduct.get(item.productId) || 0) + item.quantity);
  });

  quantityByProduct.forEach((quantity, productId) => {
    const product = products.find((candidate) => candidate.id === productId);
    const availableStock = product ? product.stock + (stockCredits.get(product.id) || 0) : 0;
    if (checkStock && product && quantity > availableStock) errors.push(`${product.name}: stock insuficiente. Disponible ${availableStock}, solicitado ${quantity}.`);
  });
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function loginErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (!message) return "No se pudo validar el acceso. Revise sus datos e intente nuevamente.";
  if (message.includes("No hay conexion")) return message;
  if (message.includes("varias empresas")) return message;
  if (message.includes("clave") || message.includes("contrasena")) return message;
  if (message.includes("No encontramos una cuenta")) return message;
  if (message.includes("Credenciales invalidas")) return "No encontramos una cuenta activa con esos datos. Revise el correo/RUC o registre la empresa.";
  return message;
}

function isBackendConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message.includes("No hay conexion");
}

function isValidCedula(value: string) {
  if (!/^\d{10}$/.test(value)) return false;
  const province = Number(value.slice(0, 2));
  const thirdDigit = Number(value[2]);
  if (!((province >= 1 && province <= 24) || province === 30) || thirdDigit >= 6) return false;

  const coefficients = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  const total = coefficients.reduce((sum, coefficient, index) => {
    const multiplied = Number(value[index]) * coefficient;
    return sum + (multiplied > 9 ? multiplied - 9 : multiplied);
  }, 0);
  const verifier = total % 10 === 0 ? 0 : 10 - (total % 10);

  return verifier === Number(value[9]);
}

function isValidRuc(value: string) {
  if (!/^\d{13}$/.test(value) || !value.endsWith("001")) return false;
  const thirdDigit = Number(value[2]);

  if (thirdDigit < 6) return isValidCedula(value.slice(0, 10));
  if (thirdDigit === 6) return validateMod11(value, [3, 2, 7, 6, 5, 4, 3, 2], 8);
  if (thirdDigit === 9) return validateMod11(value, [4, 3, 2, 7, 6, 5, 4, 3, 2], 9);

  return false;
}

function validateMod11(value: string, coefficients: number[], verifierIndex: number) {
  const total = coefficients.reduce((sum, coefficient, index) => sum + Number(value[index]) * coefficient, 0);
  const remainder = total % 11;
  const verifier = remainder === 0 ? 0 : 11 - remainder;

  return verifier === Number(value[verifierIndex]);
}

function buildDashboard(data: AppData) {
  const scoped = scopedReportData(data);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const effectiveSales = scoped.sales.filter((sale) => (sale.documentType === "nota_venta" && sale.status === "INTERNA") || ((isInvoiceSale(sale) || isCreditNoteSale(sale)) && sale.status === "AUTORIZADA"));
  const todaySales = effectiveSales.filter((sale) => isDateInRange(sale.createdAt, todayStart, todayEnd));
  const monthSales = effectiveSales.filter((sale) => isDateInRange(sale.createdAt, monthStart, monthEnd));
  const pending = scoped.sales.filter((sale) => isInvoiceSale(sale) && !["AUTORIZADA", "RECHAZADA", "ANULADA"].includes(sale.status));
  const rejected = scoped.sales.filter((sale) => isInvoiceSale(sale) && sale.status === "RECHAZADA");
  const lowStock = data.products.filter((product) => product.stock <= productMinStock(product)).sort((a, b) => a.stock - b.stock);
  const recentSales = [...scoped.sales].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);

  return {
    todayCount: todaySales.length,
    todayTotal: todaySales.reduce((sum, sale) => sum + accountingValue(sale, sale.total), 0),
    monthCount: monthSales.length,
    monthTotal: monthSales.reduce((sum, sale) => sum + accountingValue(sale, sale.total), 0),
    monthTax: monthSales.reduce((sum, sale) => sum + accountingValue(sale, sale.tax), 0),
    monthProfit: monthSales.reduce((sum, sale) => sum + saleProfitValue(sale, data.products), 0),
    pendingCount: pending.length,
    rejectedCount: rejected.length,
    lowStock,
    recentSales
  };
}

function isDateInRange(value: string, start: Date, end: Date) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date >= start && date <= end;
}

function buildSalesReport(data: AppData, periodType: string, year: string, month: string, semester: string, startDate: string, endDate: string, reportType = "tax", documentFilter = "all") {
  const range = getReportRange(periodType, Number(year), Number(month), Number(semester), startDate, endDate);
  const periodSales = data.sales
    .filter((sale) => {
      const createdAt = new Date(sale.createdAt);
      return createdAt >= range.start && createdAt <= range.end;
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const sales = periodSales.filter((sale) => {
    if (reportType === "tax") return isTaxableSale(sale);
    if (documentFilter === "factura") return isInvoiceSale(sale);
    if (documentFilter === "nota_credito") return isCreditNoteSale(sale);
    if (documentFilter === "nota_venta") return sale.documentType === "nota_venta";
    if (documentFilter === "proforma") return sale.documentType === "proforma";
    return true;
  });
  const taxableSales = sales.filter((sale) => isEffectiveReportSale(sale, reportType));
  const periodTaxDocuments = periodSales.filter(isTaxableSale);
  const periodInvoices = periodTaxDocuments.filter(isInvoiceSale);
  const periodCreditNotes = periodTaxDocuments.filter(isCreditNoteSale);
  const subtotal15 = taxableSales.reduce((sum, sale) => sum + accountingValue(sale, subtotalByRate(sale, 0.15)), 0);
  const subtotal0 = taxableSales.reduce((sum, sale) => sum + accountingValue(sale, subtotalByRate(sale, 0)), 0);
  const iva15 = taxableSales.reduce((sum, sale) => sum + accountingValue(sale, sale.tax), 0);
  const discount = taxableSales.reduce((sum, sale) => sum + accountingValue(sale, calculateTotalDiscount(sale.items)), 0);
  const subtotal = taxableSales.reduce((sum, sale) => sum + accountingValue(sale, sale.subtotal), 0);
  const total = taxableSales.reduce((sum, sale) => sum + accountingValue(sale, sale.total), 0);
  const cost = taxableSales.reduce((sum, sale) => sum + accountingValue(sale, saleCostValue(sale, data.products)), 0);
  const profit = taxableSales.reduce((sum, sale) => sum + saleProfitValue(sale, data.products), 0);
  const byPayment = taxableSales.reduce<Record<string, number>>((summary, sale) => {
    const key = sale.paymentMethod || "20";
    summary[key] = (summary[key] || 0) + accountingValue(sale, sale.total);
    return summary;
  }, {});
  const retentions = (data.receivedRetentions || []).filter((retention) => {
    const receivedAt = new Date(retention.receivedAt);
    return receivedAt >= range.start && receivedAt <= range.end;
  });
  const retentionIva = retentions.filter((retention) => retention.taxType === "IVA").reduce((sum, retention) => sum + retention.amount, 0);
  const retentionRenta = retentions.filter((retention) => retention.taxType === "RENTA").reduce((sum, retention) => sum + retention.amount, 0);
  const retentionTotal = retentionIva + retentionRenta;
  const iva104 = buildIva104Summary(periodInvoices, periodCreditNotes, retentionIva);

  return {
    label: range.label,
    reportType,
    documentFilter,
    sales,
    taxableSales,
    effectiveCount: taxableSales.length,
    authorizedCount: periodSales.filter(isTaxableSale).length,
    creditNoteCount: periodSales.filter((sale) => sale.documentType === "nota_credito" && sale.status === "AUTORIZADA").length,
    internalCount: periodSales.filter((sale) => sale.documentType === "nota_venta" && sale.status === "INTERNA").length,
    proformaCount: periodSales.filter((sale) => sale.documentType === "proforma" && sale.status === "PROFORMA").length,
    voidedCount: periodSales.filter((sale) => sale.status === "ANULADA").length,
    rejectedCount: periodSales.filter((sale) => sale.status === "RECHAZADA").length,
    pendingCount: periodSales.filter((sale) => !["AUTORIZADA", "ANULADA", "RECHAZADA", "INTERNA", "PROFORMA"].includes(sale.status)).length,
    subtotal15,
    subtotal0,
    iva15,
    discount,
    subtotal,
    cost,
    profit,
    total,
    retentions,
    retentionIva,
    retentionRenta,
    retentionTotal,
    netCollected: total - retentionTotal,
    iva104,
    byPayment
  };
}

function getReportRange(periodType: string, year: number, month: number, semester: number, startDate: string, endDate: string) {
  if (periodType === "custom") {
    const start = parseInputDate(startDate, "start") || new Date(year, 0, 1, 0, 0, 0, 0);
    const end = parseInputDate(endDate, "end") || new Date(year, 11, 31, 23, 59, 59, 999);
    return {
      label: `Desde ${formatShortDate(start.toISOString())} hasta ${formatShortDate(end.toISOString())}`,
      start,
      end
    };
  }

  if (periodType === "annual") {
    return {
      label: `Anual ${year}`,
      start: new Date(year, 0, 1, 0, 0, 0, 0),
      end: new Date(year, 11, 31, 23, 59, 59, 999)
    };
  }

  if (periodType === "semester") {
    const startMonth = semester === 2 ? 6 : 0;
    const endMonth = semester === 2 ? 11 : 5;
    return {
      label: `${semester === 2 ? "Julio - Diciembre" : "Enero - Junio"} ${year}`,
      start: new Date(year, startMonth, 1, 0, 0, 0, 0),
      end: new Date(year, endMonth + 1, 0, 23, 59, 59, 999)
    };
  }

  const monthIndex = Math.max(0, Math.min(11, month - 1));
  const monthLabel = monthOptions[monthIndex]?.label || "Enero";
  return {
    label: `${monthLabel} ${year}`,
    start: new Date(year, monthIndex, 1, 0, 0, 0, 0),
    end: new Date(year, monthIndex + 1, 0, 23, 59, 59, 999)
  };
}

function parseInputDate(value: string, boundary: "start" | "end") {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), boundary === "start" ? 0 : 23, boundary === "start" ? 0 : 59, boundary === "start" ? 0 : 59, boundary === "start" ? 0 : 999);
}

function subtotalByRate(sale: Sale, rate: number) {
  return sale.items.filter((item) => item.ivaRate === rate).reduce((sum, item) => sum + calculateLineSubtotal(item), 0);
}

function subtotalByPositiveRate(sale: Sale) {
  return sale.items.filter((item) => item.ivaRate > 0).reduce((sum, item) => sum + calculateLineSubtotal(item), 0);
}

function buildIva104Summary(invoices: Sale[], creditNotes: Sale[], retentionIva: number) {
  const salesVatGross = invoices.reduce((sum, sale) => sum + subtotalByPositiveRate(sale), 0);
  const salesZeroGross = invoices.reduce((sum, sale) => sum + subtotalByRate(sale, 0), 0);
  const creditVat = creditNotes.reduce((sum, sale) => sum + subtotalByPositiveRate(sale), 0);
  const creditZero = creditNotes.reduce((sum, sale) => sum + subtotalByRate(sale, 0), 0);
  const salesVatNet = Math.max(0, salesVatGross - creditVat);
  const salesZeroNet = Math.max(0, salesZeroGross - creditZero);
  const ivaGeneratedGross = invoices.reduce((sum, sale) => sum + sale.tax, 0);
  const ivaCreditNotes = creditNotes.reduce((sum, sale) => sum + sale.tax, 0);
  const ivaGeneratedNet = Math.max(0, ivaGeneratedGross - ivaCreditNotes);
  const totalGross = invoices.reduce((sum, sale) => sum + sale.total, 0);
  const totalCreditNotes = creditNotes.reduce((sum, sale) => sum + sale.total, 0);
  const totalNet = Math.max(0, totalGross - totalCreditNotes);
  const estimatedIvaPayable = Math.max(0, ivaGeneratedNet - retentionIva);

  return {
    salesVatGross,
    salesVatNet,
    salesZeroGross,
    salesZeroNet,
    creditVat,
    creditZero,
    ivaGeneratedGross,
    ivaCreditNotes,
    ivaGeneratedNet,
    retentionIva,
    estimatedIvaPayable,
    totalGross,
    totalCreditNotes,
    totalNet
  };
}

function isTaxableSale(sale: Sale) {
  return (isInvoiceSale(sale) || isCreditNoteSale(sale)) && sale.status === "AUTORIZADA";
}

function isEffectiveReportSale(sale: Sale, reportType: string) {
  if (reportType === "tax") return isTaxableSale(sale);
  return sale.status === "AUTORIZADA" || sale.status === "INTERNA";
}

function accountingMoney(sale: Sale, value: number) {
  if (!(sale.status === "AUTORIZADA" || sale.status === "INTERNA")) return "0.00";
  return `${isCreditNoteSale(sale) ? "-" : ""}${money(value)}`;
}

function accountingValue(sale: Sale, value: number) {
  if (!(sale.status === "AUTORIZADA" || sale.status === "INTERNA")) return 0;
  return isCreditNoteSale(sale) ? -value : value;
}

function saleCostValue(sale: Sale, products: Product[]) {
  const productMap = new Map(products.map((product) => [product.id, product]));
  return sale.items.reduce((sum, item) => {
    const cost = Number.isFinite(Number(item.cost)) ? Number(item.cost) : productCost(productMap.get(item.productId));
    return sum + item.quantity * cost;
  }, 0);
}

function saleProfitValue(sale: Sale, products: Product[]) {
  return accountingValue(sale, sale.subtotal) - accountingValue(sale, saleCostValue(sale, products));
}

function formatSalesReport(report: ReturnType<typeof buildSalesReport>) {
  const paymentLines = Object.entries(report.byPayment).map(([code, total]) => `${paymentLabel(code)}: $${money(total)}`);
  const invoiceLines = report.sales.map((sale) => `${sale.sequence} | ${sale.status} | ${formatShortDate(sale.createdAt)} | Base contable $${accountingMoney(sale, sale.subtotal)} | Desc. $${accountingMoney(sale, calculateTotalDiscount(sale.items))} | IVA $${accountingMoney(sale, sale.tax)} | Total contable $${accountingMoney(sale, sale.total)} | ${sale.authorizationNumber || sale.accessKey}${sale.voidReason ? ` | ${sale.voidReason}` : ""}${sale.sriMessage ? ` | ${shortText(sale.sriMessage, 120)}` : ""}`);

  return [
    "REPORTE CONTABLE DE VENTAS",
    `Periodo: ${report.label}`,
    `Tipo: ${report.reportType === "tax" ? "Tributario" : "Operativo"}`,
    `Documentos del periodo: ${report.sales.length}`,
    `Documentos con valor: ${report.effectiveCount}`,
    `Facturas autorizadas: ${report.authorizedCount}`,
    `Notas de credito: ${report.creditNoteCount}`,
    `Notas de venta: ${report.internalCount}`,
    `Proformas: ${report.proformaCount}`,
    `Anuladas: ${report.voidedCount}`,
    `Rechazadas: ${report.rejectedCount}`,
    "",
    "RESUMEN TRIBUTARIO",
    `Subtotal gravado 15%: $${money(report.subtotal15)}`,
    `Subtotal tarifa 0%: $${money(report.subtotal0)}`,
    `Total descuentos: $${money(report.discount)}`,
    "Subtotal no objeto de IVA: $0.00",
    "Subtotal exento de IVA: $0.00",
    `Total sin impuestos: $${money(report.subtotal)}`,
    `IVA causado: $${money(report.iva15)}`,
    `Total facturado: $${money(report.total)}`,
    `Retenciones IVA recibidas: $${money(report.retentionIva)}`,
    `Retenciones fuente recibidas: $${money(report.retentionRenta)}`,
    `Total retenciones recibidas: $${money(report.retentionTotal)}`,
    `Neto despues de retenciones: $${money(report.netCollected)}`,
    "",
    "RESUMEN IVA / FORMULARIO 104",
    `Ventas gravadas tarifa diferente de cero - bruto: $${money(report.iva104.salesVatGross)}`,
    `Notas de credito gravadas tarifa diferente de cero: $${money(report.iva104.creditVat)}`,
    `Ventas gravadas tarifa diferente de cero - neto: $${money(report.iva104.salesVatNet)}`,
    `Ventas tarifa 0% - bruto: $${money(report.iva104.salesZeroGross)}`,
    `Notas de credito tarifa 0%: $${money(report.iva104.creditZero)}`,
    `Ventas tarifa 0% - neto: $${money(report.iva104.salesZeroNet)}`,
    `IVA generado neto: $${money(report.iva104.ivaGeneratedNet)}`,
    `Retenciones IVA recibidas: $${money(report.iva104.retentionIva)}`,
    `IVA estimado a pagar sin compras/credito tributario: $${money(report.iva104.estimatedIvaPayable)}`,
    "Nota: no incluye compras, credito tributario anterior, activos fijos, importaciones, ajustes, intereses ni multas.",
    "",
    "FORMAS DE PAGO",
    ...(paymentLines.length ? paymentLines : ["Sin movimientos"]),
    "",
    "FACTURAS",
    ...(invoiceLines.length ? invoiceLines : ["Sin facturas en el periodo."])
  ].join("\n");
}

function formatIva104Report(report: ReturnType<typeof buildSalesReport>) {
  return [
    "RESUMEN IVA / FORMULARIO 104",
    `Periodo: ${report.label}`,
    "",
    "VENTAS Y NOTAS DE CREDITO",
    `Ventas tarifa diferente de cero - valor bruto: $${money(report.iva104.salesVatGross)}`,
    `Notas de credito tarifa diferente de cero: $${money(report.iva104.creditVat)}`,
    `Ventas tarifa diferente de cero - valor neto: $${money(report.iva104.salesVatNet)}`,
    `Impuesto generado bruto: $${money(report.iva104.ivaGeneratedGross)}`,
    `IVA notas de credito: $${money(report.iva104.ivaCreditNotes)}`,
    `Impuesto generado neto: $${money(report.iva104.ivaGeneratedNet)}`,
    "",
    `Ventas tarifa 0% - valor bruto: $${money(report.iva104.salesZeroGross)}`,
    `Notas de credito tarifa 0%: $${money(report.iva104.creditZero)}`,
    `Ventas tarifa 0% - valor neto: $${money(report.iva104.salesZeroNet)}`,
    "",
    "RETENCIONES Y LIQUIDACION ESTIMADA",
    `Retenciones IVA recibidas: $${money(report.iva104.retentionIva)}`,
    `IVA estimado a pagar: $${money(report.iva104.estimatedIvaPayable)}`,
    `Total ventas netas con IVA incluido: $${money(report.iva104.totalNet)}`,
    "",
    "PENDIENTE PARA 104 FINAL",
    "No incluye compras/adquisiciones, credito tributario anterior, activos fijos, importaciones, ajustes, intereses ni multas."
  ].join("\n");
}

function buildReportHtml(report: ReturnType<typeof buildSalesReport>, data: AppData) {
  const rows = report.sales
    .map((sale) => {
      const client = data.clients.find((item) => item.id === sale.clientId);
      return `
        <tr>
          <td>${escapeHtml(formatShortDate(sale.createdAt))}</td>
          <td>${escapeHtml(documentTypeLabel(sale))}</td>
          <td>${escapeHtml(documentNumber(sale, data.issuer))}</td>
          <td>${escapeHtml(client?.name || "Cliente")}</td>
          <td>${escapeHtml(sale.status)}</td>
          <td>${escapeHtml(sale.authorizationNumber || sale.accessKey)}</td>
          <td class="right">${accountingMoney(sale, sale.subtotal)}</td>
          <td class="right">${accountingMoney(sale, calculateTotalDiscount(sale.items))}</td>
          <td class="right">${accountingMoney(sale, sale.tax)}</td>
          <td class="right">${accountingMoney(sale, sale.total)}</td>
          <td>${escapeHtml(sale.voidReason || shortText(sale.sriMessage || "", 100))}</td>
        </tr>`;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 12mm; }
    body { font-family: Arial, sans-serif; color: #111827; font-size: 11px; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    h2 { font-size: 14px; margin: 18px 0 8px; }
    .muted { color: #4b5563; margin-bottom: 12px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 12px 0; }
    .box { border: 1px solid #cbd5e1; padding: 8px; border-radius: 4px; }
    .label { color: #64748b; font-size: 9px; font-weight: 700; text-transform: uppercase; }
    .value { font-size: 15px; font-weight: 800; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #cbd5e1; padding: 5px; vertical-align: top; }
    th { background: #f1f5f9; text-align: left; }
    .right { text-align: right; }
  </style>
</head>
<body>
  <h1>Reporte contable de ventas</h1>
  <div class="muted">${escapeHtml(data.issuer.businessName)} | ${escapeHtml(report.label)}</div>
  <div class="grid">
    <div class="box"><div class="label">Tipo reporte</div><div class="value">${report.reportType === "tax" ? "Tributario" : "Operativo"}</div></div>
    <div class="box"><div class="label">Documentos</div><div class="value">${report.sales.length}</div></div>
    <div class="box"><div class="label">Con valor</div><div class="value">${report.effectiveCount}</div></div>
    <div class="box"><div class="label">Autorizadas</div><div class="value">${report.authorizedCount}</div></div>
    <div class="box"><div class="label">Anuladas</div><div class="value">${report.voidedCount}</div></div>
    <div class="box"><div class="label">Subtotal 15%</div><div class="value">$${money(report.subtotal15)}</div></div>
    <div class="box"><div class="label">Subtotal 0%</div><div class="value">$${money(report.subtotal0)}</div></div>
    <div class="box"><div class="label">Descuentos</div><div class="value">$${money(report.discount)}</div></div>
    <div class="box"><div class="label">IVA 15%</div><div class="value">$${money(report.iva15)}</div></div>
    <div class="box"><div class="label">Total sin impuestos</div><div class="value">$${money(report.subtotal)}</div></div>
    <div class="box"><div class="label">Total facturado</div><div class="value">$${money(report.total)}</div></div>
    <div class="box"><div class="label">Ret. IVA recibida</div><div class="value">$${money(report.retentionIva)}</div></div>
    <div class="box"><div class="label">Ret. fuente recibida</div><div class="value">$${money(report.retentionRenta)}</div></div>
    <div class="box"><div class="label">Neto estimado</div><div class="value">$${money(report.netCollected)}</div></div>
    <div class="box"><div class="label">104 gravado neto</div><div class="value">$${money(report.iva104.salesVatNet)}</div></div>
    <div class="box"><div class="label">104 IVA neto</div><div class="value">$${money(report.iva104.ivaGeneratedNet)}</div></div>
    <div class="box"><div class="label">104 IVA a pagar est.</div><div class="value">$${money(report.iva104.estimatedIvaPayable)}</div></div>
  </div>
  <h2>Secuencias del periodo</h2>
  <table>
    <thead>
      <tr><th>Fecha</th><th>Tipo</th><th>Documento</th><th>Cliente</th><th>Estado</th><th>Autorizacion / clave</th><th>Base</th><th>Descuento</th><th>IVA</th><th>Total</th><th>Observacion</th></tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="11">Sin documentos en el periodo.</td></tr>`}</tbody>
  </table>
</body>
</html>`;
}

function buildMobileReportHtml(report: ReturnType<typeof buildSalesReport>, data: AppData) {
  const paymentRows = Object.entries(report.byPayment)
    .map(([code, total]) => `<tr><td>${escapeHtml(paymentLabel(code))}</td><td class="right">$${money(total)}</td></tr>`)
    .join("");
  const documentRows = report.sales.map((sale) => {
    const client = data.clients.find((item) => item.id === sale.clientId);
    return `
      <tr>
        <td>${escapeHtml(formatShortDate(sale.createdAt))}</td>
        <td>${escapeHtml(documentTypeLabel(sale))}</td>
        <td>${escapeHtml(documentNumber(sale, data.issuer))}</td>
        <td>${escapeHtml(client?.name || "")}</td>
        <td>${escapeHtml(sale.status)}</td>
        <td class="right">${accountingMoney(sale, sale.subtotal)}</td>
        <td class="right">${accountingMoney(sale, sale.tax)}</td>
        <td class="right">${accountingMoney(sale, sale.total)}</td>
      </tr>`;
  }).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { margin: 0; background: #f5f7fb; color: #111827; font-family: Arial, sans-serif; font-size: 13px; }
    header { position: sticky; top: 0; background: #0f766e; color: white; padding: 14px 16px; z-index: 2; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .meta { opacity: .9; font-size: 12px; }
    main { padding: 12px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .card { background: white; border: 1px solid #dbe4ee; border-radius: 8px; padding: 10px; }
    .label { color: #64748b; font-size: 10px; font-weight: 800; text-transform: uppercase; }
    .value { color: #0f172a; font-size: 17px; font-weight: 900; margin-top: 4px; }
    h2 { font-size: 14px; margin: 18px 0 8px; }
    .table-wrap { overflow-x: auto; background: white; border: 1px solid #dbe4ee; border-radius: 8px; }
    table { min-width: 760px; width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #e5edf5; padding: 8px; white-space: nowrap; text-align: left; }
    th { background: #eef6f5; color: #0f766e; font-size: 11px; text-transform: uppercase; }
    .right { text-align: right; }
    .note { color: #475569; font-size: 12px; margin-top: 10px; line-height: 1.4; }
  </style>
</head>
<body>
  <header>
    <h1>Reporte contable de ventas</h1>
    <div class="meta">${escapeHtml(data.issuer.businessName)} | ${escapeHtml(report.label)} | ${report.reportType === "tax" ? "Tributario" : "Operativo"}</div>
  </header>
  <main>
    <section class="grid">
      <div class="card"><div class="label">Documentos</div><div class="value">${report.sales.length}</div></div>
      <div class="card"><div class="label">Con valor</div><div class="value">${report.effectiveCount}</div></div>
      <div class="card"><div class="label">Subtotal</div><div class="value">$${money(report.subtotal)}</div></div>
      <div class="card"><div class="label">IVA</div><div class="value">$${money(report.iva15)}</div></div>
      <div class="card"><div class="label">Total</div><div class="value">$${money(report.total)}</div></div>
      <div class="card"><div class="label">Utilidad</div><div class="value">$${money(report.profit)}</div></div>
      <div class="card"><div class="label">Retenciones</div><div class="value">$${money(report.retentionTotal)}</div></div>
      <div class="card"><div class="label">Neto ret.</div><div class="value">$${money(report.netCollected)}</div></div>
    </section>
    <h2>Formas de pago</h2>
    <div class="table-wrap"><table><thead><tr><th>Forma</th><th class="right">Total</th></tr></thead><tbody>${paymentRows || `<tr><td colspan="2">Sin movimientos</td></tr>`}</tbody></table></div>
    <h2>Documentos del periodo</h2>
    <div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Documento</th><th>Cliente</th><th>Estado</th><th class="right">Base</th><th class="right">IVA</th><th class="right">Total</th></tr></thead><tbody>${documentRows || `<tr><td colspan="8">Sin documentos.</td></tr>`}</tbody></table></div>
    <p class="note">Vista optimizada para movil. Para trabajo contable en PC use la descarga Excel desde web.</p>
  </main>
</body>
</html>`;
}

function buildReportExcelHtml(report: ReturnType<typeof buildSalesReport>, data: AppData) {
  const invoiceRows = report.sales
    .map((sale) => {
      const client = data.clients.find((item) => item.id === sale.clientId);
      const observation = [
        isCreditNoteSale(sale) ? "Nota de credito: valores negativos para reversar ventas/IVA" : "",
        sale.voidReason || shortText(sale.sriMessage || "", 140)
      ].filter(Boolean).join(" | ");
      return `
        <tr>
          <td>${escapeHtml(formatShortDate(sale.createdAt))}</td>
          <td>${escapeHtml(documentTypeLabel(sale))}</td>
          <td>${escapeHtml(documentNumber(sale, data.issuer))}</td>
          <td>${escapeHtml(client?.name || "")}</td>
          <td style="mso-number-format:'\\@';">${escapeHtml(client?.identification || "")}</td>
          <td>${escapeHtml(sale.status)}</td>
          <td style="mso-number-format:'\\@';">${escapeHtml(sale.authorizationNumber || sale.accessKey || "Interno")}</td>
          <td class="number">${accountingMoney(sale, subtotalByRate(sale, 0.15))}</td>
          <td class="number">${accountingMoney(sale, subtotalByRate(sale, 0))}</td>
          <td class="number">${accountingMoney(sale, calculateTotalDiscount(sale.items))}</td>
          <td class="number">${accountingMoney(sale, sale.subtotal)}</td>
          <td class="number">${accountingMoney(sale, sale.tax)}</td>
          <td class="number total">${accountingMoney(sale, sale.total)}</td>
          <td>${escapeHtml(paymentLabel(sale.paymentMethod || "20"))}</td>
          <td>${escapeHtml(observation)}</td>
        </tr>`;
    })
    .join("");
  const paymentRows = Object.entries(report.byPayment)
    .map(
      ([code, total]) => `
        <tr>
          <td colspan="3">${escapeHtml(paymentLabel(code))}</td>
          <td class="number total">${money(total)}</td>
        </tr>`
    )
    .join("");

  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, sans-serif; color: #111827; }
    table { border-collapse: collapse; width: 100%; }
    .title { font-size: 22px; font-weight: 800; color: #0f766e; }
    .subtitle { color: #475569; font-size: 12px; }
    .spacer td { height: 10px; border: none; }
    th { background: #0f766e; color: #ffffff; font-weight: 700; text-align: center; }
    td, th { border: 1px solid #cbd5e1; padding: 6px; font-size: 11px; vertical-align: middle; }
    .summary-label { background: #f1f5f9; font-weight: 700; }
    .summary-value { font-weight: 800; text-align: right; }
    .section { background: #e0f2fe; color: #075985; font-weight: 800; font-size: 13px; }
    .number { text-align: right; mso-number-format:"0.00"; }
    .total { font-weight: 800; }
  </style>
</head>
<body>
  <table>
    <tr><td colspan="15" class="title">Reporte contable de ventas</td></tr>
    <tr><td colspan="15" class="subtitle">${escapeHtml(data.issuer.businessName)} | RUC ${escapeHtml(data.issuer.ruc)} | ${escapeHtml(report.label)} | ${report.reportType === "tax" ? "Tributario" : "Operativo"}</td></tr>
    <tr class="spacer"><td colspan="15"></td></tr>
    <tr><td colspan="15" class="section">Resumen</td></tr>
    <tr>
      <td class="summary-label">Documentos periodo</td><td class="summary-value">${report.sales.length}</td>
      <td class="summary-label">Con valor</td><td class="summary-value">${report.effectiveCount}</td>
      <td class="summary-label">Facturas autorizadas</td><td class="summary-value">${report.authorizedCount}</td>
      <td class="summary-label">Notas venta</td><td class="summary-value">${report.internalCount}</td>
      <td class="summary-label">Proformas</td><td class="summary-value">${report.proformaCount}</td>
    </tr>
    <tr>
      <td class="summary-label">Anuladas</td><td class="summary-value">${report.voidedCount}</td>
      <td class="summary-label">Rechazadas</td><td class="summary-value">${report.rejectedCount}</td>
      <td class="summary-label">Subtotal 15%</td><td class="summary-value">${money(report.subtotal15)}</td>
      <td class="summary-label">Subtotal 0%</td><td class="summary-value">${money(report.subtotal0)}</td>
      <td class="summary-label">Descuentos</td><td class="summary-value">${money(report.discount)}</td>
    </tr>
    <tr>
      <td class="summary-label">Subtotal</td><td class="summary-value">${money(report.subtotal)}</td>
      <td class="summary-value">IVA ${money(report.iva15)} | Total ${money(report.total)}</td>
      <td class="summary-label">Ret. IVA</td><td class="summary-value">${money(report.retentionIva)}</td>
      <td class="summary-label">Ret. fuente</td><td class="summary-value">${money(report.retentionRenta)}</td>
      <td class="summary-label">Neto</td><td class="summary-value">${money(report.netCollected)}</td>
    </tr>
    <tr>
      <td class="summary-label">104 ventas gravadas netas</td><td class="summary-value">${money(report.iva104.salesVatNet)}</td>
      <td class="summary-label">104 ventas 0% netas</td><td class="summary-value">${money(report.iva104.salesZeroNet)}</td>
      <td class="summary-label">104 IVA generado neto</td><td class="summary-value">${money(report.iva104.ivaGeneratedNet)}</td>
      <td class="summary-label">104 IVA a pagar est.</td><td class="summary-value">${money(report.iva104.estimatedIvaPayable)}</td>
    </tr>
    <tr class="spacer"><td colspan="15"></td></tr>
    <tr><td colspan="15" class="section">Documentos del periodo</td></tr>
    <tr>
      <th>Fecha</th>
      <th>Tipo</th>
      <th>Documento</th>
      <th>Cliente</th>
      <th>Identificacion</th>
      <th>Estado</th>
      <th>Autorizacion</th>
      <th>Subtotal 15%</th>
      <th>Subtotal 0%</th>
      <th>Descuento</th>
      <th>Subtotal</th>
      <th>IVA</th>
      <th>Total</th>
      <th>Forma pago</th>
      <th>Observacion</th>
    </tr>
    ${invoiceRows || `<tr><td colspan="15">Sin documentos en el periodo.</td></tr>`}
    <tr class="spacer"><td colspan="15"></td></tr>
    <tr><td colspan="4" class="section">Formas de pago con valor</td><td colspan="11"></td></tr>
    <tr><th colspan="3">Forma de pago</th><th>Total</th><td colspan="11"></td></tr>
    ${paymentRows || `<tr><td colspan="4">Sin movimientos</td><td colspan="11"></td></tr>`}
  </table>
</body>
</html>`;
}

function buildReportCsv(report: ReturnType<typeof buildSalesReport>, data: AppData) {
  const rows = [
    ["Reporte contable de ventas"],
    [data.issuer.businessName, `RUC ${data.issuer.ruc}`, report.label, report.reportType === "tax" ? "Tributario" : "Operativo"],
    [],
    ["Resumen"],
    ["Documentos periodo", report.sales.length],
    ["Con valor", report.effectiveCount],
    ["Facturas autorizadas", report.authorizedCount],
    ["Notas credito", report.creditNoteCount],
    ["Notas venta", report.internalCount],
    ["Proformas", report.proformaCount],
    ["Anuladas", report.voidedCount],
    ["Rechazadas", report.rejectedCount],
    ["Subtotal 15%", money(report.subtotal15)],
    ["Subtotal 0%", money(report.subtotal0)],
    ["Descuentos", money(report.discount)],
    ["Subtotal", money(report.subtotal)],
    ["IVA", money(report.iva15)],
    ["Total", money(report.total)],
    ["Ret. IVA", money(report.retentionIva)],
    ["Ret. fuente", money(report.retentionRenta)],
    ["Neto", money(report.netCollected)],
    ["104 ventas gravadas netas", money(report.iva104.salesVatNet)],
    ["104 ventas 0% netas", money(report.iva104.salesZeroNet)],
    ["104 IVA generado neto", money(report.iva104.ivaGeneratedNet)],
    ["104 IVA a pagar est.", money(report.iva104.estimatedIvaPayable)],
    [],
    ["Documentos del periodo"],
    ["Fecha", "Tipo", "Documento", "Cliente", "Identificacion", "Estado", "Autorizacion", "Subtotal 15%", "Subtotal 0%", "Descuento", "Subtotal", "IVA", "Total", "Forma pago", "Observacion"],
    ...report.sales.map((sale) => {
      const client = data.clients.find((item) => item.id === sale.clientId);
      const observation = [
        isCreditNoteSale(sale) ? "Nota de credito: valores negativos para reversar ventas/IVA" : "",
        sale.voidReason || shortText(sale.sriMessage || "", 140)
      ].filter(Boolean).join(" | ");

      return [
        formatShortDate(sale.createdAt),
        documentTypeLabel(sale),
        documentNumber(sale, data.issuer),
        client?.name || "",
        client?.identification || "",
        sale.status,
        sale.authorizationNumber || sale.accessKey || "Interno",
        accountingMoney(sale, subtotalByRate(sale, 0.15)),
        accountingMoney(sale, subtotalByRate(sale, 0)),
        accountingMoney(sale, calculateTotalDiscount(sale.items)),
        accountingMoney(sale, sale.subtotal),
        accountingMoney(sale, sale.tax),
        accountingMoney(sale, sale.total),
        paymentLabel(sale.paymentMethod || "20"),
        observation
      ];
    }),
    [],
    ["Formas de pago con valor"],
    ["Forma de pago", "Total"],
    ...Object.entries(report.byPayment).map(([code, total]) => [paymentLabel(code), money(total)])
  ];

  return rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
}

function csvCell(value: string | number) {
  const text = String(value ?? "");
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function paymentLabel(value: string) {
  return paymentOptions.find((option) => option.value === value)?.label || value;
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function toInputDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
}

function sanitizeFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "periodo";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showMessage(title: string, message: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.alert(`${title}\n\n${message}`);
    return;
  }

  Alert.alert(title, message);
}

function confirmAction(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: "Cancelar", style: "cancel" },
    { text: "Eliminar", style: "destructive", onPress: onConfirm }
  ]);
}

function formatSyncStatus(state: SyncState, data: AppData) {
  if (data.autoBackupEnabled === false) return "Sync manual";
  if ((data.pendingSync || []).length > 0) return `Pendientes por sincronizar: ${(data.pendingSync || []).length}`;
  if (state === "syncing") return "Sincronizando...";
  if (state === "pending") return "Pendiente de subir";
  if (state === "error") return `Sync error${data.autoBackupLastError ? `: ${shortText(data.autoBackupLastError, 70)}` : ""}`;
  return data.autoBackupLastAt ? `Sincronizado ${formatAuditDate(data.autoBackupLastAt)}` : "Sincronizado";
}

function resolveCompanyLogoUrl(logoUrl: string, backendUrl: string) {
  const value = String(logoUrl || "").trim();
  const base = String(backendUrl || "").trim().replace(/\/$/, "");
  if (!value) return "";
  if (value.startsWith("/")) return base ? `${base}${value}` : value;
  if (/^https?:\/\//i.test(value) && value.includes("/api/company/logo") && base) {
    try {
      const parsed = new URL(value);
      return `${base}${parsed.pathname}${parsed.search}`;
    } catch {
      return value;
    }
  }
  return value;
}

function DashboardView({ data, user, onNavigate }: { data: AppData; user: User; onNavigate: (tab: Tab) => void }) {
  const dashboard = useMemo(() => buildDashboard(data), [data]);
  const allowedTabs = tabsForRole(user.role);
  const primaryTab: Tab = allowedTabs.includes("ventas") ? "ventas" : allowedTabs.includes("caja") ? "caja" : "reportes";
  const licenseState = appLicenseStatus(data.license);
  const currentEstablishment = activeEstablishment(data.issuer);
  const planName = licensePlanOptions.find((option) => option.value === normalizeLicensePlanValue(data.license?.plan))?.label || "Demo";
  const maxPoints = maxEmissionPointsForLicense(data.license);
  const activePoints = data.issuer.establishments?.length || 1;
  const attentionCount = dashboard.pendingCount + dashboard.rejectedCount + dashboard.lowStock.length;
  const operationalTone = !licenseState.active ? "danger" : attentionCount > 0 ? "warning" : "success";

  return (
    <View style={styles.stack}>
      <View style={styles.dashboardHero}>
        <View style={styles.heroMain}>
          <View style={styles.heroTopLine}>
            <Text style={styles.dashboardEyebrow}>Panel de control</Text>
            <Text style={[styles.heroStatusPill, operationalTone === "danger" && styles.heroStatusDanger, operationalTone === "warning" && styles.heroStatusWarning]}>
              {operationalTone === "success" ? "Todo listo" : operationalTone === "warning" ? "Revisar" : "Licencia"}
            </Text>
          </View>
          <View style={styles.heroAmountRow}>
            <View style={styles.flex}>
              <Text style={styles.dashboardTitle}>${money(dashboard.todayTotal)}</Text>
              <Text style={styles.dashboardText}>{dashboard.todayCount} documento(s) efectivo(s) hoy</Text>
            </View>
            <Pressable style={styles.heroButton} onPress={() => onNavigate(primaryTab)}>
              <Text style={styles.heroButtonText}>{primaryTab === "ventas" ? "Nueva venta" : primaryTab === "caja" ? "Ir a caja" : "Reportes"}</Text>
            </Pressable>
          </View>
          <View style={styles.heroMetaGrid}>
            <View style={styles.heroMetaItem}>
              <Text style={styles.heroMetaValue}>{planName}</Text>
              <Text style={styles.heroMetaLabel}>Plan</Text>
            </View>
            <View style={styles.heroMetaItem}>
              <Text style={styles.heroMetaValue}>{currentEstablishment.establishment}-{currentEstablishment.emissionPoint}</Text>
              <Text style={styles.heroMetaLabel}>Punto activo</Text>
            </View>
          </View>
        </View>
      </View>

      <Section title="Estado de operacion">
        <View style={styles.operationGrid}>
          <OperationTile
            title="Licencia"
            value={licenseState.active ? `${Math.max(0, licenseState.daysLeft)} dias` : compactLicenseStatusLabel(data.license)}
            detail={licenseStatusLabel(data.license)}
            tone={licenseState.active ? "success" : "danger"}
          />
          <OperationTile
            title="Puntos de emision"
            value={maxPoints >= 999 ? `${activePoints} activos` : `${activePoints}/${maxPoints}`}
            detail={maxPoints >= 999 ? "Plan con multi punto habilitado" : "Limite controlado por plan"}
            tone={activePoints <= maxPoints ? "success" : "danger"}
          />
          <OperationTile
            title="Atencion"
            value={String(attentionCount)}
            detail={attentionCount === 0 ? "Sin pendientes criticos" : "Pendientes, rechazos o stock bajo"}
            tone={attentionCount === 0 ? "success" : "warning"}
          />
        </View>
      </Section>

      <Section title="Resumen rapido">
        <View style={styles.statsGrid}>
          <StatBox label="Ventas hoy" value={`$${money(dashboard.todayTotal)}`} tone="success" />
          <StatBox label="Ventas mes" value={`$${money(dashboard.monthTotal)}`} tone="info" />
          <StatBox label="IVA mes" value={`$${money(dashboard.monthTax)}`} />
          <StatBox label="Utilidad mes" value={`$${money(dashboard.monthProfit)}`} tone={dashboard.monthProfit >= 0 ? "success" : "warning"} />
          <StatBox label="Pendientes" value={String(dashboard.pendingCount)} tone={dashboard.pendingCount > 0 ? "warning" : "success"} />
          <StatBox label="Rechazadas" value={String(dashboard.rejectedCount)} tone={dashboard.rejectedCount > 0 ? "danger" : "success"} />
          <StatBox label="Stock bajo" value={String(dashboard.lowStock.length)} tone={dashboard.lowStock.length > 0 ? "warning" : "success"} />
        </View>
      </Section>

      <Section title="Accesos">
        <View style={styles.quickGrid}>
          {allowedTabs.includes("ventas") ? <QuickAction label="Vender" onPress={() => onNavigate("ventas")} /> : null}
          {allowedTabs.includes("clientes") ? <QuickAction label="Clientes" onPress={() => onNavigate("clientes")} /> : null}
          {allowedTabs.includes("productos") ? <QuickAction label="Productos" onPress={() => onNavigate("productos")} /> : null}
          {allowedTabs.includes("caja") ? <QuickAction label="Caja" onPress={() => onNavigate("caja")} /> : null}
          {allowedTabs.includes("reportes") ? <QuickAction label="Reportes" onPress={() => onNavigate("reportes")} /> : null}
        </View>
      </Section>

      <Section title="Alertas">
        {dashboard.pendingCount > 0 ? <AlertRow title="Facturas por revisar" detail={`${dashboard.pendingCount} factura(s) no autorizada(s). Puede reintentarlas desde Ventas.`} tone="warning" /> : null}
        {dashboard.rejectedCount > 0 ? <AlertRow title="Facturas rechazadas" detail={`${dashboard.rejectedCount} factura(s) requieren correccion o reintento.`} tone="danger" /> : null}
        {dashboard.lowStock.length > 0 ? (
          dashboard.lowStock.slice(0, 5).map((product) => <AlertRow key={product.id} title={product.name} detail={`Stock actual: ${product.stock} | minimo ${productMinStock(product)}`} tone={product.stock <= 0 ? "danger" : "warning"} />)
        ) : (
          <Empty text="Sin alertas importantes por ahora." />
        )}
      </Section>

      <Section title="Ultimos documentos">
        {dashboard.recentSales.length === 0 ? <Empty text="Aun no hay facturas emitidas." /> : null}
        {dashboard.recentSales.map((sale) => {
          const client = data.clients.find((item) => item.id === sale.clientId);
          return (
            <ListItem
              key={sale.id}
              title={`${documentNumber(sale, data.issuer)} - ${client?.name ?? "Cliente"}`}
              meta={`${formatShortDate(sale.createdAt)} | ${documentTypeLabel(sale)} | $${money(sale.total)} | Util. $${money(saleProfitValue(sale, data.products))} | ${sale.authorizationNumber || sale.accessKey || "Interno"}`}
              badge={sale.status}
              onOpen={() => onNavigate("ventas")}
              secondaryLabel={sale.documentType === "nota_venta" && sale.status === "INTERNA" ? "Ir a facturar" : "Ver"}
              onSecondary={() => onNavigate("ventas")}
            />
          );
        })}
      </Section>
    </View>
  );
}

function CashClosingView({ data, user, backendToken, persist }: { data: AppData; user: User; backendToken: string; persist: (data: AppData) => Promise<void> }) {
  const [closingDate, setClosingDate] = useState(toInputDate(new Date()));
  const [cashCountedText, setCashCountedText] = useState("");
  const [notes, setNotes] = useState("");
  const [visibleClosingCount, setVisibleClosingCount] = useState(LIST_BATCH_SIZE);
  const summary = useMemo(() => buildCashClosingSummary(data, closingDate), [data, closingDate]);
  const cashCounted = roundMoney(parseDecimal(cashCountedText || "0"));
  const difference = roundMoney(cashCounted - summary.cashExpected);
  const currentEstablishment = activeEstablishment(data.issuer);
  const closings = [...(data.cashClosings || [])].filter((closing) => closingInActiveScope(closing, data)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const visibleClosings = closings.slice(0, visibleClosingCount);
  const existingClosing = closings.find((closing) => closing.date === closingDate);

  useEffect(() => {
    setCashCountedText(money(summary.cashExpected));
  }, [closingDate, summary.cashExpected]);

  const saveClosing = async () => {
    if (!Number.isFinite(cashCounted) || cashCounted < 0) {
      showMessage("Efectivo invalido", "Ingrese el efectivo contado en caja.");
      return;
    }

    const closing: CashClosing = {
      id: uid(),
      establishment: currentEstablishment.establishment,
      emissionPoint: currentEstablishment.emissionPoint,
      establishmentName: currentEstablishment.name,
      date: closingDate,
      startAt: summary.startAt,
      endAt: summary.endAt,
      userId: user.id,
      userName: user.name,
      documentCount: summary.documentCount,
      total: summary.total,
      cashExpected: summary.cashExpected,
      cashCounted,
      difference,
      byPayment: summary.byPayment,
      notes: notes.trim(),
      createdAt: new Date().toISOString()
    };

    const nextData = appendAudit({ ...data, cashClosings: [closing, ...(data.cashClosings || [])] }, user, "CASH_CLOSING_CREATED", "cash_closing", closing.id, `Cierre de caja ${closing.date}: total $${money(closing.total)}, diferencia $${money(closing.difference)}`, { date: closing.date, total: closing.total, difference: closing.difference });
    await persist(nextData);
    await syncPatchToBackend(data.backendUrl, backendToken, { baseData: data, cashClosings: [closing], auditLogs: nextData.auditLogs.slice(0, 1) }, "Cierre pendiente de sincronizar", nextData, persist);
    setNotes("");
    showMessage("Cierre guardado", "El cierre de caja quedo registrado y se sincronizara con la base de datos.");
  };

  return (
    <View style={styles.stack}>
      <Section title="Cierre de caja">
        <Text style={styles.inlineInfo}>Establecimiento: {currentEstablishment.name} {currentEstablishment.establishment}-{currentEstablishment.emissionPoint}</Text>
        <CalendarDateInput label="Fecha de cierre" value={closingDate} onChange={setClosingDate} />
        {existingClosing ? <Text style={styles.inlineInfo}>Ya existe un cierre para esta fecha. Puede guardar otro si necesita dejar una correccion auditada.</Text> : null}
        <View style={styles.statsGrid}>
          <StatBox label="Documentos" value={String(summary.documentCount)} />
          <StatBox label="Total ventas" value={`$${money(summary.total)}`} />
          <StatBox label="Efectivo esperado" value={`$${money(summary.cashExpected)}`} />
          <StatBox label="Efectivo contado" value={`$${money(cashCounted)}`} />
          <StatBox label="Diferencia" value={`$${money(difference)}`} />
          <StatBox label="Pagos" value={String(Object.keys(summary.byPayment).length)} />
        </View>
        <Input label="Efectivo contado" value={cashCountedText} onChangeText={setCashCountedText} keyboardType="decimal-pad" />
        <Input label="Notas del cierre" value={notes} onChangeText={setNotes} multiline />
        <PrimaryButton label="Guardar cierre de caja" onPress={saveClosing} />
      </Section>

      <Section title="Formas de pago del dia">
        {Object.keys(summary.byPayment).length === 0 ? <Empty text="No hay movimientos con valor para esta fecha." /> : null}
        {Object.entries(summary.byPayment).map(([code, total]) => (
          <ReportRow key={code} label={paymentLabel(code)} value={`$${money(total)}`} strong={code === "01"} />
        ))}
      </Section>

      <Section title="Cierres guardados">
        {visibleClosings.length === 0 ? <Empty text="Aun no hay cierres de caja." /> : null}
        {visibleClosings.map((closing) => (
          <ListItem
            key={closing.id}
            title={`${formatShortDate(closing.createdAt)} - ${closing.userName}`}
            meta={`Fecha ${closing.date} | Docs ${closing.documentCount} | Total $${money(closing.total)} | Efectivo $${money(closing.cashCounted)} | Dif. $${money(closing.difference)}${closing.notes ? ` | ${closing.notes}` : ""}`}
            badge={closing.difference === 0 ? "CUADRADO" : "DIFERENCIA"}
          />
        ))}
        {visibleClosings.length < closings.length ? <LoadMoreButton label="Cargar mas cierres" onPress={() => setVisibleClosingCount((count) => count + LIST_BATCH_SIZE)} /> : null}
      </Section>
    </View>
  );
}

function buildCashClosingSummary(data: AppData, closingDate: string) {
  const start = parseInputDate(closingDate, "start") || new Date();
  const end = parseInputDate(closingDate, "end") || new Date();
  const report = buildSalesReport(scopedReportData(data), "custom", String(start.getFullYear()), String(start.getMonth() + 1), "1", closingDate, closingDate, "operational", "all");

  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    documentCount: report.effectiveCount,
    total: report.total,
    cashExpected: report.byPayment["01"] || 0,
    byPayment: report.byPayment
  };
}

function QuickAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.quickAction} onPress={onPress}>
      <Text style={styles.quickActionText}>{label}</Text>
    </Pressable>
  );
}

function AlertRow({ title, detail, tone }: { title: string; detail: string; tone: "warning" | "danger" }) {
  return (
    <View style={[styles.alertRow, tone === "danger" ? styles.alertDanger : styles.alertWarning]}>
      <Text style={[styles.alertTitle, tone === "danger" ? styles.alertDangerText : styles.alertWarningText]}>{title}</Text>
      <Text style={[styles.alertDetail, tone === "danger" ? styles.alertDangerText : styles.alertWarningText]}>{detail}</Text>
    </View>
  );
}

function createInventoryMovement(product: Product, type: InventoryMovementType, quantity: number, stockAfter: number, reason: string, userId: string, stockBefore = product.stock, reference?: string): InventoryMovement {
  return {
    id: uid(),
    productId: product.id,
    productName: product.name,
    type,
    quantity,
    stockBefore,
    stockAfter,
    reason,
    reference,
    userId,
    createdAt: new Date().toISOString()
  };
}

function appendAudit(data: AppData, user: User | undefined, event: string, entity: string, entityId: string | undefined, summary: string, metadata?: Record<string, unknown>): AppData {
  const log: AuditLog = {
    id: uid(),
    event,
    entity,
    entityId,
    summary,
    userId: user?.id,
    userName: user?.name,
    createdAt: new Date().toISOString(),
    metadata
  };

  return {
    ...data,
    auditLogs: [log, ...(data.auditLogs || [])].slice(0, AUDIT_LOG_LIMIT)
  };
}

type IncrementalPatch = Partial<AppData> & { baseData: AppData; deletions?: Partial<Record<keyof AppData, string[]>> };

async function syncPatchToBackend(backendUrl: string, backendToken: string, patch: IncrementalPatch, pendingTitle = "Cambio pendiente de sincronizar", localData?: AppData, persist?: (data: AppData) => Promise<void>) {
  try {
    await mergeBackendData(backendUrl, patch, backendToken);
  } catch (error) {
    const message = userFriendlyActionError(error, "sync");
    if (localData && persist) {
      await enqueuePendingSync(localData, persist, patch, pendingTitle, message);
    }
    showMessage(pendingTitle, message);
  }
}

async function syncSalePatchToBackend(backendUrl: string, backendToken: string, patch: IncrementalPatch, localData?: AppData, persist?: (data: AppData) => Promise<void>) {
  await syncPatchToBackend(backendUrl, backendToken, patch, "Documento pendiente de sincronizar", localData, persist);
}

async function enqueuePendingSync(localData: AppData, persist: (data: AppData) => Promise<void>, patch: IncrementalPatch, title: string, errorMessage: string) {
  const pending: PendingSyncItem = {
    id: uid(),
    createdAt: new Date().toISOString(),
    attempts: 0,
    title,
    lastError: shortText(errorMessage, 180),
    patch
  };
  await persist({
    ...localData,
    pendingSync: [pending, ...(localData.pendingSync || [])].slice(0, 100),
    autoBackupLastError: `${title}: ${shortText(errorMessage, 140)}`
  });
}

function ClientsView({ data, user, backendToken, getBackendToken, persist }: { data: AppData; user: User; backendToken: string; getBackendToken: (backendUrl: string) => Promise<string>; persist: (data: AppData) => Promise<void> }) {
  const emptyForm = { name: "", identification: "", email: "", phone: "", address: "", identificationType: "05" as Client["identificationType"] };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [visibleClientCount, setVisibleClientCount] = useState(LIST_BATCH_SIZE);
  const [lookingUpClient, setLookingUpClient] = useState(false);
  const filteredClients = useMemo(() => {
    const search = clientSearch.trim().toLowerCase();
    if (!search) return data.clients;
    return data.clients.filter((client) =>
      [client.name, client.identification, client.email, client.phone].some((value) => value.toLowerCase().includes(search))
    );
  }, [clientSearch, data.clients]);
  const visibleClients = filteredClients.slice(0, visibleClientCount);
  const canDelete = canDeleteCatalog(user.role);
  const canEdit = canEditCatalog(user.role);

  useEffect(() => {
    setVisibleClientCount(LIST_BATCH_SIZE);
  }, [clientSearch]);

  const lookupClientIdentification = async () => {
    const identification = normalizeClientIdentification(form.identification);
    if (!identification) {
      Alert.alert("Identificacion requerida", "Ingrese una cedula o RUC para consultar.");
      return;
    }
    const existingClient = data.clients.find((client) => normalizeClientIdentification(client.identification) === identification);
    if (existingClient) {
      setEditingId(existingClient.id);
      setForm({
        name: existingClient.name,
        identification: existingClient.identification,
        email: existingClient.email,
        phone: existingClient.phone || "",
        address: existingClient.address,
        identificationType: existingClient.identificationType
      });
      setClientSearch(existingClient.identification);
      Alert.alert("Cliente ya existe", `Se cargo el cliente guardado: ${existingClient.name}.`);
      return;
    }
    setLookingUpClient(true);
    try {
      const token = backendToken || await getBackendToken(data.backendUrl);
      if (!token) {
        Alert.alert("Sesion requerida", "Inicie sesion con conexion al servidor para consultar cedula o RUC.");
        return;
      }
      const result = await lookupIdentityData(data.backendUrl, identification, token);
      setForm((current) => ({
        ...current,
        identification: result.identification || identification,
        identificationType: (result.identificationType || (identification.length === 13 ? "04" : "05")) as Client["identificationType"],
        name: result.name || result.businessName || current.name,
        address: result.address || current.address
      }));
      Alert.alert("Datos encontrados", `${result.name || result.businessName}\n${result.status ? `Estado: ${result.status}` : ""}`.trim());
    } catch (error) {
      Alert.alert("No se pudo consultar", error instanceof Error ? error.message : "Intente nuevamente.");
    } finally {
      setLookingUpClient(false);
    }
  };

  const save = async () => {
    if (!canEdit) {
      Alert.alert("Acceso restringido", "Su usuario no tiene permiso para modificar clientes.");
      return;
    }

    const clientData = {
      ...form,
      name: form.name.trim(),
      identification: normalizeClientIdentification(form.identification),
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      updatedAt: new Date().toISOString()
    };

    if (!clientData.name || !clientData.identification) {
      Alert.alert("Datos incompletos", "Ingrese nombre e identificacion.");
      return;
    }
     
    const duplicate = findDuplicateClient(data.clients, clientData.identification, editingId);
    if (duplicate) {
      Alert.alert("Cliente duplicado", `Ya existe un cliente con esa identificacion: ${duplicate.name}.`);
      return;
    }

    if (editingId) {
      const updatedClient = { ...data.clients.find((client) => client.id === editingId), ...clientData, id: editingId } as Client;
      const nextData = appendAudit({ ...data, clients: data.clients.map((client) => (client.id === editingId ? updatedClient : client)) }, user, "CLIENT_UPDATED", "client", editingId, `Cliente actualizado: ${clientData.name}`);
      await persist(nextData);
      await syncPatchToBackend(data.backendUrl, backendToken, { baseData: data, clients: [updatedClient], auditLogs: nextData.auditLogs.slice(0, 1) }, "Cliente pendiente de sincronizar", nextData, persist);
      showMessage("Cliente actualizado", "Los datos del cliente se editaron con exito.");
    } else {
      const client = { id: uid(), ...clientData };
      const nextData = appendAudit({ ...data, clients: [client, ...data.clients] }, user, "CLIENT_CREATED", "client", client.id, `Cliente creado: ${client.name}`);
      await persist(nextData);
      await syncPatchToBackend(data.backendUrl, backendToken, { baseData: data, clients: [client], auditLogs: nextData.auditLogs.slice(0, 1) }, "Cliente pendiente de sincronizar", nextData, persist);
      showMessage("Cliente guardado", "El cliente se guardo con exito.");
    }

    setEditingId("");
    setForm(emptyForm);
  };

  const edit = (client: Client) => {
    if (!canEdit) {
      Alert.alert("Acceso restringido", "Su usuario no tiene permiso para modificar clientes.");
      return;
    }

    setEditingId(client.id);
    setForm({
      name: client.name,
      identification: client.identification,
      email: client.email,
      phone: client.phone || "",
      address: client.address,
      identificationType: client.identificationType
    });
  };

  return (
    <View style={styles.stack}>
      {canEdit ? (
      <Section title={editingId ? "Editar cliente" : "Nuevo cliente"}>
      <Input label="Nombre / razon social" value={form.name} onChangeText={(name) => setForm({ ...form, name })} />
      <Input
        label="Identificacion"
        value={form.identification}
        onChangeText={(identification) => setForm({ ...form, identification })}
        keyboardType="number-pad"
        rightElement={<InlineInputButton label={lookingUpClient ? "..." : "Consultar"} onPress={() => { void lookupClientIdentification(); }} />}
      />
      <Select
        label="Tipo"
        value={form.identificationType}
        onChange={(identificationType) => setForm({ ...form, identificationType: identificationType as Client["identificationType"] })}
        options={[
          { label: "RUC", value: "04" },
          { label: "Cedula", value: "05" },
          { label: "Pasaporte", value: "06" },
          { label: "Consumidor final", value: "07" },
          { label: "Exterior", value: "08" }
        ]}
      />
      <Input label="Email" value={form.email} onChangeText={(email) => setForm({ ...form, email })} autoCapitalize="none" />
      <Input label="Telefono WhatsApp" value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} keyboardType="phone-pad" />
      <Input label="Direccion" value={form.address} onChangeText={(address) => setForm({ ...form, address })} />
      {editingId ? (
        <Pressable style={styles.smallButton} onPress={() => { setEditingId(""); setForm(emptyForm); }}>
          <Text style={styles.smallButtonText}>Cancelar edicion</Text>
        </Pressable>
      ) : null}
      <PrimaryButton label="Guardar cliente" onPress={save} />
      </Section>
      ) : null}

      <Section title="Clientes guardados">
      <Input label="Buscar clientes guardados" value={clientSearch} onChangeText={setClientSearch} placeholder="Nombre, identificacion, email o telefono" autoCapitalize="none" />
      {data.clients.length === 0 ? <Empty text="Aun no hay clientes." /> : null}
      {data.clients.length > 0 && filteredClients.length === 0 ? <Empty text="No hay clientes con esa busqueda." /> : null}
      {visibleClients.map((client) => {
        const clientInUse =
          data.sales.some((sale) => sale.clientId === client.id) ||
          (data.guides || []).some((guide) => guide.clientId === client.id) ||
          (data.receivedRetentions || []).some((retention) => retention.clientId === client.id);
        return (
          <ListItem
            key={client.id}
            title={client.name}
            meta={`${client.identification} | ${client.email} | ${client.phone || "sin telefono"}`}
            editLabel={canEdit ? "Editar" : undefined}
            onEdit={() => edit(client)}
            onDelete={canDelete ? () => {
              if (clientInUse) {
                Alert.alert("Cliente protegido", "Este cliente ya tiene documentos asociados. Para conservar el historial fiscal no se puede eliminar.");
                return;
              }
              confirmAction("Eliminar cliente", `Seguro que desea eliminar a ${client.name}? Esta accion quedara registrada en auditoria.`, () => {
                void (async () => {
                  const nextData = appendAudit({ ...data, clients: data.clients.filter((item) => item.id !== client.id), deletedIds: { ...(data.deletedIds || {}), clients: Array.from(new Set([...(data.deletedIds?.clients || []), client.id])) } }, user, "CLIENT_DELETED", "client", client.id, `Cliente eliminado: ${client.name}`);
                  await persist(nextData);
                  await syncPatchToBackend(data.backendUrl, backendToken, { baseData: data, deletions: { clients: [client.id] }, auditLogs: nextData.auditLogs.slice(0, 1) }, "Cliente eliminado pendiente de sincronizar", nextData, persist);
                  showMessage("Cliente eliminado", "El cliente se elimino con exito.");
                })();
              });
            } : undefined}
          />
        );
      })}
      {visibleClients.length < filteredClients.length ? <LoadMoreButton label="Cargar mas clientes" onPress={() => setVisibleClientCount((count) => count + LIST_BATCH_SIZE)} /> : null}
      </Section>
    </View>
  );
}

function ProductsView({ data, user, backendToken, persist }: { data: AppData; user: User; backendToken: string; persist: (data: AppData) => Promise<void> }) {
  const emptyForm = { code: "", name: "", price: "", cost: "", stock: "", minStock: "5", ivaRate: "0.15" };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productScannerVisible, setProductScannerVisible] = useState(false);
  const [visibleProductCount, setVisibleProductCount] = useState(LIST_BATCH_SIZE);
  const filteredProducts = useMemo(() => {
    const search = productSearch.trim().toLowerCase();
    if (!search) return data.products;
    return data.products.filter((product) => [product.code, product.name].some((value) => value.toLowerCase().includes(search)));
  }, [data.products, productSearch]);
  const visibleProducts = filteredProducts.slice(0, visibleProductCount);
  const canDelete = canDeleteCatalog(user.role);
  const canEdit = canEditCatalog(user.role);

  useEffect(() => {
    setVisibleProductCount(LIST_BATCH_SIZE);
  }, [productSearch]);

  const verifyScannedProductCode = () => {
    if (!canEdit) {
      Alert.alert("Acceso restringido", "Su usuario no tiene permiso para modificar productos.");
      return;
    }

    const code = normalizeProductCode(form.code);
    if (!code) {
      Alert.alert("Codigo requerido", "Escanee o ingrese el codigo de barras.");
      return;
    }
    const duplicate = findDuplicateProductCode(data.products, code, editingId);
    setForm({ ...form, code });
    if (duplicate) {
      setProductSearch(code);
      Alert.alert("Codigo ya registrado", `El codigo ${duplicate.code} ya pertenece a ${duplicate.name}.`);
      return;
    }
    showMessage("Codigo listo", `Codigo ${code} disponible para guardar.`);
  };

  const save = async () => {
    if (!canEdit) {
      Alert.alert("Acceso restringido", "Su usuario no tiene permiso para modificar productos.");
      return;
    }

    const price = parseDecimal(form.price);
    const cost = parseDecimal(form.cost || "0");
    const stock = parseDecimal(form.stock || "0");
    const minStock = parseDecimal(form.minStock || "5");
    const productData = { code: normalizeProductCode(form.code), name: form.name.trim(), price, cost, stock, minStock, ivaRate: Number(form.ivaRate), updatedAt: new Date().toISOString() };

    if (!productData.code || !productData.name || !Number.isFinite(price) || price <= 0) {
      Alert.alert("Datos incompletos", "Ingrese codigo, nombre y precio.");
      return;
    }

    if (!Number.isFinite(stock) || stock < 0) {
      Alert.alert("Stock invalido", "Ingrese un stock mayor o igual a cero.");
      return;
    }
    if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(minStock) || minStock < 0) {
      Alert.alert("Costos invalidos", "Ingrese costo y stock minimo mayor o igual a cero.");
      return;
    }

    const duplicate = findDuplicateProductCode(data.products, productData.code, editingId);
    if (duplicate) {
      Alert.alert("Codigo duplicado", `Ya existe un producto con el codigo ${duplicate.code}: ${duplicate.name}.`);
      return;
    }

    if (editingId) {
      const currentProduct = data.products.find((product) => product.id === editingId);
      const movement =
        currentProduct && currentProduct.stock !== productData.stock
          ? createInventoryMovement(currentProduct, "ajuste", Math.abs(productData.stock - currentProduct.stock), productData.stock, "Ajuste desde productos", user.id)
          : null;
      const updatedProduct = { ...currentProduct, ...productData, id: editingId } as Product;
      const nextData = appendAudit({
        ...data,
        products: data.products.map((product) => (product.id === editingId ? updatedProduct : product)),
        inventoryMovements: movement ? [movement, ...(data.inventoryMovements || [])] : data.inventoryMovements
      }, user, "PRODUCT_UPDATED", "product", editingId, `Producto actualizado: ${productData.code} - ${productData.name}`, { stockBefore: currentProduct?.stock, stockAfter: productData.stock });
      await persist(nextData);
      await syncPatchToBackend(data.backendUrl, backendToken, {
        baseData: data,
        products: [updatedProduct],
        inventoryMovements: movement ? [movement] : [],
        auditLogs: nextData.auditLogs.slice(0, 1)
      }, "Producto pendiente de sincronizar", nextData, persist);
      showMessage("Producto actualizado", "El producto se edito con exito.");
    } else {
      const product: Product = { id: uid(), ...productData };
      const movement = product.stock > 0 ? createInventoryMovement(product, "entrada", product.stock, product.stock, "Stock inicial", user.id, 0) : null;
      const nextData = appendAudit({ ...data, products: [product, ...data.products], inventoryMovements: movement ? [movement, ...(data.inventoryMovements || [])] : data.inventoryMovements }, user, "PRODUCT_CREATED", "product", product.id, `Producto creado: ${product.code} - ${product.name}`, { stock: product.stock });
      await persist(nextData);
      await syncPatchToBackend(data.backendUrl, backendToken, {
        baseData: data,
        products: [product],
        inventoryMovements: movement ? [movement] : [],
        auditLogs: nextData.auditLogs.slice(0, 1)
      }, "Producto pendiente de sincronizar", nextData, persist);
      showMessage("Producto guardado", "El producto se guardo con exito.");
    }

    setEditingId("");
    setForm(emptyForm);
  };

  const edit = (product: Product) => {
    if (!canEdit) {
      Alert.alert("Acceso restringido", "Su usuario no tiene permiso para modificar productos.");
      return;
    }

    setEditingId(product.id);
    setForm({
      code: product.code,
      name: product.name,
      price: money(product.price),
      cost: money(productCost(product)),
      stock: String(product.stock),
      minStock: String(productMinStock(product)),
      ivaRate: String(product.ivaRate)
    });
  };

  return (
    <View style={styles.stack}>
      {canEdit ? (
      <Section title={editingId ? "Editar producto" : "Nuevo producto"}>
      <Input label="Codigo / barras" value={form.code} onChangeText={(code) => setForm({ ...form, code })} autoCapitalize="characters" placeholder="Escanee el codigo del producto" onSubmitEditing={verifyScannedProductCode} />
      <View style={styles.actionGroup}>
        <Pressable style={styles.smallButton} onPress={verifyScannedProductCode}>
          <Text style={styles.smallButtonText}>Verificar codigo</Text>
        </Pressable>
        <Pressable style={styles.scanButton} onPress={() => setProductScannerVisible(true)}>
          <Text style={styles.scanButtonText}>Escanear con camara</Text>
        </Pressable>
      </View>
      <Text style={styles.inlineInfo}>Puede escanear con lector Bluetooth/USB; el codigo se guarda como codigo principal del producto.</Text>
      <Input label="Nombre" value={form.name} onChangeText={(name) => setForm({ ...form, name })} />
      <Input label="Precio publico" value={form.price} onChangeText={(price) => setForm({ ...form, price })} keyboardType="decimal-pad" />
      <Input label="Costo promedio" value={form.cost} onChangeText={(cost) => setForm({ ...form, cost })} keyboardType="decimal-pad" />
      <Input label="Stock" value={form.stock} onChangeText={(stock) => setForm({ ...form, stock })} keyboardType="decimal-pad" />
      <Input label="Stock minimo" value={form.minStock} onChangeText={(minStock) => setForm({ ...form, minStock })} keyboardType="decimal-pad" />
      <Select label="IVA" value={form.ivaRate} onChange={(ivaRate) => setForm({ ...form, ivaRate })} options={[{ label: "15%", value: "0.15" }, { label: "0%", value: "0" }]} />
      {editingId ? (
        <Pressable style={styles.smallButton} onPress={() => { setEditingId(""); setForm(emptyForm); }}>
          <Text style={styles.smallButtonText}>Cancelar edicion</Text>
        </Pressable>
      ) : null}
      <PrimaryButton label="Guardar producto" onPress={save} />
      </Section>
      ) : null}

      <Section title="Productos guardados">
      <Input label="Buscar productos guardados" value={productSearch} onChangeText={setProductSearch} placeholder="Codigo o nombre" autoCapitalize="none" />
      {data.products.length === 0 ? <Empty text="Aun no hay productos." /> : null}
      {data.products.length > 0 && filteredProducts.length === 0 ? <Empty text="No hay productos con esa busqueda." /> : null}
      {visibleProducts.map((product) => {
        const productInUse =
          data.sales.some((sale) => sale.items.some((item) => item.productId === product.id)) ||
          (data.guides || []).some((guide) => guide.items.some((item) => item.productId === product.id)) ||
          (data.inventoryMovements || []).some((movement) => movement.productId === product.id);
        return (
          <ListItem
            key={product.id}
            title={`${product.code} - ${product.name}`}
            meta={`Publico $${money(product.price)} | Costo $${money(productCost(product))} | Util. $${money(grossToNetUnitPrice(product.price, product.ivaRate) - productCost(product))} | stock ${product.stock}/${productMinStock(product)}`}
            editLabel={canEdit ? "Editar" : undefined}
            onEdit={() => edit(product)}
            onDelete={canDelete ? () => {
              if (productInUse) {
                Alert.alert("Producto protegido", "Este producto ya tiene ventas, guias o movimientos de inventario. Para conservar el historial no se puede eliminar.");
                return;
              }
              confirmAction("Eliminar producto", `Seguro que desea eliminar ${product.code} - ${product.name}? Esta accion quedara registrada en auditoria.`, () => {
                void (async () => {
                  const nextData = appendAudit({ ...data, products: data.products.filter((item) => item.id !== product.id), deletedIds: { ...(data.deletedIds || {}), products: Array.from(new Set([...(data.deletedIds?.products || []), product.id])) } }, user, "PRODUCT_DELETED", "product", product.id, `Producto eliminado: ${product.code} - ${product.name}`);
                  await persist(nextData);
                  await syncPatchToBackend(data.backendUrl, backendToken, { baseData: data, deletions: { products: [product.id] }, auditLogs: nextData.auditLogs.slice(0, 1) }, "Producto eliminado pendiente de sincronizar", nextData, persist);
                  showMessage("Producto eliminado", "El producto se elimino con exito.");
                })();
              });
            } : undefined}
          />
        );
      })}
      {visibleProducts.length < filteredProducts.length ? <LoadMoreButton label="Cargar mas productos" onPress={() => setVisibleProductCount((count) => count + LIST_BATCH_SIZE)} /> : null}
      </Section>
      <BarcodeScannerModal
        visible={productScannerVisible}
        title="Escanear codigo del producto"
        onClose={() => setProductScannerVisible(false)}
        onScan={(code) => {
          const normalized = normalizeProductCode(code);
          setProductScannerVisible(false);
          setForm((current) => ({ ...current, code: normalized }));
          const duplicate = findDuplicateProductCode(data.products, normalized, editingId);
          if (duplicate) {
            setProductSearch(normalized);
            Alert.alert("Codigo ya registrado", `El codigo ${duplicate.code} ya pertenece a ${duplicate.name}.`);
          } else {
            showMessage("Codigo escaneado", `Codigo ${normalized} listo para guardar.`);
          }
        }}
      />
    </View>
  );
}

function InventoryView({ data, user, backendToken, persist }: { data: AppData; user: User; backendToken: string; persist: (data: AppData) => Promise<void> }) {
  const [productId, setProductId] = useState(data.products[0]?.id || "");
  const [type, setType] = useState<InventoryMovementType>("entrada");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [movementSearch, setMovementSearch] = useState("");
  const [visibleProductCount, setVisibleProductCount] = useState(LIST_BATCH_SIZE);
  const [visibleMovementCount, setVisibleMovementCount] = useState(LIST_BATCH_SIZE);
  const filteredProducts = useMemo(() => {
    const search = productSearch.trim().toLowerCase();
    if (!search) return data.products;
    return data.products.filter((product) => [product.code, product.name].some((value) => value.toLowerCase().includes(search)));
  }, [data.products, productSearch]);
  const visibleProducts = filteredProducts.slice(0, visibleProductCount);
  const filteredMovements = useMemo(() => {
    const search = movementSearch.trim().toLowerCase();
    const movements = data.inventoryMovements || [];
    if (!search) return movements;
    return movements.filter((movement) =>
      [movement.productName, movement.reason, movement.reference || "", movementTypeLabel(movement.type)].some((value) => value.toLowerCase().includes(search))
    );
  }, [data.inventoryMovements, movementSearch]);
  const visibleMovements = filteredMovements.slice(0, visibleMovementCount);
  const selectedProduct = data.products.find((product) => product.id === productId);
  const productKardex = useMemo(() => (data.inventoryMovements || []).filter((movement) => movement.productId === productId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [data.inventoryMovements, productId]);
  const productSales = useMemo(() => data.sales.filter((sale) => sale.items.some((item) => item.productId === productId) && (sale.status === "AUTORIZADA" || sale.status === "INTERNA")), [data.sales, productId]);
  const productUnitsSold = productSales.reduce((sum, sale) => sum + sale.items.filter((item) => item.productId === productId).reduce((lineSum, item) => lineSum + accountingValue(sale, item.quantity), 0), 0);
  const productProfit = productSales.reduce((sum, sale) => sum + sale.items.filter((item) => item.productId === productId).reduce((lineSum, item) => {
    const cost = Number.isFinite(Number(item.cost)) ? Number(item.cost) : productCost(selectedProduct);
    return lineSum + accountingValue(sale, calculateLineSubtotal(item) - item.quantity * cost);
  }, 0), 0);

  useEffect(() => {
    setVisibleProductCount(LIST_BATCH_SIZE);
  }, [productSearch]);

  useEffect(() => {
    setVisibleMovementCount(LIST_BATCH_SIZE);
  }, [movementSearch]);

  useEffect(() => {
    if (productId && data.products.some((product) => product.id === productId)) return;
    setProductId(data.products[0]?.id || "");
  }, [data.products, productId]);

  useEffect(() => {
    if (filteredProducts.length === 0) return;
    if (filteredProducts.some((product) => product.id === productId)) return;
    setProductId(filteredProducts[0]?.id || "");
  }, [filteredProducts, productId]);

  const saveMovement = async () => {
    const qty = parseDecimal(quantity);
    if (!selectedProduct || !Number.isFinite(qty) || qty <= 0) {
      Alert.alert("Movimiento incompleto", "Seleccione producto e ingrese una cantidad mayor a cero.");
      return;
    }

    let stockAfter = selectedProduct.stock;
    if (type === "entrada") stockAfter = selectedProduct.stock + qty;
    if (type === "salida") stockAfter = selectedProduct.stock - qty;
    if (type === "ajuste") stockAfter = qty;

    if (stockAfter < 0) {
      Alert.alert("Stock insuficiente", `No puede dejar stock negativo. Disponible: ${selectedProduct.stock}.`);
      return;
    }

    const createdAt = new Date().toISOString();
    const movement = createInventoryMovement(selectedProduct, type, type === "ajuste" ? Math.abs(stockAfter - selectedProduct.stock) : qty, stockAfter, reason.trim() || movementReason(type), user.id);
    const updatedProduct = { ...selectedProduct, stock: stockAfter, updatedAt: createdAt };
    const nextData = appendAudit({
      ...data,
      products: data.products.map((product) => (product.id === selectedProduct.id ? updatedProduct : product)),
      inventoryMovements: [movement, ...(data.inventoryMovements || [])]
    }, user, "INVENTORY_MOVEMENT_CREATED", "inventory", movement.id, `${movementTypeLabel(type)} de inventario: ${selectedProduct.code} - ${selectedProduct.name}`, { quantity: movement.quantity, stockBefore: selectedProduct.stock, stockAfter });
    await persist(nextData);
    await syncPatchToBackend(data.backendUrl, backendToken, {
      baseData: data,
      products: [updatedProduct],
      inventoryMovements: [movement],
      auditLogs: nextData.auditLogs.slice(0, 1)
    }, "Movimiento de inventario pendiente de sincronizar", nextData, persist);
    setQuantity("");
    setReason("");
    showMessage("Movimiento guardado", `Inventario actualizado. Nuevo stock de ${selectedProduct.name}: ${stockAfter}.`);
  };

  return (
    <View style={styles.stack}>
      <Section title="Movimiento de inventario">
        <Input label="Buscar producto" value={productSearch} onChangeText={setProductSearch} placeholder="Codigo o nombre" autoCapitalize="none" />
        <Select label={`Producto (${visibleProducts.length}/${filteredProducts.length})`} value={productId} onChange={setProductId} options={visibleProducts.map((product) => ({ label: `${product.code} - ${product.name}`, value: product.id }))} />
        {filteredProducts.length === 0 ? <Empty text="No hay productos con esa busqueda." /> : null}
        {visibleProducts.length < filteredProducts.length ? <LoadMoreButton label="Cargar mas productos" onPress={() => setVisibleProductCount((count) => count + LIST_BATCH_SIZE)} /> : null}
        <Select
          label="Tipo"
          value={type}
          onChange={(value) => setType(value as InventoryMovementType)}
          options={[
            { label: "Entrada", value: "entrada" },
            { label: "Salida", value: "salida" },
            { label: "Ajuste", value: "ajuste" }
          ]}
        />
        {selectedProduct ? <Text style={styles.paragraph}>Stock actual: {selectedProduct.stock} | Minimo: {productMinStock(selectedProduct)} | Costo promedio: ${money(productCost(selectedProduct))}</Text> : null}
        <Input label={type === "ajuste" ? "Nuevo stock" : "Cantidad"} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
        <Input label="Motivo" value={reason} onChangeText={setReason} placeholder={movementReason(type)} />
        <PrimaryButton label="Guardar movimiento" onPress={saveMovement} />
      </Section>

      <Section title="Stock actual">
        {data.products.length === 0 ? <Empty text="Aun no hay productos." /> : null}
        {visibleProducts.map((product) => (
          <ListItem key={product.id} title={`${product.code} - ${product.name}`} meta={`Stock ${product.stock}/${productMinStock(product)} | Costo $${money(productCost(product))} | Publico $${money(product.price)} | Util. $${money(grossToNetUnitPrice(product.price, product.ivaRate) - productCost(product))}`} badge={product.stock <= 0 ? "SIN STOCK" : product.stock <= productMinStock(product) ? "BAJO" : undefined} />
        ))}
        {visibleProducts.length < filteredProducts.length ? <LoadMoreButton label="Cargar mas stock" onPress={() => setVisibleProductCount((count) => count + LIST_BATCH_SIZE)} /> : null}
      </Section>

      <Section title="Kardex del producto">
        {selectedProduct ? (
          <View style={styles.statsGrid}>
            <StatBox label="Stock" value={String(selectedProduct.stock)} />
            <StatBox label="Minimo" value={String(productMinStock(selectedProduct))} />
            <StatBox label="Costo prom." value={`$${money(productCost(selectedProduct))}`} />
            <StatBox label="Unid. vendidas" value={money(productUnitsSold)} />
            <StatBox label="Utilidad" value={`$${money(productProfit)}`} />
            <StatBox label="Movimientos" value={String(productKardex.length)} />
          </View>
        ) : null}
        {productKardex.length === 0 ? <Empty text="No hay movimientos para este producto." /> : null}
        {productKardex.slice(0, LIST_BATCH_SIZE).map((movement) => (
          <ListItem key={movement.id} title={`${movementTypeLabel(movement.type)} - ${movement.productName}`} meta={`${formatAuditDate(movement.createdAt)} | Cant. ${movement.quantity} | ${movement.stockBefore} -> ${movement.stockAfter} | ${movement.reason}${movement.reference ? ` | Ref. ${movement.reference}` : ""}`} />
        ))}
      </Section>

      <Section title="Ultimos movimientos">
        <Input label="Buscar movimientos" value={movementSearch} onChangeText={setMovementSearch} placeholder="Producto, motivo o referencia" autoCapitalize="none" />
        {(data.inventoryMovements || []).length === 0 ? <Empty text="Aun no hay movimientos de inventario." /> : null}
        {(data.inventoryMovements || []).length > 0 && filteredMovements.length === 0 ? <Empty text="No hay movimientos con esa busqueda." /> : null}
        {visibleMovements.map((movement) => (
          <ListItem key={movement.id} title={`${movementTypeLabel(movement.type)} - ${movement.productName}`} meta={`${formatShortDate(movement.createdAt)} | Cant. ${movement.quantity} | ${movement.stockBefore} -> ${movement.stockAfter} | ${movement.reason}${movement.reference ? ` | Ref. ${movement.reference}` : ""}`} />
        ))}
        {visibleMovements.length < filteredMovements.length ? <LoadMoreButton label="Cargar mas movimientos" onPress={() => setVisibleMovementCount((count) => count + LIST_BATCH_SIZE)} /> : null}
      </Section>
    </View>
  );
}

function movementReason(type: InventoryMovementType) {
  if (type === "entrada") return "Compra o ingreso de mercaderia";
  if (type === "salida") return "Merma, uso interno o salida manual";
  return "Correccion de stock";
}

function movementTypeLabel(type: InventoryMovementType) {
  if (type === "entrada") return "Entrada";
  if (type === "salida") return "Salida";
  return "Ajuste";
}

function GuidesView({ data, user, backendToken, persist, onXml }: { data: AppData; user: User; backendToken: string; persist: (data: AppData) => Promise<void>; onXml: (value: string) => void }) {
  const scopedSales = useMemo(() => data.sales.filter((sale) => saleInActiveScope(sale, data)), [data]);
  const scopedGuides = useMemo(() => (data.guides || []).filter((guide) => guideInActiveScope(guide, data)), [data]);
  const movableDocuments = useMemo(
    () => scopedSales.filter((sale) => sale.status === "AUTORIZADA" || sale.status === "INTERNA" || sale.status === "PROFORMA"),
    [scopedSales]
  );
  const [sourceSaleId, setSourceSaleId] = useState(movableDocuments[0]?.id || "");
  const [documentSearch, setDocumentSearch] = useState("");
  const [guideSearch, setGuideSearch] = useState("");
  const [visibleDocumentCount, setVisibleDocumentCount] = useState(LIST_BATCH_SIZE);
  const [visibleGuideCount, setVisibleGuideCount] = useState(LIST_BATCH_SIZE);
  const clientsById = useMemo(() => new Map(data.clients.map((item) => [item.id, item])), [data.clients]);
  const filteredMovableDocuments = useMemo(() => {
    const search = documentSearch.trim().toLowerCase();
    if (!search) return movableDocuments;

    return movableDocuments.filter((sale) => {
      const saleClient = clientsById.get(sale.clientId);
      return [
        documentTypeLabel(sale),
        sale.sequence,
        documentNumber(sale, data.issuer),
        sale.accessKey,
        sale.authorizationNumber || "",
        saleClient?.name || "",
        saleClient?.identification || ""
      ].some((value) => value.toLowerCase().includes(search));
    });
  }, [clientsById, data.issuer, documentSearch, movableDocuments]);
  const visibleMovableDocuments = filteredMovableDocuments.slice(0, visibleDocumentCount);
  const filteredGuides = useMemo(() => {
    const search = guideSearch.trim().toLowerCase();
    const guides = scopedGuides;
    if (!search) return guides;
    return guides.filter((guide) => {
      const guideClient = clientsById.get(guide.clientId);
      const source = data.sales.find((sale) => sale.id === guide.sourceSaleId);
      return [
        guide.sequence,
        guide.accessKey,
        guide.authorizationNumber || "",
        guide.status,
        guide.plate,
        guide.route,
        guide.transporterName,
        guide.transporterIdentification,
        guideClient?.name || "",
        guideClient?.identification || "",
        source?.sequence || ""
      ].some((value) => value.toLowerCase().includes(search));
    });
  }, [clientsById, data.sales, guideSearch, scopedGuides]);
  const visibleGuides = filteredGuides.slice(0, visibleGuideCount);
  const sourceSale = data.sales.find((sale) => sale.id === sourceSaleId);
  const client = sourceSale ? data.clients.find((item) => item.id === sourceSale.clientId) : undefined;
  const [transporterName, setTransporterName] = useState("");
  const [transporterIdentification, setTransporterIdentification] = useState("");
  const [transporterType, setTransporterType] = useState<"04" | "05" | "06">("05");
  const [plate, setPlate] = useState("");
  const [startAddress, setStartAddress] = useState(data.issuer.address);
  const [endAddress, setEndAddress] = useState(client?.address || "");
  const [route, setRoute] = useState("");
  const [reason, setReason] = useState("Venta de mercaderia");
  const [startDate, setStartDate] = useState(toInputDate(new Date()));
  const [endDate, setEndDate] = useState(toInputDate(new Date()));
  const [issuingGuide, setIssuingGuide] = useState(false);
  const [retryingGuideId, setRetryingGuideId] = useState("");
  const [processingMessage, setProcessingMessage] = useState("");

  useEffect(() => {
    setVisibleDocumentCount(LIST_BATCH_SIZE);
  }, [documentSearch]);

  useEffect(() => {
    setVisibleGuideCount(LIST_BATCH_SIZE);
  }, [guideSearch]);

  useEffect(() => {
    if (sourceSaleId && movableDocuments.some((sale) => sale.id === sourceSaleId)) return;
    setSourceSaleId(movableDocuments[0]?.id || "");
  }, [movableDocuments, sourceSaleId]);

  useEffect(() => {
    if (filteredMovableDocuments.length === 0) return;
    if (filteredMovableDocuments.some((sale) => sale.id === sourceSaleId)) return;
    setSourceSaleId(filteredMovableDocuments[0]?.id || "");
  }, [filteredMovableDocuments, sourceSaleId]);

  useEffect(() => {
    if (client?.address) setEndAddress(client.address);
  }, [client?.address]);

  const issueGuide = async () => {
    if (issuingGuide) return;

    if (!sourceSale || !client) {
      Alert.alert("Documento requerido", "Seleccione una factura, ticket o proforma para trasladar.");
      return;
    }
    const errors = validateGuideForm(transporterName, transporterIdentification, transporterType, plate, startAddress, endAddress, route, reason, startDate, endDate);
    if (errors.length > 0) {
      Alert.alert("Revise la guia", errors.map((error) => `- ${error}`).join("\n"));
      return;
    }

    setIssuingGuide(true);
    setProcessingMessage("Firmando y autorizando guia de remision...");
    let guide: RemissionGuide | null = null;
    let draftData: AppData | null = null;
    let xml = "";

    try {
      const createdAt = new Date().toISOString();
      const accessKeyDate = parseInputDate(startDate, "start") || new Date(createdAt);
      const documentIssuer = activeIssuer(data);
      const documentEstablishment = activeEstablishment(data.issuer);
      const licenseErrors: string[] = [];
      validateEmissionPointLicense(data, documentIssuer, licenseErrors);
      if (licenseErrors.length > 0) {
        Alert.alert("Plan requerido", licenseErrors.map((error) => `- ${error}`).join("\n"));
        return;
      }
      let sequence = nextSequence(documentIssuer.remissionSequential || 1);
      let accessKey = createGuideAccessKey(accessKeyDate, documentIssuer, sequence);
      try {
        setProcessingMessage("Preparando numero de guia...");
        const reserved = await reserveDocumentSequence(data.backendUrl, { documentType: "guia_remision", issuer: documentIssuer, createdAt: accessKeyDate.toISOString() }, backendToken);
        if (Number(reserved.sequence) < Number(sequence)) {
          throw new Error(`El servidor devolvio el secuencial ${reserved.sequence}, menor al configurado ${sequence}. Guarde SRI y sincronice antes de emitir.`);
        }
        sequence = reserved.sequence || sequence;
        accessKey = reserved.accessKey || accessKey;
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo preparar el numero de guia.";
        Alert.alert("Numero no preparado", message);
        return;
      }
      guide = {
        id: uid(),
        establishment: documentIssuer.establishment,
        emissionPoint: documentIssuer.emissionPoint,
        establishmentName: documentEstablishment.name,
        sourceSaleId: sourceSale.id,
        clientId: client.id,
        userId: user.id,
        createdAt,
        sequence,
        accessKey,
        status: "BORRADOR",
        transporterName: transporterName.trim(),
        transporterIdentification: transporterIdentification.trim(),
        transporterIdentificationType: transporterType,
        plate: plate.trim().toUpperCase(),
        startAddress: startAddress.trim(),
        endAddress: endAddress.trim(),
        route: route.trim(),
        reason: reason.trim(),
        startDate,
        endDate,
        items: sourceSale.items
      };
      if (isAccessKeyUsed(data, guide.accessKey)) {
        throw new Error(`La clave de acceso ${guide.accessKey} ya existe en otro comprobante. Revise el secuencial de guias antes de emitir.`);
      }
      xml = buildRemissionGuideXml(guide, client, documentIssuer, sourceSale);
      draftData = {
        ...data,
        issuer: updateIssuerEstablishmentSequence(data.issuer, documentEstablishment.id, "remissionSequential", Math.max((documentIssuer.remissionSequential || 1) + 1, Number(sequence) + 1)),
        guides: [guide, ...(data.guides || [])]
      };
      await persist(draftData);

      const sriResult = await authorizeRemissionGuide(data.backendUrl, xml, backendToken);
      const finalGuide: RemissionGuide = {
        ...guide,
        accessKey: sriResult.accessKey || guide.accessKey,
        authorizationNumber: sriResult.authorizationNumber,
        authorizationDate: sriResult.authorizationDate,
        sriEnvironment: sriResult.sriEnvironment,
        sriMessage: sriResult.sriMessage,
        signedXml: sriResult.signedXml,
        authorizedXml: sriResult.authorizedXml,
        status: resolveInvoiceStatus(sriResult)
      };
      const finalData = appendAudit({
        ...draftData,
        guides: draftData.guides.map((item) => (item.id === finalGuide.id ? finalGuide : item))
      }, user, "GUIDE_CREATED", "guide", finalGuide.id, `Guia ${finalGuide.sequence} guardada con estado ${finalGuide.status}`, { status: finalGuide.status, accessKey: finalGuide.accessKey });
      await persist(finalData);
      await syncSalePatchToBackend(data.backendUrl, backendToken, {
        baseData: data,
        issuer: finalData.issuer,
        guides: [finalGuide],
        auditLogs: finalData.auditLogs.slice(0, 1)
      }, finalData, persist);
      Alert.alert(explainSriResult(sriResult).title, finalGuide.status === "AUTORIZADA" ? "Guia autorizada por el SRI." : sriUserMessage(sriResult));
      showMessage("Guia guardada", finalGuide.status === "AUTORIZADA" ? "Guia autorizada y guardada con exito." : sriUserMessage(sriResult));
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo autorizar la guia.";
      if (draftData && guide) {
        const rejectedGuide: RemissionGuide = { ...guide, status: "RECHAZADA", sriMessage: message };
        const finalData = appendAudit({
          ...draftData,
          guides: draftData.guides.map((item) => (item.id === rejectedGuide.id ? rejectedGuide : item))
        }, user, "GUIDE_FAILED", "guide", rejectedGuide.id, `Guia ${rejectedGuide.sequence} rechazada`, { error: message });
        await persist(finalData);
        await syncSalePatchToBackend(data.backendUrl, backendToken, {
          baseData: data,
          issuer: finalData.issuer,
          guides: [rejectedGuide],
          auditLogs: finalData.auditLogs.slice(0, 1)
        }, finalData, persist);
      }
      Alert.alert("Guia no autorizada", message);
    } finally {
      setIssuingGuide(false);
      setProcessingMessage("");
    }
  };

  const printGuide = async (guide: RemissionGuide, guideClient: Client, source?: Sale) => {
    if (guide.status !== "AUTORIZADA") {
      Alert.alert("PDF no disponible", "La guia debe estar autorizada para generar el RIDE.");
      return;
    }

    const html = buildGuideRideHtml(guide, guideClient, issuerForGuide(data.issuer, guide), source);

    if (typeof window !== "undefined" && "document" in window) {
      openHtmlViewer(html, `Guia ${guide.sequence}`);
      return;
    }

    await handlePdfDocument(html, `Guia ${guide.sequence}`, "Guia de remision");
  };

  const retryGuide = async (guide: RemissionGuide, guideClient: Client | undefined, source?: Sale) => {
    if (retryingGuideId) return;
    if (!guideClient) {
      Alert.alert("Cliente no encontrado", "No se pudo reconstruir la guia porque falta el destinatario.");
      return;
    }
    if (guide.status === "AUTORIZADA" || guide.status === "ANULADA") {
      Alert.alert("Reintento no disponible", "Solo se pueden reintentar guias no autorizadas y no anuladas.");
      return;
    }
    const retryInfo = getRetryInfo(guide);
    if (retryInfo.today >= MAX_DAILY_RETRIES) {
      const message = `Esta guia ya tiene ${retryInfo.today} reintento(s) hoy. Revise el detalle antes de volver a intentar manana.`;
      Alert.alert("Limite diario de reintentos", message);
      return;
    }

    setRetryingGuideId(guide.id);
    setProcessingMessage("Reintentando guia de remision...");
    const retryAt = new Date().toISOString();
    const guideIssuer = issuerForGuide(data.issuer, guide);
    const correctedGuide: RemissionGuide = {
      ...guide,
      accessKey: createGuideAccessKey(parseInputDate(guide.startDate, "start") || new Date(guide.createdAt), guideIssuer, guide.sequence),
      authorizationNumber: undefined,
      authorizationDate: undefined,
      sriEnvironment: undefined,
      signedXml: undefined,
      authorizedXml: undefined
    };
    const unsignedXml = buildRemissionGuideXml(correctedGuide, guideClient, guideIssuer, source);

    try {
      const sriResult = await authorizeRemissionGuide(data.backendUrl, unsignedXml, backendToken);
      const updatedGuide: RemissionGuide = {
        ...correctedGuide,
        accessKey: sriResult.accessKey || guide.accessKey,
        authorizationNumber: sriResult.authorizationNumber,
        authorizationDate: sriResult.authorizationDate,
        sriEnvironment: sriResult.sriEnvironment,
        sriMessage: sriResult.sriMessage,
        signedXml: sriResult.signedXml,
        authorizedXml: sriResult.authorizedXml,
        status: resolveInvoiceStatus(sriResult),
        retryHistory: [...(guide.retryHistory || []), retryAt]
      };

      await persist(appendAudit({
        ...data,
        guides: (data.guides || []).map((item) => (item.id === guide.id ? updatedGuide : item))
      }, user, "GUIDE_RETRIED", "guide", guide.id, `Reenvio de guia ${guide.sequence}: ${updatedGuide.status}`, { status: updatedGuide.status, accessKey: updatedGuide.accessKey }));
      Alert.alert(explainSriResult(sriResult).title, updatedGuide.status === "AUTORIZADA" ? "Guia autorizada por el SRI." : sriUserMessage(sriResult));
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo reintentar la guia.";
      await persist(appendAudit({
        ...data,
        guides: (data.guides || []).map((item) => (item.id === guide.id ? { ...correctedGuide, status: "RECHAZADA", sriMessage: message, retryHistory: [...(guide.retryHistory || []), retryAt] } : item))
      }, user, "GUIDE_RETRY_FAILED", "guide", guide.id, `Reenvio fallido de guia ${guide.sequence}`, { error: message }));
      Alert.alert("No se pudo reintentar", message);
    } finally {
      setRetryingGuideId("");
      setProcessingMessage("");
    }
  };

  return (
    <View style={styles.stack}>
      <Section title="Nueva guia de remision">
        <Text style={styles.paragraph}>Comprobante SRI tipo 06 para traslado de mercaderia. No mueve inventario; documenta transporte.</Text>
        <Input label="Buscar factura origen" value={documentSearch} onChangeText={setDocumentSearch} placeholder="Cliente, cedula/RUC, numero o clave" autoCapitalize="none" />
        {movableDocuments.length === 0 ? <Empty text="No hay facturas, notas o proformas disponibles para trasladar." /> : null}
        {movableDocuments.length > 0 && filteredMovableDocuments.length === 0 ? <Empty text="No hay documentos con esa busqueda." /> : null}
        <Select
          label={`Documento origen (${visibleMovableDocuments.length}/${filteredMovableDocuments.length})`}
          value={sourceSaleId}
          onChange={setSourceSaleId}
          options={visibleMovableDocuments.map((sale) => {
            const saleClient = clientsById.get(sale.clientId);
            return { label: `${documentTypeLabel(sale)} ${documentNumber(sale, data.issuer)} - ${saleClient?.name || "Cliente"}`, value: sale.id };
          })}
        />
        {visibleMovableDocuments.length < filteredMovableDocuments.length ? <LoadMoreButton label="Cargar mas documentos" onPress={() => setVisibleDocumentCount((count) => count + LIST_BATCH_SIZE)} /> : null}
        {sourceSale && client ? <Text style={styles.inlineInfo}>Destino: {client.name} | Productos: {sourceSale.items.length}</Text> : null}
        <Input label="Transportista / razon social" value={transporterName} onChangeText={setTransporterName} />
        <Select label="Tipo identificacion transportista" value={transporterType} onChange={(value) => setTransporterType(value as "04" | "05" | "06")} options={[{ label: "Cedula", value: "05" }, { label: "RUC", value: "04" }, { label: "Pasaporte", value: "06" }]} />
        <Input label="Identificacion transportista" value={transporterIdentification} onChangeText={setTransporterIdentification} keyboardType="number-pad" />
        <Input label="Placa" value={plate} onChangeText={setPlate} autoCapitalize="characters" />
        <Input label="Direccion partida" value={startAddress} onChangeText={setStartAddress} />
        <Input label="Direccion destino" value={endAddress} onChangeText={setEndAddress} />
        <Input label="Ruta" value={route} onChangeText={setRoute} placeholder="Ej. La Concordia - Quito" />
        <Input label="Motivo traslado" value={reason} onChangeText={setReason} />
        <View style={styles.row}>
          <View style={styles.flex}>
            <CalendarDateInput label="Fecha inicio" value={startDate} onChange={setStartDate} />
          </View>
          <View style={styles.flex}>
            <CalendarDateInput label="Fecha fin" value={endDate} onChange={setEndDate} />
          </View>
        </View>
        <PrimaryButton label={issuingGuide ? "Procesando..." : "Emitir guia"} onPress={issuingGuide ? () => undefined : issueGuide} />
      </Section>

      <Section title="Guias emitidas">
        <Input label="Buscar guias emitidas" value={guideSearch} onChangeText={setGuideSearch} placeholder="Cliente, placa, ruta, secuencial o clave" autoCapitalize="none" />
        {(data.guides || []).length === 0 ? <Empty text="Aun no hay guias de remision." /> : null}
        {(data.guides || []).length > 0 && filteredGuides.length === 0 ? <Empty text="No hay guias con esa busqueda." /> : null}
        {visibleGuides.map((guide) => {
          const guideClient = data.clients.find((item) => item.id === guide.clientId);
          const source = data.sales.find((item) => item.id === guide.sourceSaleId);
          return (
            <ListItem
              key={guide.id}
              title={`${guideNumber(guide, data.issuer)} - ${guideClient?.name || "Destinatario"}`}
              meta={`${guide.status} | ${guide.plate} | ${guide.route} | ${guide.accessKey}`}
              badge={guide.status}
              onOpen={canAccessSensitiveSupport(user.role) ? () => onXml(formatGuideDetail(guide, guideClient, issuerForGuide(data.issuer, guide), source)) : undefined}
              secondaryLabel={guide.status === "AUTORIZADA" ? "PDF guia" : undefined}
              onSecondary={() => guideClient && printGuide(guide, guideClient, source)}
              retryLabel={canRetryDocuments(user.role) && guide.status !== "AUTORIZADA" && guide.status !== "ANULADA" ? (retryingGuideId === guide.id ? "..." : `Reintentar ${getRetryInfo(guide).today}/${MAX_DAILY_RETRIES}`) : undefined}
              onRetry={() => retryGuide(guide, guideClient, source)}
            />
          );
        })}
        {visibleGuides.length < filteredGuides.length ? <LoadMoreButton label="Cargar mas guias" onPress={() => setVisibleGuideCount((count) => count + LIST_BATCH_SIZE)} /> : null}
      </Section>
      <ProcessingOverlay visible={Boolean(processingMessage)} message={processingMessage} />
    </View>
  );
}

function UsersView({ data, user: currentUser, backendToken, persist }: { data: AppData; user: User; backendToken: string; persist: (data: AppData) => Promise<void> }) {
  const emptyForm = { name: "", email: "", password: "", role: "vendedor" as UserRole };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [visibleUserCount, setVisibleUserCount] = useState(LIST_BATCH_SIZE);
  const filteredUsers = useMemo(() => {
    const search = userSearch.trim().toLowerCase();
    if (!search) return data.users;
    return data.users.filter((user) => [user.name, user.email, user.role, roleLabel(user.role)].some((value) => value.toLowerCase().includes(search)));
  }, [data.users, userSearch]);
  const visibleUsers = filteredUsers.slice(0, visibleUserCount);

  useEffect(() => {
    setVisibleUserCount(LIST_BATCH_SIZE);
  }, [userSearch]);

  useEffect(() => {
    if (!editingId) setForm(emptyForm);
  }, [editingId, data.users.length]);

  const save = async () => {
    if (!form.name || !form.email || (!editingId && !form.password)) {
      Alert.alert("Datos incompletos", editingId ? "Ingrese nombre y correo." : "Ingrese nombre, correo y contrasena.");
      return;
    }
    const email = form.email.trim().toLowerCase();
    if (data.users.some((user) => user.id !== editingId && user.email.trim().toLowerCase() === email)) {
      Alert.alert("Usuario duplicado", "Ya existe un usuario con ese correo.");
      return;
    }

    if (editingId) {
      const passwordHash = form.password ? await hashPassword(form.password) : undefined;
      const updatedUser = data.users.find((user) => user.id === editingId);
      const finalUser = {
        ...updatedUser,
        id: editingId,
        name: form.name.trim(),
        email,
        role: form.role,
        ...(passwordHash ? { password: undefined, passwordHash } : {})
      } as User;
      const nextData = appendAudit({
        ...data,
        users: data.users.map((user) => user.id === editingId ? finalUser : user)
      }, currentUser, "USER_UPDATED", "user", editingId, `Usuario actualizado: ${form.name.trim()}`);
      await persist(nextData);
      await syncPatchToBackend(data.backendUrl, backendToken, { baseData: data, users: [finalUser], auditLogs: nextData.auditLogs.slice(0, 1) }, "Usuario pendiente de sincronizar", nextData, persist);
      showMessage("Usuario actualizado", "El usuario se edito con exito.");
    } else {
      const passwordHash = await hashPassword(form.password);
      const createdUser: User = { id: uid(), name: form.name.trim(), email, role: form.role, passwordHash };
      const nextData = appendAudit({ ...data, users: [createdUser, ...data.users] }, currentUser, "USER_CREATED", "user", createdUser.id, `Usuario creado: ${createdUser.name}`);
      await persist(nextData);
      await syncPatchToBackend(data.backendUrl, backendToken, { baseData: data, users: [createdUser], auditLogs: nextData.auditLogs.slice(0, 1) }, "Usuario pendiente de sincronizar", nextData, persist);
      showMessage("Usuario guardado", "El usuario se guardo con exito.");
    }

    setEditingId("");
    setForm(emptyForm);
  };

  const edit = (user: User) => {
    setEditingId(user.id);
    setForm({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role
    });
  };

  return (
    <CrudSection title="Usuarios" onSave={save}>
      <Input key={`user-name-${editingId || "new"}`} label="Nombre" value={form.name} onChangeText={(name) => setForm({ ...form, name })} autoComplete="off" />
      <Input key={`user-email-${editingId || "new"}`} label="Correo" value={form.email} onChangeText={(email) => setForm({ ...form, email })} autoCapitalize="none" autoComplete="off" textContentType="none" importantForAutofill="no" />
      <Input key={`user-password-${editingId || "new"}`} label={editingId ? "Nueva contrasena (opcional)" : "Contrasena"} value={form.password} onChangeText={(password) => setForm({ ...form, password })} secureTextEntry autoComplete="new-password" textContentType="none" importantForAutofill="no" />
      <Select label="Rol" value={form.role} onChange={(role) => setForm({ ...form, role: role as UserRole })} options={roleOptions} />
      {editingId ? (
        <Pressable style={styles.smallButton} onPress={() => { setEditingId(""); setForm(emptyForm); }}>
          <Text style={styles.smallButtonText}>Cancelar edicion</Text>
        </Pressable>
      ) : null}
      <Input label="Buscar usuarios" value={userSearch} onChangeText={setUserSearch} placeholder="Nombre, correo o rol" autoCapitalize="none" />
      {data.users.length === 0 ? <Empty text="Aun no hay usuarios." /> : null}
      {data.users.length > 0 && filteredUsers.length === 0 ? <Empty text="No hay usuarios con esa busqueda." /> : null}
      {visibleUsers.map((user) => (
        <ListItem
          key={user.id}
          title={user.name}
          meta={`${user.email} | ${roleLabel(user.role)}`}
          editLabel="Editar"
          onEdit={() => edit(user)}
          onDelete={user.id === currentUser.id ? undefined : () => confirmAction("Eliminar usuario", `Seguro que desea eliminar a ${user.name}? Esta accion quedara registrada en auditoria.`, () => {
            void (async () => {
            if (user.role === "admin" && data.users.filter((item) => item.role === "admin").length <= 1) {
              showMessage("Admin requerido", "Debe existir al menos un usuario administrador.");
              return;
            }
            const nextData = appendAudit({ ...data, users: data.users.filter((item) => item.id !== user.id), deletedIds: { ...(data.deletedIds || {}), users: Array.from(new Set([...(data.deletedIds?.users || []), user.id])) } }, currentUser, "USER_DELETED", "user", user.id, `Usuario eliminado: ${user.name}`);
            await persist(nextData);
            await syncPatchToBackend(data.backendUrl, backendToken, { baseData: data, deletions: { users: [user.id] }, auditLogs: nextData.auditLogs.slice(0, 1) }, "Usuario eliminado pendiente de sincronizar", nextData, persist);
            showMessage("Usuario eliminado", "El usuario se elimino con exito.");
            })();
          })}
        />
      ))}
      {visibleUsers.length < filteredUsers.length ? <LoadMoreButton label="Cargar mas usuarios" onPress={() => setVisibleUserCount((count) => count + LIST_BATCH_SIZE)} /> : null}
    </CrudSection>
  );
}

function ReportsView({ data, onReport }: { data: AppData; onReport: (value: string) => void }) {
  const now = new Date();
  const establishmentOptions = normalizedEstablishments(data.issuer);
  const [establishmentFilter, setEstablishmentFilter] = useState(activeScopeId(data));
  const reportData = useMemo(() => establishmentFilter === "all" ? data : scopedReportData(data, establishmentFilter), [data, establishmentFilter]);
  const currentYear = String(new Date().getFullYear());
  const availableYears = Array.from(new Set([
    currentYear,
    ...reportData.sales.map((sale) => String(new Date(sale.createdAt).getFullYear())),
    ...(reportData.receivedRetentions || []).map((retention) => String(new Date(retention.receivedAt).getFullYear()))
  ])).sort((a, b) => Number(b) - Number(a));
  const [periodType, setPeriodType] = useState("monthly");
  const [year, setYear] = useState(availableYears[0] || currentYear);
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [semester, setSemester] = useState("1");
  const [startDate, setStartDate] = useState(toInputDate(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [endDate, setEndDate] = useState(toInputDate(now));
  const [reportType, setReportType] = useState("tax");
  const [documentFilter, setDocumentFilter] = useState("all");
  const [visibleReportSaleCount, setVisibleReportSaleCount] = useState(LIST_BATCH_SIZE);

  const report = useMemo(() => buildSalesReport(reportData, periodType, year, month, semester, startDate, endDate, reportType, documentFilter), [reportData, periodType, year, month, semester, startDate, endDate, reportType, documentFilter]);
  const visibleReportSales = report.sales.slice(0, visibleReportSaleCount);

  useEffect(() => {
    setVisibleReportSaleCount(LIST_BATCH_SIZE);
  }, [documentFilter, endDate, month, periodType, reportType, semester, startDate, year]);

  const exportPdf = async () => {
    const html = buildReportHtml(report, reportData);
    if (Platform.OS === "web") {
      openHtmlViewer(html, `Reporte ${report.label}`);
      return;
    }

    await handlePdfDocument(html, `Reporte ${report.label}`, "Reporte PDF");
  };

  const exportExcel = async () => {
    const excelHtml = buildReportExcelHtml(report, reportData);
    const fileName = `reporte-ventas-${sanitizeFileName(report.label)}.xls`;

    if (Platform.OS === "web") {
      const blob = new Blob([`\uFEFF${excelHtml}`], { type: "application/vnd.ms-excel;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      showMessage("Excel generado", "El archivo Excel se descargo con exito.");
      return;
    }

    const htmlFileName = fileName.replace(/\.xls$/i, ".html");
    const html = buildMobileReportHtml(report, reportData);
    const uri = `${FileSystem.cacheDirectory || FileSystem.documentDirectory}${htmlFileName}`;
    await FileSystem.writeAsStringAsync(uri, html, { encoding: FileSystem.EncodingType.UTF8 });
    Alert.alert("Reporte listo", "En movil se genera una vista HTML con tablas para revisar y compartir mejor.", [
      {
        text: "Ver resumen",
        onPress: () => onReport(formatSalesReport(report))
      },
      {
        text: "Enviar/guardar",
        onPress: () => {
          void shareGeneratedFile(uri, "text/html", "Exportar reporte", "Reporte generado");
        }
      },
      { text: "Cerrar", style: "cancel" }
    ]);
  };

  return (
    <View style={styles.stack}>
      <Section title="Reporte contable">
        <Text style={styles.paragraph}>El reporte tributario es para declaraciones: solo facturas autorizadas. El reporte operativo permite revisar todos los documentos, solo facturas o solo notas de venta.</Text>
        <Select
          label="Establecimiento"
          value={establishmentFilter}
          onChange={setEstablishmentFilter}
          options={[
            { label: "Toda la empresa", value: "all" },
            ...establishmentOptions.map((item) => ({ label: `${item.name} ${item.establishment}-${item.emissionPoint}`, value: item.id }))
          ]}
        />
        <Select
          label="Tipo de reporte"
          value={reportType}
          onChange={setReportType}
          options={[
            { label: "Tributario / contador", value: "tax" },
            { label: "Operativo / todos los movimientos", value: "operational" }
          ]}
        />
        {reportType === "operational" ? (
          <Select
            label="Documentos"
            value={documentFilter}
            onChange={setDocumentFilter}
            options={[
              { label: "Todos", value: "all" },
              { label: "Solo facturas", value: "factura" },
              { label: "Solo notas credito", value: "nota_credito" },
              { label: "Solo notas de venta", value: "nota_venta" },
              { label: "Solo proformas", value: "proforma" }
            ]}
          />
        ) : null}
        <Select
          label="Periodo"
          value={periodType}
          onChange={setPeriodType}
          options={[
            { label: "Mensual", value: "monthly" },
            { label: "Semestral", value: "semester" },
            { label: "Anual", value: "annual" },
            { label: "Rango fechas", value: "custom" }
          ]}
        />
        {periodType !== "custom" ? <Select label="Anio" value={year} onChange={setYear} options={availableYears.map((item) => ({ label: item, value: item }))} /> : null}
        {periodType === "monthly" ? <Select label="Mes" value={month} onChange={setMonth} options={monthOptions} /> : null}
        {periodType === "semester" ? (
          <Select
            label="Semestre"
            value={semester}
            onChange={setSemester}
            options={[
              { label: "Enero - Junio", value: "1" },
              { label: "Julio - Diciembre", value: "2" }
            ]}
          />
        ) : null}
        {periodType === "custom" ? (
          <View style={styles.row}>
            <View style={styles.flex}>
              <CalendarDateInput label="Fecha inicio" value={startDate} onChange={setStartDate} />
            </View>
            <View style={styles.flex}>
              <CalendarDateInput label="Fecha fin" value={endDate} onChange={setEndDate} />
            </View>
          </View>
        ) : null}
        <View style={styles.statsGrid}>
          <StatBox label="Documentos" value={String(report.sales.length)} />
          <StatBox label="Con valor" value={String(report.effectiveCount)} />
          <StatBox label="Autorizadas" value={String(report.authorizedCount)} />
          <StatBox label="Notas credito" value={String(report.creditNoteCount)} />
          <StatBox label="Notas venta" value={String(report.internalCount)} />
          <StatBox label="Proformas" value={String(report.proformaCount)} />
          <StatBox label="Anuladas" value={String(report.voidedCount)} />
          <StatBox label="Rechazadas" value={String(report.rejectedCount)} />
          <StatBox label="Subtotal 15%" value={`$${money(report.subtotal15)}`} />
          <StatBox label="Subtotal 0%" value={`$${money(report.subtotal0)}`} />
          <StatBox label="Descuentos" value={`$${money(report.discount)}`} />
          <StatBox label="IVA 15%" value={`$${money(report.iva15)}`} />
          <StatBox label="Subtotal" value={`$${money(report.subtotal)}`} />
          <StatBox label="Costo" value={`$${money(report.cost)}`} />
          <StatBox label="Utilidad" value={`$${money(report.profit)}`} />
          <StatBox label="Total ventas" value={`$${money(report.total)}`} />
          <StatBox label="Ret. IVA" value={`$${money(report.retentionIva)}`} />
          <StatBox label="Ret. fuente" value={`$${money(report.retentionRenta)}`} />
          <StatBox label="Neto ret." value={`$${money(report.netCollected)}`} />
          <StatBox label="104 gravado" value={`$${money(report.iva104.salesVatNet)}`} />
          <StatBox label="104 IVA neto" value={`$${money(report.iva104.ivaGeneratedNet)}`} />
          <StatBox label="104 a pagar" value={`$${money(report.iva104.estimatedIvaPayable)}`} />
        </View>
        <PrimaryButton label="Vista contable" onPress={() => onReport(formatSalesReport(report))} />
        <PrimaryButton label="Vista IVA 104" onPress={() => onReport(formatIva104Report(report))} />
        <View style={styles.row}>
          <View style={styles.flex}>
            <PrimaryButton label="Ver PDF" onPress={exportPdf} />
          </View>
          <View style={styles.flex}>
            <PrimaryButton label="Excel / guardar" onPress={exportExcel} />
          </View>
        </View>
      </Section>

      <Section title="Resumen tributario">
        <ReportRow label="Periodo" value={report.label} />
        <ReportRow label="Tipo de reporte" value={report.reportType === "tax" ? "Tributario / contador" : "Operativo"} />
        <ReportRow label="Documentos del periodo" value={String(report.sales.length)} />
        <ReportRow label="Documentos con valor" value={String(report.effectiveCount)} />
        <ReportRow label="Facturas autorizadas" value={String(report.authorizedCount)} />
        <ReportRow label="Notas de credito" value={String(report.creditNoteCount)} />
        <ReportRow label="Notas de venta" value={String(report.internalCount)} />
        <ReportRow label="Proformas" value={String(report.proformaCount)} />
        <ReportRow label="Anuladas / sin efecto tributario" value={String(report.voidedCount)} />
        <ReportRow label="Rechazadas" value={String(report.rejectedCount)} />
        <ReportRow label="Subtotal gravado 15%" value={`$${money(report.subtotal15)}`} />
        <ReportRow label="Subtotal tarifa 0%" value={`$${money(report.subtotal0)}`} />
        <ReportRow label="Total descuentos" value={`$${money(report.discount)}`} />
        <ReportRow label="Subtotal no objeto de IVA" value="$0.00" />
        <ReportRow label="Subtotal exento de IVA" value="$0.00" />
        <ReportRow label="Total sin impuestos" value={`$${money(report.subtotal)}`} />
        <ReportRow label="IVA causado" value={`$${money(report.iva15)}`} />
        <ReportRow label="Total facturado" value={`$${money(report.total)}`} />
        <ReportRow label="Retenciones IVA recibidas" value={`$${money(report.retentionIva)}`} />
        <ReportRow label="Retenciones fuente recibidas" value={`$${money(report.retentionRenta)}`} />
        <ReportRow label="Neto despues de retenciones" value={`$${money(report.netCollected)}`} strong />
      </Section>

      <Section title="Resumen IVA / Formulario 104">
        <ReportRow label="Ventas tarifa diferente de cero - bruto" value={`$${money(report.iva104.salesVatGross)}`} />
        <ReportRow label="Notas de credito tarifa diferente de cero" value={`$${money(report.iva104.creditVat)}`} />
        <ReportRow label="Ventas tarifa diferente de cero - neto" value={`$${money(report.iva104.salesVatNet)}`} />
        <ReportRow label="Ventas tarifa 0% - bruto" value={`$${money(report.iva104.salesZeroGross)}`} />
        <ReportRow label="Notas de credito tarifa 0%" value={`$${money(report.iva104.creditZero)}`} />
        <ReportRow label="Ventas tarifa 0% - neto" value={`$${money(report.iva104.salesZeroNet)}`} />
        <ReportRow label="IVA generado bruto" value={`$${money(report.iva104.ivaGeneratedGross)}`} />
        <ReportRow label="IVA notas de credito" value={`$${money(report.iva104.ivaCreditNotes)}`} />
        <ReportRow label="IVA generado neto" value={`$${money(report.iva104.ivaGeneratedNet)}`} />
        <ReportRow label="Retenciones IVA recibidas" value={`$${money(report.iva104.retentionIva)}`} />
        <ReportRow label="IVA estimado a pagar" value={`$${money(report.iva104.estimatedIvaPayable)}`} strong />
        <Text style={styles.paragraph}>Resumen preparado con ventas, notas de credito y retenciones recibidas. No incluye compras, credito tributario anterior, activos fijos, importaciones, ajustes, intereses ni multas.</Text>
      </Section>

      <Section title="Facturas del periodo">
        {report.sales.length === 0 ? <Empty text="No hay facturas en este periodo." /> : null}
        {visibleReportSales.map((sale) => {
          const client = reportData.clients.find((item) => item.id === sale.clientId);
          return (
            <ListItem
              key={sale.id}
              title={`${documentNumber(sale, data.issuer)} - ${client?.name ?? "Cliente"}`}
              meta={`${documentTypeLabel(sale)} | ${formatShortDate(sale.createdAt)} | Base $${accountingMoney(sale, sale.subtotal)} | IVA $${accountingMoney(sale, sale.tax)} | Total $${accountingMoney(sale, sale.total)} | Util. $${money(saleProfitValue(sale, reportData.products))}${sale.voidReason ? ` | ${sale.voidReason}` : ""}`}
              badge={sale.status}
            />
          );
        })}
        {visibleReportSales.length < report.sales.length ? <LoadMoreButton label="Cargar mas facturas" onPress={() => setVisibleReportSaleCount((count) => count + LIST_BATCH_SIZE)} /> : null}
      </Section>
    </View>
  );
}

function ReportRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.reportRow}>
      <Text style={[styles.reportLabel, strong && styles.reportStrong]}>{label}</Text>
      <Text style={[styles.reportValue, strong && styles.reportStrong]}>{value}</Text>
    </View>
  );
}

function formatBackendHealth(health: BackendHealthResponse, backendUrl: string, expectedEnv: string, envMatches: boolean) {
  return [
    "DIAGNOSTICO BACKEND SRI",
    `URL: ${backendUrl.replace(/\/$/, "")}`,
    `Servicio: ${health.service || "desconocido"}`,
    `Backend responde: ${health.ok ? "SI" : "NO"}`,
    `Ambiente backend: ${health.sriEnv || "desconocido"}`,
    `Ambiente app esperado: ${expectedEnv}`,
    `Ambientes coinciden: ${envMatches ? "SI" : "NO"}`,
    `Base de datos: ${health.database?.engine || "desconocida"}`,
    `Ruta/host DB: ${health.database?.path || "desconocido"}`,
    `Autenticacion JWT: ${health.authRequired === false ? "INACTIVA" : "ACTIVA"}`,
    `Licencia backend: ${health.license?.active ? "ACTIVA" : "NO ACTIVA"}${health.license?.plan ? ` | ${health.license.plan}` : ""}${health.license?.expiresAt ? ` | vence ${health.license.expiresAt}` : ""}`,
    `Logs tecnicos: ${health.technicalLogs?.enabled === false ? "INACTIVOS" : "ACTIVOS"}${health.technicalLogs?.retentionDays ? ` (${health.technicalLogs.retentionDays} dias)` : ""}`,
    `Envio real al SRI: ${health.allowSriSend ? "ACTIVO" : "DESACTIVADO"}`,
    `TLS flexible SRI: ${health.sriAllowInsecureTls ? "ACTIVO" : "DESACTIVADO"}`,
    `Certificado existe: ${health.certExists ? "SI" : "NO"}`,
    `Clave certificado configurada: ${health.certConfigured ? "SI" : "NO"}`,
    "",
    envMatches
      ? "Listo para firmar/enviar con esta configuracion."
      : "El ambiente de la app no coincide con el backend. Ajuste Ambiente en la app o SRI_ENV en backend/.env."
  ].join("\n");
}

function buildSupportDiagnostic(data: AppData, user: User | null, state: SyncState, health?: BackendHealthResponse, logs: TechnicalLog[] = [], connectionError = "") {
  const current = activeEstablishment(data.issuer);
  const summary = summarizeAppData(data);
  const pending = data.pendingSync || [];
  const logLines = logs.slice(0, 5).map((log) => {
    const pieces = [
      log.time ? formatAuditDate(log.time) : "",
      log.level ? String(log.level).toUpperCase() : "",
      log.method && log.path ? `${log.method} ${log.path}` : log.event || "",
      log.statusCode ? `HTTP ${log.statusCode}` : "",
      log.message || ""
    ].filter(Boolean);
    return `- ${shortText(pieces.join(" | "), 180)}`;
  });

  return [
    "DIAGNOSTICO FACTUDARWIN",
    `Fecha: ${formatAuditDate(new Date().toISOString())}`,
    `Usuario: ${user?.name || "sin sesion"}${user?.role ? ` | ${roleLabel(user.role)}` : ""}`,
    `Empresa: ${data.issuer.businessName || data.issuer.tradeName || "sin nombre"}`,
    `RUC: ${data.issuer.ruc || "sin RUC"}`,
    `Punto activo: ${current.name} ${current.establishment}-${current.emissionPoint}`,
    `Licencia: ${licenseStatusLabel(data.license)}`,
    "",
    "SINCRONIZACION",
    `Estado: ${formatSyncStatus(state, data)}`,
    `Pendientes: ${pending.length}`,
    `Respaldo automatico: ${data.autoBackupEnabled === false ? "NO" : "SI"}`,
    `Ultima subida: ${data.autoBackupLastAt ? formatAuditDate(data.autoBackupLastAt) : "sin registro"}`,
    `Ultimo error: ${data.autoBackupLastError || "sin error"}`,
    `Servidor: ${data.backendUrl || "sin URL"}`,
    "",
    "RESUMEN LOCAL",
    formatBackupSummary(summary),
    data.historyPolicy?.mode ? `Politica historial local: ${data.historyPolicy.mode}${data.historyPolicy.compactedAt ? ` | compactado ${formatAuditDate(data.historyPolicy.compactedAt)}` : ""}` : "",
    "",
    "BACKEND",
    connectionError ? `Conexion: ERROR | ${connectionError}` : health ? `Conexion: OK | ${health.service || "servicio"} | DB ${health.database?.engine || "desconocida"}` : "Conexion: no probada",
    health?.license ? `Licencia backend: ${health.license.active ? "ACTIVA" : "NO ACTIVA"}${health.license.plan ? ` | ${health.license.plan}` : ""}` : "",
    health?.technicalLogs ? `Logs tecnicos: ${health.technicalLogs.enabled === false ? "INACTIVOS" : "ACTIVOS"}` : "",
    "",
    "PENDIENTES DETALLE",
    pending.length ? pending.slice(0, 10).map((item) => `- ${item.title} | ${formatAuditDate(item.createdAt)} | intentos ${item.attempts}${item.lastError ? ` | ${shortText(item.lastError, 120)}` : ""}`).join("\n") : "Sin pendientes.",
    "",
    "LOGS RECIENTES",
    logLines.length ? logLines.join("\n") : "Sin logs cargados desde soporte."
  ].filter((line) => line !== "").join("\n");
}

function summarizeAppData(data: AppData): BackupSummary {
  return {
    users: data.users.length,
    clients: data.clients.length,
    products: data.products.length,
    sales: data.sales.length,
    guides: (data.guides || []).length,
    receivedRetentions: (data.receivedRetentions || []).length,
    inventoryMovements: (data.inventoryMovements || []).length,
    auditLogs: (data.auditLogs || []).length,
    cashClosings: (data.cashClosings || []).length,
    pendingSync: (data.pendingSync || []).length
  };
}

function formatBackupSummary(summary: BackupSummary | undefined) {
  if (!summary) return "Sin resumen disponible.";

  return [
    `Usuarios: ${summary.users}`,
    `Clientes: ${summary.clients}`,
    `Productos: ${summary.products}`,
    `Ventas/documentos: ${summary.sales}`,
    `Guias: ${summary.guides}`,
    `Retenciones recibidas: ${summary.receivedRetentions}`,
    `Movimientos inventario: ${summary.inventoryMovements}`,
    `Cierres caja: ${summary.cashClosings || 0}`,
    `Auditoria app: ${summary.auditLogs}`,
    summary.pendingSync ? `Pendientes sync: ${summary.pendingSync}` : "",
    summary.historyCount !== undefined ? `Historial backend: ${summary.historyCount} respaldo(s)` : "",
    summary.prunedHistory ? `Eliminados por antiguedad: ${summary.prunedHistory}` : ""
  ].filter((line) => line !== "").join("\n");
}

function mergeAppDataSnapshots(remoteData: AppData, localData: AppData): AppData {
  const sameSequenceScope = sameIssuerSequenceScope(remoteData.issuer, localData.issuer);
  return sanitizeAppData({
    ...remoteData,
    ...localData,
    issuer: {
      ...remoteData.issuer,
      ...localData.issuer,
      establishments: mergeIssuerEstablishments(remoteData.issuer, localData.issuer),
      establishmentsUpdatedAt: newerTimestamp(remoteData.issuer?.establishmentsUpdatedAt, localData.issuer?.establishmentsUpdatedAt),
      sequential: mergeIssuerSequence(remoteData.issuer?.sequential, localData.issuer?.sequential, sameSequenceScope),
      remissionSequential: mergeIssuerSequence(remoteData.issuer?.remissionSequential, localData.issuer?.remissionSequential, sameSequenceScope),
      creditNoteSequential: mergeIssuerSequence(remoteData.issuer?.creditNoteSequential, localData.issuer?.creditNoteSequential, sameSequenceScope)
    },
    users: mergeById(remoteData.users || [], localData.users || []),
    clients: mergeByLatestUpdatedAt(remoteData.clients || [], localData.clients || []),
    products: mergeByLatestUpdatedAt(remoteData.products || [], localData.products || []),
    sales: prependUniqueById(remoteData.sales || [], localData.sales || []),
    guides: prependUniqueById(remoteData.guides || [], localData.guides || []),
    receivedRetentions: prependUniqueById(remoteData.receivedRetentions || [], localData.receivedRetentions || []),
    cashClosings: prependUniqueById(remoteData.cashClosings || [], localData.cashClosings || []),
    inventoryMovements: prependUniqueById(remoteData.inventoryMovements || [], localData.inventoryMovements || []),
    auditLogs: prependUniqueById(remoteData.auditLogs || [], localData.auditLogs || []),
    backendUrl: localData.backendUrl || remoteData.backendUrl,
    autoBackupEnabled: localData.autoBackupEnabled,
    autoBackupLastAt: localData.autoBackupLastAt || remoteData.autoBackupLastAt || "",
    autoBackupLastError: localData.autoBackupLastError || "",
    pendingSync: localData.pendingSync || [],
    deletedIds: mergeDeletedIds(remoteData.deletedIds, localData.deletedIds),
    historyPolicy: remoteData.historyPolicy || localData.historyPolicy
  });
}

function mergeDeletedIds(remoteDeleted?: AppData["deletedIds"], localDeleted?: AppData["deletedIds"]) {
  return {
    clients: Array.from(new Set([...(remoteDeleted?.clients || []), ...(localDeleted?.clients || [])])),
    products: Array.from(new Set([...(remoteDeleted?.products || []), ...(localDeleted?.products || [])])),
    users: Array.from(new Set([...(remoteDeleted?.users || []), ...(localDeleted?.users || [])]))
  };
}

function sameIssuerSequenceScope(remoteIssuer?: Partial<Issuer>, localIssuer?: Partial<Issuer>) {
  return String(remoteIssuer?.environment || "1") === String(localIssuer?.environment || "1")
    && String(remoteIssuer?.establishment || "") === String(localIssuer?.establishment || "")
    && String(remoteIssuer?.emissionPoint || "") === String(localIssuer?.emissionPoint || "");
}

function mergeIssuerSequence(remoteValue: unknown, localValue: unknown, sameSequenceScope: boolean) {
  const localSequence = Number(localValue || 1);
  if (!sameSequenceScope) return localSequence;
  return Math.max(Number(remoteValue || 1), localSequence);
}

function mergeIssuerEstablishments(remoteIssuer?: Issuer, localIssuer?: Issuer) {
  const localIssuerTime = timestampOf(localIssuer?.establishmentsUpdatedAt);
  const remoteIssuerTime = timestampOf(remoteIssuer?.establishmentsUpdatedAt);
  if (localIssuerTime !== remoteIssuerTime) {
    return normalizedEstablishments((localIssuerTime > remoteIssuerTime ? localIssuer : remoteIssuer) || initialData.issuer);
  }
  const byId = new Map<string, IssuerEstablishment>();
  normalizedEstablishments(remoteIssuer || initialData.issuer).forEach((item) => byId.set(item.id, item));
  normalizedEstablishments(localIssuer || initialData.issuer).forEach((item) => {
    const previous = byId.get(item.id);
    if (!previous) {
      byId.set(item.id, item);
      return;
    }
    const localTime = timestampOf(item.updatedAt);
    const remoteTime = timestampOf(previous.updatedAt);
    const localWinsStatus = localTime >= remoteTime;
    byId.set(item.id, {
      ...previous,
      ...item,
      active: localWinsStatus ? item.active !== false : previous.active !== false,
      updatedAt: localTime >= remoteTime ? item.updatedAt : previous.updatedAt,
      sequential: Math.max(previous.sequential || 1, item.sequential || 1),
      remissionSequential: Math.max(previous.remissionSequential || 1, item.remissionSequential || 1),
      creditNoteSequential: Math.max(previous.creditNoteSequential || 1, item.creditNoteSequential || 1)
    });
  });
  return Array.from(byId.values());
}

function newerTimestamp(first?: string, second?: string) {
  return timestampOf(second) >= timestampOf(first) ? second || first || "" : first || second || "";
}

function addedEstablishmentIds(previousIssuer: Issuer, nextIssuer: Issuer) {
  const previousIds = new Set(normalizedEstablishments(previousIssuer).map((item) => item.id));
  return normalizedEstablishments(nextIssuer)
    .map((item) => item.id)
    .filter((id) => !previousIds.has(id));
}

function mergeById<T extends { id: string }>(remoteItems: T[], localItems: T[]) {
  const byId = new Map<string, T>();
  remoteItems.forEach((item) => byId.set(item.id, item));
  localItems.forEach((item) => byId.set(item.id, item));
  return Array.from(byId.values());
}

function mergeByLatestUpdatedAt<T extends { id: string; updatedAt?: string }>(remoteItems: T[], localItems: T[]) {
  const byId = new Map<string, T>();
  remoteItems.forEach((item) => byId.set(item.id, item));
  localItems.forEach((item) => {
    const previous = byId.get(item.id);
    if (!previous || timestampOf(item.updatedAt) >= timestampOf(previous.updatedAt)) {
      byId.set(item.id, item);
    }
  });
  return Array.from(byId.values());
}

function applyIdentityToIssuer(issuer: Issuer, result: IdentityLookupResponse): Issuer {
  const establishments = normalizedEstablishments(issuer);
  const active = activeEstablishment(issuer);
  const firstRemote = Array.isArray(result.establishments) ? result.establishments.find((item) => item.establishment) : undefined;
  const nextActive: IssuerEstablishment = {
    ...active,
    name: firstRemote?.tradeName || result.tradeName || active.name,
    address: firstRemote?.address || result.address || active.address || issuer.address
  };
  const nextIssuer = issuerWithEstablishment({
    ...issuer,
    ruc: result.identification || issuer.ruc,
    businessName: result.businessName || result.name || issuer.businessName,
    tradeName: result.tradeName || result.businessName || result.name || issuer.tradeName,
    address: result.address || issuer.address,
    taxpayerType: result.taxpayerType || issuer.taxpayerType,
    accountingRequired: result.accountingRequired || issuer.accountingRequired,
    specialTaxpayer: result.specialTaxpayer || issuer.specialTaxpayer,
    establishments: establishments.map((item) => item.id === active.id ? nextActive : item),
    activeEstablishmentId: active.id
  }, nextActive);
  return { ...nextIssuer, establishments: normalizedEstablishments(nextIssuer) };
}

function timestampOf(value?: string) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function prependUniqueById<T extends { id: string }>(remoteItems: T[], localItems: T[]) {
  const seen = new Set<string>();
  const result: T[] = [];
  [...localItems, ...remoteItems].forEach((item) => {
    if (!item?.id || seen.has(item.id)) return;
    seen.add(item.id);
    result.push(item);
  });
  return result;
}

function formatAuditDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return `${formatShortDate(value)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatTechnicalLogMeta(log: TechnicalLog) {
  return [
    log.time ? formatAuditDate(log.time) : "",
    log.method && log.path ? `${log.method} ${log.path}` : "",
    log.statusCode ? `HTTP ${log.statusCode}` : "",
    log.durationMs !== undefined ? `${log.durationMs}ms` : "",
    log.user?.email ? `${log.user.email} (${log.user.role || "rol"})` : "",
    log.message ? shortText(log.message, 120) : "",
    log.body ? shortText(JSON.stringify(log.body), 160) : ""
  ].filter(Boolean).join(" | ");
}

function SriView({ data, user, backendToken, getBackendToken, persist, onRefreshBackend }: { data: AppData; user: User; backendToken: string; getBackendToken: (backendUrl: string) => Promise<string>; persist: (data: AppData) => Promise<void>; onRefreshBackend: () => void }) {
  const [issuer, setIssuer] = useState(data.issuer);
  const [license, setLicense] = useState<AppLicense>(data.license || initialData.license!);
  const [sequentialText, setSequentialText] = useState(String(data.issuer.sequential));
  const [remissionSequentialText, setRemissionSequentialText] = useState(String(data.issuer.remissionSequential || 1));
  const [creditNoteSequentialText, setCreditNoteSequentialText] = useState(String(data.issuer.creditNoteSequential || 1));
  const [establishmentNameText, setEstablishmentNameText] = useState("");
  const [establishmentCodeText, setEstablishmentCodeText] = useState(data.issuer.establishment || "001");
  const [emissionPointText, setEmissionPointText] = useState(data.issuer.emissionPoint || "001");
  const [backendUrl, setBackendUrl] = useState(data.backendUrl);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(data.autoBackupEnabled !== false);
  const [syncing, setSyncing] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [lookingUpIssuer, setLookingUpIssuer] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [connectionResult, setConnectionResult] = useState("");
  const [loadingTechnicalLogs, setLoadingTechnicalLogs] = useState(false);
  const [technicalLogs, setTechnicalLogs] = useState<TechnicalLog[]>([]);
  const [assetStatus, setAssetStatus] = useState("");
  const [assetStatusTone, setAssetStatusTone] = useState<"info" | "success" | "error">("info");
  const [establishmentStatus, setEstablishmentStatus] = useState<{ tone: "info" | "success" | "error"; message: string } | null>(null);
  const [establishmentModalVisible, setEstablishmentModalVisible] = useState(false);
  const [deleteEstablishmentModalVisible, setDeleteEstablishmentModalVisible] = useState(false);
  const [proEstablishmentModalVisible, setProEstablishmentModalVisible] = useState(false);
  const [planUpgradeMessage, setPlanUpgradeMessage] = useState("");
  const [deleteEstablishmentConfirmText, setDeleteEstablishmentConfirmText] = useState("");
  const [deletingEstablishment, setDeletingEstablishment] = useState(false);
  const [establishmentForm, setEstablishmentForm] = useState({
    name: "",
    establishment: "",
    emissionPoint: "001",
    address: "",
    sequential: "1",
    remissionSequential: "1",
    creditNoteSequential: "1"
  });
  const [certificatePassword, setCertificatePassword] = useState("");
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const productionChecklist = useMemo(() => buildProductionChecklist({ ...issuer, sequential: Number(sequentialText), remissionSequential: Number(remissionSequentialText), creditNoteSequential: Number(creditNoteSequentialText) }, backendUrl, connectionResult), [backendUrl, connectionResult, creditNoteSequentialText, issuer, remissionSequentialText, sequentialText]);
  const establishments = useMemo(() => editableEstablishments(issuer), [issuer]);
  const selectedEstablishment = establishments.find((item) => item.id === issuer.activeEstablishmentId && item.active)
    || establishments.find((item) => item.active)
    || establishments[0]
    || activeEstablishment(issuer);
  const canManageEstablishments = appLicenseStatus(license).active && maxEmissionPointsForLicense(license) > 1;
  const maxEmissionPoints = maxEmissionPointsForLicense(license);
  const [visibleAuditCount, setVisibleAuditCount] = useState(LIST_BATCH_SIZE);
  const auditLogs = data.auditLogs || [];
  const visibleAuditLogs = auditLogs.slice(0, visibleAuditCount);

  const openPlanUpgradeModal = (message?: string) => {
    setPlanUpgradeMessage(message || `Su plan actual permite ${maxEmissionPoints} punto(s) de emision. Active Pro para manejar sucursales, puntos adicionales y operacion multi punto.`);
    setProEstablishmentModalVisible(true);
  };

  useEffect(() => {
    if (!backendToken) return;
    void refreshAssetsStatus(false);
  }, [backendToken, backendUrl]);

  useEffect(() => {
    setEstablishmentNameText(selectedEstablishment.name);
    setEstablishmentCodeText(selectedEstablishment.establishment);
    setEmissionPointText(selectedEstablishment.emissionPoint);
  }, [selectedEstablishment.id]);

  const issuerFromForm = () => {
    const sequential = Number(sequentialText);
    const remissionSequential = Number(remissionSequentialText);
    const creditNoteSequential = Number(creditNoteSequentialText);
    const activeId = selectedEstablishment.id;
    const nextEstablishmentCode = normalizeThreeDigits(establishmentCodeText);
    const nextEmissionPointCode = normalizeThreeDigits(emissionPointText);
    const nextActiveId = `${nextEstablishmentCode}-${nextEmissionPointCode}`;
    const nextEstablishments = establishments.map((item) => item.id === activeId ? {
      ...item,
      name: establishmentNameText.trim(),
      address: issuer.address,
      establishment: nextEstablishmentCode,
      emissionPoint: nextEmissionPointCode,
      id: nextActiveId,
      sequential,
      remissionSequential,
      creditNoteSequential
    } : item);
    const active = nextEstablishments.find((item) => item.id === nextActiveId) || nextEstablishments.find((item) => item.id === activeId) || activeEstablishment(issuer);
    return issuerWithEstablishment({ ...issuer, establishments: nextEstablishments, activeEstablishmentId: active.id, establishmentsUpdatedAt: active.id !== activeId ? new Date().toISOString() : issuer.establishmentsUpdatedAt }, active);
  };

  const selectEstablishment = (id: string) => {
    const next = establishments.find((item) => item.id === id);
    if (!next) return;
    if (!canUseEmissionScope(issuer, license, id)) {
      const message = `Su plan actual permite ${maxEmissionPoints} punto(s) de emision. Actualice a Pro para usar ${id}.`;
      setEstablishmentStatus({ tone: "error", message });
      openPlanUpgradeModal(message);
      return;
    }
    const nextIssuer = issuerWithEstablishment({ ...issuer, establishments, activeEstablishmentId: next.id }, next);
    setIssuer(nextIssuer);
    setSequentialText(String(next.sequential));
    setRemissionSequentialText(String(next.remissionSequential || 1));
    setCreditNoteSequentialText(String(next.creditNoteSequential || 1));
    setEstablishmentNameText(next.name);
    setEstablishmentCodeText(next.establishment);
    setEmissionPointText(next.emissionPoint);
    setEstablishmentStatus({ tone: "info", message: `Editando ${next.name} ${next.establishment}-${next.emissionPoint}.` });
  };

  const openEstablishmentModal = () => {
    if (!canManageEstablishments) {
      openPlanUpgradeModal();
      return;
    }
    const nextNumber = String(establishments.length + 1).padStart(3, "0");
    setEstablishmentForm({
      name: `Sucursal ${establishments.length + 1}`,
      establishment: normalizeThreeDigits(nextNumber),
      emissionPoint: "001",
      address: issuer.address || "Ecuador",
      sequential: "1",
      remissionSequential: "1",
      creditNoteSequential: "1"
    });
    setEstablishmentModalVisible(true);
  };

  const saveNewEstablishment = async () => {
    if (!canManageEstablishments) {
      const message = "Agregar puntos de emision requiere plan Pro activo.";
      setEstablishmentStatus({ tone: "error", message });
      openPlanUpgradeModal(message);
      return;
    }
    if (establishments.filter((item) => item.active !== false).length >= maxEmissionPoints) {
      const message = `Su plan actual permite hasta ${maxEmissionPoints} punto(s) de emision.`;
      setEstablishmentStatus({ tone: "error", message });
      openPlanUpgradeModal(message);
      return;
    }
    const establishment = normalizeThreeDigits(establishmentForm.establishment);
    const emissionPoint = normalizeThreeDigits(establishmentForm.emissionPoint);
    const id = `${establishment}-${emissionPoint}`;
    if (establishments.some((item) => item.id === id)) {
      setEstablishmentStatus({ tone: "error", message: `Ya existe el establecimiento ${id}.` });
      Alert.alert("Establecimiento existente", `Ya existe ${id}. Use otro establecimiento o punto de emision.`);
      return;
    }
    const sequential = Number(establishmentForm.sequential);
    const remissionSequential = Number(establishmentForm.remissionSequential);
    const creditNoteSequential = Number(establishmentForm.creditNoteSequential);
    if (![sequential, remissionSequential, creditNoteSequential].every((value) => Number.isInteger(value) && value > 0)) {
      Alert.alert("Secuenciales invalidos", "Ingrese secuenciales enteros mayores a cero.");
      return;
    }
    const next: IssuerEstablishment = {
      id,
      name: establishmentForm.name.trim() || `Establecimiento ${id}`,
      establishment,
      emissionPoint,
      address: establishmentForm.address.trim() || issuer.address,
      sequential,
      remissionSequential,
      creditNoteSequential,
      active: true
    };
    const nextIssuer = issuerWithEstablishment({ ...issuer, establishments: [...establishments, next], activeEstablishmentId: id, establishmentsUpdatedAt: new Date().toISOString() }, next);
    await persist(appendAudit({ ...data, backendUrl, autoBackupEnabled, issuer: nextIssuer, license }, user, "ESTABLISHMENT_CREATED", "issuer", issuer.ruc, `Establecimiento ${id} creado`, { establishment, emissionPoint }));
    setIssuer(nextIssuer);
    setSequentialText(String(sequential));
    setRemissionSequentialText(String(remissionSequential));
    setCreditNoteSequentialText(String(creditNoteSequential));
    setEstablishmentModalVisible(false);
    setEstablishmentStatus({ tone: "success", message: `Establecimiento ${next.name} ${id} guardado correctamente.` });
    Alert.alert("Establecimiento guardado", `${next.name} ${id} quedo disponible para facturar.`);
  };

  const updateSelectedEstablishment = (patch: Partial<IssuerEstablishment>) => {
    if ((patch.establishment !== undefined || patch.emissionPoint !== undefined) && selectedEstablishmentDocumentCount > 0) {
      const message = `No se puede cambiar el codigo ${selectedEstablishment.id} porque tiene ${selectedEstablishmentDocumentCount} documento(s).`;
      setEstablishmentStatus({ tone: "error", message });
      Alert.alert("Punto protegido", message);
      return;
    }
    const baseId = selectedEstablishment.id;
    const nextEstablishment = patch.establishment !== undefined ? normalizeThreeDigits(patch.establishment) : selectedEstablishment.establishment;
    const nextEmissionPoint = patch.emissionPoint !== undefined ? normalizeThreeDigits(patch.emissionPoint) : selectedEstablishment.emissionPoint;
    const nextId = `${nextEstablishment}-${nextEmissionPoint}`;
    if (nextId !== baseId && establishments.some((item) => item.id === nextId)) {
      setEstablishmentStatus({ tone: "error", message: `Ya existe el establecimiento ${nextId}. Use otro codigo.` });
      return;
    }
    const nextEstablishments = establishments.map((item) => {
      if (item.id !== baseId) return item;
      return {
        ...item,
        ...patch,
        name: patch.name !== undefined ? patch.name : item.name,
        establishment: nextEstablishment,
        emissionPoint: nextEmissionPoint,
        id: nextId
      };
    });
    const nextActive = nextEstablishments.find((item) => item.id === nextId)
      || nextEstablishments.find((item) => item.id === baseId)
      || activeEstablishment(issuer);
    const nextIssuer = issuerWithEstablishment({ ...issuer, establishments: nextEstablishments, activeEstablishmentId: nextActive.id, establishmentsUpdatedAt: new Date().toISOString() }, nextActive);
    setIssuer(nextIssuer);
    setEstablishmentStatus({ tone: "info", message: "Cambios pendientes. Presione Guardar emisor para conservarlos." });
  };

  const selectedEstablishmentDocumentCount = useMemo(() => {
    const id = selectedEstablishment.id;
    return data.sales.filter((sale) => `${sale.establishment || ""}-${sale.emissionPoint || ""}` === id).length
      + (data.guides || []).filter((guide) => `${guide.establishment || ""}-${guide.emissionPoint || ""}` === id).length;
  }, [data.guides, data.sales, selectedEstablishment.id]);

  const requestDeleteSelectedEstablishment = () => {
    if (establishments.length <= 1) {
      setEstablishmentStatus({ tone: "error", message: "Debe existir al menos un establecimiento para facturar." });
      return;
    }
    if (selectedEstablishmentDocumentCount > 0) {
      const message = `No se puede eliminar ${selectedEstablishment.id} porque tiene ${selectedEstablishmentDocumentCount} documento(s). Se conserva para proteger secuenciales, reportes y auditoria.`;
      setEstablishmentStatus({ tone: "error", message });
      Alert.alert("Establecimiento protegido", message);
      return;
    }
    setDeleteEstablishmentConfirmText("");
    setDeleteEstablishmentModalVisible(true);
  };

  const confirmDeleteSelectedEstablishment = async () => {
    if (deletingEstablishment) return;
    if (deleteEstablishmentConfirmText.trim() !== selectedEstablishment.id) {
      setEstablishmentStatus({ tone: "error", message: `Para eliminar escriba exactamente ${selectedEstablishment.id}.` });
      return;
    }
    if (selectedEstablishmentDocumentCount > 0) {
      const message = `No se puede eliminar ${selectedEstablishment.id} porque ya tiene ${selectedEstablishmentDocumentCount} documento(s).`;
      setEstablishmentStatus({ tone: "error", message });
      Alert.alert("Establecimiento protegido", message);
      return;
    }

    const deleted = selectedEstablishment;
    const now = new Date().toISOString();
    const nextEstablishments = establishments
      .filter((item) => item.id !== selectedEstablishment.id)
      .map((item) => ({ ...item, updatedAt: item.updatedAt || now }));
    const next = nextEstablishments.find((item) => item.active !== false) || activeEstablishment(issuer);
    const nextIssuer = issuerWithEstablishment({ ...issuer, establishments: nextEstablishments, activeEstablishmentId: next.id, establishmentsUpdatedAt: now }, next);
    const nextData = appendAudit(
      { ...data, backendUrl, autoBackupEnabled, issuer: nextIssuer, license },
      user,
      "ESTABLISHMENT_DELETED",
      "issuer",
      deleted.id,
      `Establecimiento eliminado: ${deleted.name} ${deleted.id}`,
      { removedEstablishments: [deleted.id], establishmentsUpdatedAt: now }
    );

    setDeletingEstablishment(true);
    setEstablishmentStatus({ tone: "info", message: `Eliminando ${deleted.name} ${deleted.id}...` });
    try {
      await persist(nextData);
      await syncPatchToBackend(backendUrl, backendToken, { baseData: data, issuer: nextIssuer, auditLogs: nextData.auditLogs.slice(0, 1) }, "Eliminacion de establecimiento pendiente de sincronizar", nextData, persist);
      setIssuer(nextIssuer);
      setSequentialText(String(next.sequential));
      setRemissionSequentialText(String(next.remissionSequential || 1));
      setCreditNoteSequentialText(String(next.creditNoteSequential || 1));
      setDeleteEstablishmentModalVisible(false);
      setDeleteEstablishmentConfirmText("");
      const message = `${deleted.name} ${deleted.id} fue eliminado correctamente.`;
      setEstablishmentStatus({ tone: "success", message });
      Alert.alert("Establecimiento eliminado", message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo eliminar el establecimiento.";
      setEstablishmentStatus({ tone: "error", message });
      Alert.alert("No se pudo eliminar", message);
    } finally {
      setDeletingEstablishment(false);
    }
  };

  const save = async () => {
    const sequential = Number(sequentialText);
    const remissionSequential = Number(remissionSequentialText);
    const creditNoteSequential = Number(creditNoteSequentialText);
    const errors: string[] = [];
    const formEstablishment = normalizeThreeDigits(establishmentCodeText);
    const formEmissionPoint = normalizeThreeDigits(emissionPointText);
    validateIssuer({ ...issuer, establishment: formEstablishment, emissionPoint: formEmissionPoint, sequential, remissionSequential, creditNoteSequential }, backendUrl, errors);
    if (errors.length > 0) {
      showMessage("Revise configuracion SRI", errors.join("\n"));
      return;
    }
    if (!establishmentNameText.trim()) {
      showMessage("Nombre requerido", "Ingrese el nombre del establecimiento antes de guardar.");
      return;
    }
    if (!/^\d{1,3}$/.test(establishmentCodeText) || !/^\d{1,3}$/.test(emissionPointText)) {
      showMessage("Punto invalido", "Estab. y Pto. emi. deben tener entre 1 y 3 digitos.");
      return;
    }
    if (selectedEstablishmentDocumentCount > 0 && (formEstablishment !== selectedEstablishment.establishment || formEmissionPoint !== selectedEstablishment.emissionPoint)) {
      const message = `No se puede cambiar el codigo ${selectedEstablishment.id} porque tiene ${selectedEstablishmentDocumentCount} documento(s).`;
      setEstablishmentStatus({ tone: "error", message });
      Alert.alert("Punto protegido", message);
      return;
    }
    if (!Number.isInteger(sequential) || sequential <= 0) {
      showMessage("Secuencial invalido", "Ingrese el siguiente secuencial como numero entero mayor a cero.");
      return;
    }
    if (!Number.isInteger(remissionSequential) || remissionSequential <= 0) {
      showMessage("Secuencial guia invalido", "Ingrese el siguiente secuencial de guia como numero entero mayor a cero.");
      return;
    }
    if (!Number.isInteger(creditNoteSequential) || creditNoteSequential <= 0) {
      showMessage("Secuencial nota credito invalido", "Ingrese el siguiente secuencial de nota de credito como numero entero mayor a cero.");
      return;
    }
    const nextIssuer = issuerFromForm();
    const addedIds = addedEstablishmentIds(data.issuer, nextIssuer);
    const previousIdsForGuard = new Set(normalizedEstablishments(data.issuer).map((item) => item.id));
    const nextIdsForGuard = new Set(normalizedEstablishments(nextIssuer).map((item) => item.id));
    const removedIdsForGuard = Array.from(previousIdsForGuard).filter((id) => !nextIdsForGuard.has(id));
    const isActiveCodeReplacement = addedIds.length === 1 && removedIdsForGuard.length === 1 && removedIdsForGuard[0] === selectedEstablishment.id && selectedEstablishmentDocumentCount === 0;
    if (addedIds.length > 0 && !isActiveCodeReplacement) {
      const message = `Guardar emisor no puede crear puntos nuevos (${addedIds.join(", ")}). Use Agregar establecimiento para crear sucursales.`;
      setEstablishmentStatus({ tone: "error", message });
      Alert.alert("Creacion de punto bloqueada", message);
      return;
    }
    const activeEstablishmentCount = normalizedEstablishments(nextIssuer).filter((item) => item.active !== false).length;
    if (activeEstablishmentCount > maxEmissionPointsForLicense(license)) {
      const message = `Su plan actual permite ${maxEmissionPointsForLicense(license)} punto(s) de emision. Desactive puntos extra o actualice a Pro.`;
      setEstablishmentStatus({ tone: "error", message });
      openPlanUpgradeModal(message);
      return;
    }
    if (!canUseEmissionScope(nextIssuer, license, activeEstablishment(nextIssuer).id)) {
      const message = "El punto de emision activo no esta incluido en su plan actual.";
      setEstablishmentStatus({ tone: "error", message });
      openPlanUpgradeModal(message);
      return;
    }
    const ids = normalizedEstablishments(nextIssuer).map((item) => item.id);
    if (new Set(ids).size !== ids.length) {
      setEstablishmentStatus({ tone: "error", message: "Hay establecimientos duplicados. Revise estab. y punto de emision." });
      return;
    }
    const removedIds = removedIdsForGuard;
    const nextData = appendAudit({ ...data, backendUrl, autoBackupEnabled, issuer: nextIssuer, license }, user, "SRI_CONFIG_UPDATED", "issuer", issuer.ruc, "Configuracion SRI actualizada", { environment: issuer.environment, establishment: nextIssuer.establishment, emissionPoint: nextIssuer.emissionPoint, sequential, remissionSequential, creditNoteSequential, autoBackupEnabled, removedEstablishments: removedIds, establishmentsUpdatedAt: nextIssuer.establishmentsUpdatedAt });
    await persist(nextData);
    await syncPatchToBackend(data.backendUrl, backendToken, { baseData: data, issuer: nextIssuer, auditLogs: nextData.auditLogs.slice(0, 1) }, "Configuracion SRI pendiente de sincronizar", nextData, persist);
    setIssuer(nextIssuer);
    setSequentialText(String(sequential));
    setRemissionSequentialText(String(remissionSequential));
    setCreditNoteSequentialText(String(creditNoteSequential));
    setEstablishmentNameText(activeEstablishment(nextIssuer).name);
    setEstablishmentCodeText(nextIssuer.establishment);
    setEmissionPointText(nextIssuer.emissionPoint);
    if (removedIds.length > 0) {
      const message = `Establecimiento${removedIds.length > 1 ? "s" : ""} ${removedIds.join(", ")} eliminado${removedIds.length > 1 ? "s" : ""} correctamente.`;
      setEstablishmentStatus({ tone: "success", message });
      Alert.alert("Establecimiento eliminado", message);
      return;
    }
    setEstablishmentStatus({ tone: "success", message: `${selectedEstablishment.name} ${nextIssuer.establishment}-${nextIssuer.emissionPoint} guardado correctamente.` });
    Alert.alert("Configuracion guardada", "Los proximos comprobantes usaran estos datos.");
  };

  const backupData = async () => {
    setSyncing(true);
    try {
      const sequential = Number(sequentialText);
      const remissionSequential = Number(remissionSequentialText);
      const creditNoteSequential = Number(creditNoteSequentialText);
      const errors: string[] = [];
      validateIssuer({ ...issuer, sequential, remissionSequential, creditNoteSequential }, backendUrl, errors);
      if (errors.length > 0) {
        showMessage("Revise configuracion SRI", errors.join("\n"));
        return;
      }
      if (!Number.isInteger(sequential) || sequential <= 0) {
        showMessage("Secuencial invalido", "Ingrese el siguiente secuencial como numero entero mayor a cero.");
        return;
      }
      if (!Number.isInteger(remissionSequential) || remissionSequential <= 0) {
        showMessage("Secuencial guia invalido", "Ingrese el siguiente secuencial de guia como numero entero mayor a cero.");
        return;
      }
      if (!Number.isInteger(creditNoteSequential) || creditNoteSequential <= 0) {
        showMessage("Secuencial nota credito invalido", "Ingrese el siguiente secuencial de nota de credito como numero entero mayor a cero.");
        return;
      }
      const nextIssuer = issuerFromForm();
      const addedIds = addedEstablishmentIds(data.issuer, nextIssuer);
      if (addedIds.length > 0) {
        Alert.alert("Creacion de punto bloqueada", `Subir cambios no puede crear puntos nuevos (${addedIds.join(", ")}). Use Agregar establecimiento.`);
        return;
      }
      const nextData = { ...data, backendUrl, autoBackupEnabled, issuer: nextIssuer, license };
      const result = await backupAppData(backendUrl, nextData, backendToken);
      await persist(appendAudit(nextData, user, "BACKUP_CREATED", "backup", undefined, "Base respaldada en servidor"));
      Alert.alert("Respaldo guardado", [`Guardado: ${result.updatedAt}`, "", formatBackupSummary(result.summary || summarizeAppData(nextData))].join("\n"));
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo respaldar.";
      Alert.alert("Error de respaldo", message);
    } finally {
      setSyncing(false);
    }
  };

  const restoreData = async () => {
    setSyncing(true);
    try {
      const snapshot = await restoreAppData<AppData>(backendUrl, backendToken);
      if (!snapshot) {
        Alert.alert("Sin respaldo", "Todavia no hay datos guardados en el servidor.");
        return;
      }
      const restoreSummary = snapshot.summary || summarizeAppData(snapshot.data);
      const restoredData = sanitizeAppData({ ...snapshot.data, backendUrl, autoBackupEnabled });

      await persist(appendAudit(restoredData, user, "BACKUP_RESTORED", "backup", undefined, `Base restaurada desde ${snapshot.updatedAt}`));
      setIssuer(restoredData.issuer);
      setLicense(restoredData.license || initialData.license!);
      setSequentialText(String(restoredData.issuer.sequential));
      setRemissionSequentialText(String(restoredData.issuer.remissionSequential || 1));
      setCreditNoteSequentialText(String(restoredData.issuer.creditNoteSequential || 1));
      setBackendUrl(restoredData.backendUrl);
      setAutoBackupEnabled(restoredData.autoBackupEnabled !== false);
      Alert.alert("Base restaurada", [`Restaurado desde: ${snapshot.updatedAt}`, "", formatBackupSummary(restoreSummary)].join("\n"));
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo restaurar.";
      Alert.alert("Error de restauracion", message);
    } finally {
      setSyncing(false);
    }
  };

  const testConnection = async () => {
    setCheckingConnection(true);
    setConnectionResult("");

    try {
      const health = await checkBackendHealth(backendUrl);
      const expectedEnv = issuer.environment === "1" ? "test" : "production";
      const backendEnv = health.sriEnv || "desconocido";
      const envMatches = backendEnv === expectedEnv;
      const lines = formatBackendHealth(health, backendUrl, expectedEnv, envMatches);

      setConnectionResult(lines);
      Alert.alert(envMatches ? "Conexion OK" : "Revise ambiente", lines);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo probar la conexion.";
      setConnectionResult(`ERROR DE CONEXION\n${message}`);
      Alert.alert("Servidor no disponible", message);
    } finally {
      setCheckingConnection(false);
    }
  };

  const lookupIssuerRuc = async () => {
    const ruc = issuer.ruc.replace(/\D/g, "");
    if (!/^\d{13}$/.test(ruc)) {
      Alert.alert("RUC requerido", "Ingrese un RUC de 13 digitos para consultar.");
      return;
    }
    const savedRuc = data.issuer.ruc.replace(/\D/g, "");
    if (savedRuc && ruc === savedRuc) {
      const current = activeEstablishment(data.issuer);
      setIssuer(data.issuer);
      setSequentialText(String(data.issuer.sequential));
      setRemissionSequentialText(String(data.issuer.remissionSequential || 1));
      setCreditNoteSequentialText(String(data.issuer.creditNoteSequential || 1));
      setEstablishmentStatus({
        tone: "info",
        message: `Este RUC ya esta configurado para ${data.issuer.businessName}. No se consulto WebServices ni se creo otro establecimiento.`
      });
      Alert.alert("RUC ya configurado", `${data.issuer.businessName}\nEstablecimiento activo: ${current.establishment}-${current.emissionPoint}`);
      return;
    }
    setLookingUpIssuer(true);
    try {
      const token = backendToken || await getBackendToken(backendUrl);
      if (!token) {
        Alert.alert("Sesion requerida", "Inicie sesion con conexion al servidor para consultar datos del RUC.");
        return;
      }
      const result = await lookupIdentityData(backendUrl, ruc, token);
      const nextIssuer = applyIdentityToIssuer(issuer, result);
      setIssuer(nextIssuer);
      setEstablishmentStatus({
        tone: "success",
        message: `Datos encontrados: ${result.businessName || result.name || ruc}${result.status ? ` (${result.status})` : ""}.`
      });
      Alert.alert("RUC encontrado", `${result.businessName || result.name || ruc}\n${result.status ? `Estado: ${result.status}` : ""}`.trim());
    } catch (error) {
      setEstablishmentStatus({ tone: "error", message: error instanceof Error ? error.message : "No se pudo consultar el RUC." });
      Alert.alert("No se pudo consultar", error instanceof Error ? error.message : "Intente nuevamente.");
    } finally {
      setLookingUpIssuer(false);
    }
  };

  const testCompanyEmail = async () => {
    if (!issuer.email?.trim()) {
      Alert.alert("Correo requerido", "Ingrese y guarde un correo de contacto para la empresa.");
      return;
    }
    setTestingEmail(true);
    try {
      const result = await sendTestEmail(backendUrl, { to: issuer.email.trim() }, backendToken);
      Alert.alert("Correo probado", `Se envio una prueba a ${result.to || issuer.email}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo enviar el correo de prueba.";
      Alert.alert("Correo no disponible", message);
    } finally {
      setTestingEmail(false);
    }
  };

  const loadTechnicalLogs = async () => {
    setLoadingTechnicalLogs(true);
    try {
      const logs = await getTechnicalLogs(backendUrl, backendToken, 80);
      setTechnicalLogs(logs);
      if (logs.length === 0) {
        Alert.alert("Sin logs tecnicos", "Aun no hay eventos tecnicos registrados en el backend.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudieron cargar los logs tecnicos.";
      Alert.alert("Logs no disponibles", message);
    } finally {
      setLoadingTechnicalLogs(false);
    }
  };

  const refreshAssetsStatus = async (showAlert = true) => {
    try {
      const status = await getCompanyAssetsStatus(backendUrl, backendToken);
      const logoText = status.logo?.configured ? "Logo configurado" : "Logo pendiente";
      const certText = status.certificate?.configured ? `Certificado cargado${status.certificate.uploadedAt ? ` el ${formatShortDate(status.certificate.uploadedAt)}` : ""}` : "Certificado pendiente";
      setAssetStatus(`${logoText} | ${certText}`);
      setAssetStatusTone("info");
      if (showAlert) Alert.alert("Activos de empresa", `${logoText}\n${certText}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo consultar logo/certificado.";
      setAssetStatus(message);
      setAssetStatusTone("error");
      if (showAlert) Alert.alert("Activos no disponibles", message);
    }
  };

  const uploadLogoFromWeb = async () => {
    if (Platform.OS !== "web") {
      Alert.alert("Selector pendiente", "En movil agregaremos selector nativo de archivos. Por ahora use la version web para subir logo.");
      return;
    }
    let uploaded = false;
    try {
      setUploadingAsset(true);
      const file = await pickWebFile("image/png,image/jpeg,image/webp");
      if (!file) return;
      const base64 = await readWebFileBase64(file);
      const result = await uploadCompanyLogo(backendUrl, { fileName: file.name, mimeType: file.type || "image/png", base64 }, backendToken);
      uploaded = true;
      const nextIssuer = { ...issuer, logoUrl: result.logoUrl || "" };
      setIssuer(nextIssuer);
      await persist(appendAudit({ ...data, backendUrl, autoBackupEnabled, issuer: { ...nextIssuer, sequential: Number(sequentialText), remissionSequential: Number(remissionSequentialText), creditNoteSequential: Number(creditNoteSequentialText) } }, user, "COMPANY_LOGO_UPDATED", "issuer", issuer.ruc, "Logo RIDE actualizado"));
      setAssetStatus("Logo cargado y guardado para RIDE.");
      setAssetStatusTone("success");
      Alert.alert("Logo cargado", "El logo quedo guardado para los proximos RIDE.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Revise el archivo e intente nuevamente.";
      setAssetStatus(`Error al subir logo: ${message}`);
      setAssetStatusTone("error");
      Alert.alert("No se pudo subir logo", message);
    } finally {
      setUploadingAsset(false);
      if (uploaded) void refreshAssetsStatus(false);
    }
  };

  const uploadCertificateFromWeb = async () => {
    if (Platform.OS !== "web") {
      Alert.alert("Selector pendiente", "En movil agregaremos selector nativo de archivos. Por ahora use la version web para subir .p12.");
      return;
    }
    if (!certificatePassword) {
      Alert.alert("Clave requerida", "Ingrese la contrasena del certificado .p12.");
      return;
    }
    let uploaded = false;
    try {
      setUploadingAsset(true);
      const file = await pickWebFile(".p12,application/x-pkcs12");
      if (!file) return;
      const base64 = await readWebFileBase64(file);
      await uploadCompanyCertificate(backendUrl, { fileName: file.name, password: certificatePassword, base64 }, backendToken);
      uploaded = true;
      setCertificatePassword("");
      setAssetStatus("Certificado cargado y validado.");
      setAssetStatusTone("success");
      Alert.alert("Certificado listo", "El servidor valido el .p12. Las proximas emisiones usaran el certificado de esta empresa.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Revise el .p12 y la contrasena.";
      setAssetStatus(`Error al subir certificado: ${message}`);
      setAssetStatusTone("error");
      Alert.alert("No se pudo subir certificado", message);
    } finally {
      setUploadingAsset(false);
      if (uploaded) void refreshAssetsStatus(false);
    }
  };

  return (
    <View style={styles.stack}>
      <Section title="Emisor SRI">
        <Input
          label="RUC"
          value={issuer.ruc}
          onChangeText={(ruc) => setIssuer({ ...issuer, ruc })}
          keyboardType="number-pad"
          rightElement={<InlineInputButton label={lookingUpIssuer ? "..." : "Consultar"} onPress={() => { void lookupIssuerRuc(); }} />}
        />
        <Input label="Razon social" value={issuer.businessName} onChangeText={(businessName) => setIssuer({ ...issuer, businessName })} />
        <Input label="Nombre comercial" value={issuer.tradeName} onChangeText={(tradeName) => setIssuer({ ...issuer, tradeName })} />
        <Input label="Correo de contacto" value={issuer.email || ""} onChangeText={(email) => setIssuer({ ...issuer, email })} autoCapitalize="none" />
        <Input label="URL logo RIDE" value={issuer.logoUrl} onChangeText={(logoUrl) => setIssuer({ ...issuer, logoUrl })} autoCapitalize="none" />
        <Input label="Direccion matriz" value={issuer.address} onChangeText={(address) => setIssuer({ ...issuer, address })} />
        <Text style={styles.groupTitle}>Establecimiento activo</Text>
        <Select
          label="Sucursal / punto de emision"
          value={selectedEstablishment.id}
          onChange={(id) => selectEstablishment(id)}
          options={establishments.map((item) => ({ label: `${item.name} ${item.establishment}-${item.emissionPoint}`, value: item.id }))}
        />
        <Input label="Nombre establecimiento" value={establishmentNameText} onChangeText={setEstablishmentNameText} />
        <View style={styles.row}>
          <View style={styles.flex}>
            <Input label="Estab." value={establishmentCodeText} onChangeText={(value) => setEstablishmentCodeText(value.replace(/\D/g, "").slice(0, 3))} keyboardType="number-pad" />
          </View>
          <View style={styles.flex}>
            <Input label="Pto. emi." value={emissionPointText} onChangeText={(value) => setEmissionPointText(value.replace(/\D/g, "").slice(0, 3))} keyboardType="number-pad" />
          </View>
        </View>
        <Input label="Direccion establecimiento" value={selectedEstablishment.address || issuer.address} onChangeText={(address) => updateSelectedEstablishment({ address })} />
        <Input label="Siguiente secuencial" value={sequentialText} onChangeText={setSequentialText} keyboardType="number-pad" />
        <Input label="Siguiente secuencial guia" value={remissionSequentialText} onChangeText={setRemissionSequentialText} keyboardType="number-pad" />
        <Input label="Siguiente secuencial nota credito" value={creditNoteSequentialText} onChangeText={setCreditNoteSequentialText} keyboardType="number-pad" />
        {!canManageEstablishments ? (
          <View style={styles.planLockCard}>
            <View style={styles.planLockHeader}>
              <Text style={styles.planLockKicker}>Plan actual</Text>
              <Text style={styles.planLockBadge}>{compactLicenseStatusLabel(license)}</Text>
            </View>
            <Text style={styles.planLockTitle}>1 punto de emision incluido</Text>
            <Text style={styles.planLockText}>Para manejar sucursales o varios puntos de emision, active Plan Pro desde el panel SaaS.</Text>
          </View>
        ) : null}
        {establishmentStatus ? <Text style={[styles.inlineInfo, establishmentStatus.tone === "success" && styles.successText, establishmentStatus.tone === "error" && styles.errorText]}>{establishmentStatus.message}</Text> : null}
        <View style={styles.row}>
          <View style={styles.flex}>
            <Pressable style={[styles.primaryButton, !canManageEstablishments && styles.disabledButton]} onPress={openEstablishmentModal}>
              <Text style={styles.primaryButtonText}>Agregar establecimiento</Text>
            </Pressable>
          </View>
          <View style={styles.flex}>
            <Pressable style={styles.establishmentDeleteButton} onPress={requestDeleteSelectedEstablishment}>
              <Text style={styles.establishmentDeleteButtonText}>Eliminar establecimiento</Text>
            </Pressable>
          </View>
        </View>
        {selectedEstablishmentDocumentCount > 0 ? <Text style={styles.inlineInfo}>Este establecimiento tiene {selectedEstablishmentDocumentCount} documento(s); no se puede eliminar.</Text> : null}
        <Select label="Ambiente" value={issuer.environment} onChange={(environment) => setIssuer({ ...issuer, environment: environment as "1" | "2" })} options={[{ label: "Pruebas", value: "1" }, { label: "Produccion", value: "2" }]} />
        <Select
          label="Tipo contribuyente"
          value={issuer.taxpayerType}
          onChange={(taxpayerType) => setIssuer({ ...issuer, taxpayerType: taxpayerType as "natural" | "juridica" })}
          options={[
            { label: "Persona natural", value: "natural" },
            { label: "Persona juridica", value: "juridica" }
          ]}
        />
        <Select
          label="Obligado a contabilidad"
          value={issuer.accountingRequired}
          onChange={(accountingRequired) => setIssuer({ ...issuer, accountingRequired: accountingRequired as "SI" | "NO" })}
          options={[
            { label: "No", value: "NO" },
            { label: "Si", value: "SI" }
          ]}
        />
        <Select
          label="Contribuyente especial"
          value={issuer.specialTaxpayer}
          onChange={(specialTaxpayer) => setIssuer({ ...issuer, specialTaxpayer: specialTaxpayer as "SI" | "NO" })}
          options={[
            { label: "No", value: "NO" },
            { label: "Si", value: "SI" }
          ]}
        />
        {issuer.specialTaxpayer === "SI" ? (
          <Input label="Resolucion contribuyente especial" value={issuer.specialTaxpayerResolution} onChangeText={(specialTaxpayerResolution) => setIssuer({ ...issuer, specialTaxpayerResolution })} keyboardType="number-pad" />
        ) : null}
        <Input label="URL del servidor" value={backendUrl} onChangeText={setBackendUrl} autoCapitalize="none" />
        <Select
          label="Respaldo automatico"
          value={autoBackupEnabled ? "SI" : "NO"}
          onChange={(value) => setAutoBackupEnabled(value === "SI")}
          options={[
            { label: "Activo", value: "SI" },
            { label: "Inactivo", value: "NO" }
          ]}
        />
        <View style={styles.row}>
          <View style={styles.flex}>
            <PrimaryButton label="Guardar emisor" onPress={save} />
          </View>
          <View style={styles.flex}>
            <PrimaryButton label={checkingConnection ? "Probando..." : "Probar conexion"} onPress={checkingConnection ? () => undefined : testConnection} />
          </View>
        </View>
        <PrimaryButton label={testingEmail ? "Enviando prueba..." : "Probar correo"} onPress={testingEmail ? () => undefined : testCompanyEmail} />
        {connectionResult ? <Text selectable style={styles.xml}>{connectionResult}</Text> : null}
      </Section>
      <Section title="Logo y firma electronica">
        <Text style={styles.paragraph}>Estos archivos se guardan por empresa en el servidor. El certificado .p12 no se guarda en la app y queda cifrado.</Text>
        {assetStatus ? <Text style={[styles.inlineInfo, assetStatusTone === "success" && styles.successText, assetStatusTone === "error" && styles.errorText]}>{assetStatus}</Text> : null}
        <View style={styles.row}>
          <View style={styles.flex}>
            <PrimaryButton label={uploadingAsset ? "Procesando..." : "Subir logo"} onPress={uploadingAsset ? () => undefined : uploadLogoFromWeb} />
          </View>
          <View style={styles.flex}>
            <PrimaryButton label="Ver estado" onPress={() => { void refreshAssetsStatus(true); }} />
          </View>
        </View>
        <Input label="Contrasena certificado .p12" value={certificatePassword} onChangeText={setCertificatePassword} secureTextEntry autoComplete="new-password" />
        <PrimaryButton label={uploadingAsset ? "Procesando..." : "Subir certificado .p12"} onPress={uploadingAsset ? () => undefined : uploadCertificateFromWeb} />
      </Section>
      <Section title="Estado de configuracion">
        <Text style={styles.paragraph}>Modo actual: {issuer.environment === "1" ? "PRUEBAS" : "PRODUCCION"}. Los avisos de produccion son informativos mientras siga trabajando en pruebas.</Text>
        <Text style={styles.groupTitle}>Listo para trabajar</Text>
        {productionChecklist.baseChecks.map((item) => (
          <View key={item.label} style={[styles.checkRow, item.ok ? styles.checkOk : styles.checkPending]}>
            <Text style={[styles.checkText, item.ok ? styles.checkOkText : styles.checkPendingText]}>{item.ok ? "OK" : "REVISAR"} | {item.label}</Text>
          </View>
        ))}
        <Text style={styles.groupTitle}>Conexion y firma</Text>
        <Text style={styles.paragraph}>Use Probar conexion cuando cambie servidor, certificado o ambiente. No es obligatorio tocarlo cada vez que entra a la app.</Text>
        {productionChecklist.connectionChecks.map((item) => (
          <View key={item.label} style={[styles.checkRow, item.ok ? styles.checkOk : styles.checkInfo]}>
            <Text style={[styles.checkText, item.ok ? styles.checkOkText : styles.checkInfoText]}>{item.ok ? "OK" : item.pendingLabel} | {item.label}</Text>
          </View>
        ))}
        <Text style={styles.groupTitle}>Pendiente solo para produccion</Text>
        {productionChecklist.productionChecks.map((item) => (
          <View key={item.label} style={[styles.checkRow, item.ok ? styles.checkOk : styles.checkInfo]}>
            <Text style={[styles.checkText, item.ok ? styles.checkOkText : styles.checkInfoText]}>{item.ok ? "OK" : item.pendingLabel} | {item.label}</Text>
          </View>
        ))}
      </Section>
      <Section title="Plan activo">
        <Text style={styles.paragraph}>El plan comercial se administra desde el panel SaaS de DarwinSoft.</Text>
        <Text style={[styles.inlineInfo, !appLicenseStatus(license).active && styles.errorText]}>{licenseStatusLabel(license)}</Text>
        <Text style={styles.paragraph}>Usuarios: {license.maxUsers || 1} | Dispositivos: {license.maxDevices || 1} | Puntos de emision: {maxEmissionPointsForLicense(license)}</Text>
      </Section>
      <Section title="Base de datos">
        <Text style={styles.paragraph}>Respalda o restaura usuarios, clientes, productos, ventas, guias, retenciones, inventario y configuracion.</Text>
        <Text style={styles.paragraph}>Automatico: {data.autoBackupEnabled === false ? "Inactivo" : "Activo"} | Ultimo: {data.autoBackupLastAt ? formatAuditDate(data.autoBackupLastAt) : "pendiente"}</Text>
        {data.autoBackupLastError ? <Text style={styles.paragraph}>Ultimo error automatico: {data.autoBackupLastError}</Text> : null}
        <Text selectable style={styles.inlineInfo}>{formatBackupSummary(summarizeAppData(data))}</Text>
        <View style={styles.row}>
          <View style={styles.flex}>
            <PrimaryButton label={syncing ? "Procesando..." : "Subir cambios"} onPress={syncing ? () => undefined : backupData} />
          </View>
          <View style={styles.flex}>
            <PrimaryButton label="Cargar copia" onPress={syncing ? () => undefined : restoreData} />
          </View>
        </View>
        <PrimaryButton label="Actualizar datos" onPress={onRefreshBackend} />
      </Section>
      <Section title="Estado de integracion">
        <Text style={styles.paragraph}>La app genera la factura y el servidor confirma la autorizacion del SRI.</Text>
        <Text style={styles.paragraph}>Ambiente actual: {issuer.environment === "1" ? "Pruebas" : "Produccion"}</Text>
        <Text style={styles.paragraph}>Tipo: {issuer.taxpayerType === "natural" ? "Persona natural" : "Persona juridica"} | Contabilidad: {issuer.accountingRequired} | Especial: {issuer.specialTaxpayer}</Text>
        <Text style={styles.paragraph}>Para produccion, el ambiente de la app y del servidor deben estar en Produccion.</Text>
      </Section>
      <Section title="Logs tecnicos">
        <Text style={styles.paragraph}>Para soporte: muestra errores, reintentos, login, correo, SRI y respuestas lentas del servidor. No guarda claves ni documentos completos.</Text>
        <PrimaryButton label={loadingTechnicalLogs ? "Cargando..." : "Cargar logs tecnicos"} onPress={loadingTechnicalLogs ? () => undefined : loadTechnicalLogs} />
        {technicalLogs.length === 0 ? <Empty text="Cargue los logs para revisar eventos tecnicos recientes." /> : null}
        {technicalLogs.map((log, index) => (
          <ListItem
            key={`${log.time || "log"}-${index}`}
            title={`${(log.level || "info").toUpperCase()} | ${log.event || "evento"}`}
            meta={formatTechnicalLogMeta(log)}
            badge={log.statusCode && log.statusCode >= 500 ? "ERROR" : log.level || "LOG"}
            onOpen={() => Alert.alert("Log tecnico", JSON.stringify(log, null, 2))}
          />
        ))}
      </Section>
      <Section title="Auditoria">
        <Text style={styles.paragraph}>Se guardan los ultimos {AUDIT_LOG_LIMIT} eventos. Mostrando {visibleAuditLogs.length}/{auditLogs.length}.</Text>
        {auditLogs.length === 0 ? <Empty text="Aun no hay eventos de auditoria." /> : null}
        {visibleAuditLogs.map((log) => (
          <ListItem
            key={log.id}
            title={log.summary}
            meta={`${formatAuditDate(log.createdAt)} | ${log.userName || "Sistema"} | ${log.event}${log.metadata ? ` | ${shortText(JSON.stringify(log.metadata), 90)}` : ""}`}
            badge={log.entity}
          />
        ))}
        {visibleAuditLogs.length < auditLogs.length ? <LoadMoreButton label="Cargar mas auditoria" onPress={() => setVisibleAuditCount((count) => count + LIST_BATCH_SIZE)} /> : null}
      </Section>
      <Modal visible={establishmentModalVisible} transparent animationType="slide" onRequestClose={() => setEstablishmentModalVisible(false)}>
        <View style={styles.creditModalBackdrop}>
          <View style={styles.establishmentModal}>
            <View style={styles.creditModalHeader}>
              <View style={styles.flex}>
                <Text style={styles.creditModalTitle}>Nuevo establecimiento</Text>
                <Text style={styles.creditModalMeta}>Disponible para clientes con plan Pro activo.</Text>
              </View>
              <Pressable style={styles.smallButton} onPress={() => setEstablishmentModalVisible(false)}>
                <Text style={styles.smallButtonText}>Cerrar</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.creditModalContent} keyboardShouldPersistTaps="handled">
              <Input label="Nombre establecimiento" value={establishmentForm.name} onChangeText={(name) => setEstablishmentForm({ ...establishmentForm, name })} />
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Input label="Estab." value={establishmentForm.establishment} onChangeText={(establishment) => setEstablishmentForm({ ...establishmentForm, establishment })} keyboardType="number-pad" />
                </View>
                <View style={styles.flex}>
                  <Input label="Pto. emi." value={establishmentForm.emissionPoint} onChangeText={(emissionPoint) => setEstablishmentForm({ ...establishmentForm, emissionPoint })} keyboardType="number-pad" />
                </View>
              </View>
              <Input label="Direccion establecimiento" value={establishmentForm.address} onChangeText={(address) => setEstablishmentForm({ ...establishmentForm, address })} />
              <Input label="Siguiente secuencial" value={establishmentForm.sequential} onChangeText={(sequential) => setEstablishmentForm({ ...establishmentForm, sequential })} keyboardType="number-pad" />
              <Input label="Siguiente secuencial guia" value={establishmentForm.remissionSequential} onChangeText={(remissionSequential) => setEstablishmentForm({ ...establishmentForm, remissionSequential })} keyboardType="number-pad" />
              <Input label="Siguiente secuencial nota credito" value={establishmentForm.creditNoteSequential} onChangeText={(creditNoteSequential) => setEstablishmentForm({ ...establishmentForm, creditNoteSequential })} keyboardType="number-pad" />
              <PrimaryButton label="Guardar establecimiento" onPress={() => { void saveNewEstablishment(); }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal visible={deleteEstablishmentModalVisible} transparent animationType="fade" onRequestClose={() => { if (!deletingEstablishment) setDeleteEstablishmentModalVisible(false); }}>
        <View style={styles.creditModalBackdrop}>
          <View style={styles.establishmentModal}>
            <View style={styles.creditModalHeader}>
              <View style={styles.flex}>
                <Text style={styles.creditModalTitle}>Eliminar establecimiento</Text>
                <Text style={styles.creditModalMeta}>Esta accion solo esta disponible si no existen documentos asociados.</Text>
              </View>
              <Pressable style={[styles.smallButton, deletingEstablishment && styles.disabledButton]} onPress={() => { if (!deletingEstablishment) setDeleteEstablishmentModalVisible(false); }} disabled={deletingEstablishment}>
                <Text style={styles.smallButtonText}>Cerrar</Text>
              </Pressable>
            </View>
            <View style={styles.creditModalContent}>
              <Text style={styles.paragraph}>Para eliminar {selectedEstablishment.name} escriba exactamente {selectedEstablishment.id}.</Text>
              <Input label="Confirmar codigo" value={deleteEstablishmentConfirmText} onChangeText={setDeleteEstablishmentConfirmText} autoCapitalize="characters" />
              <Pressable
                style={[styles.establishmentDeleteButton, (deleteEstablishmentConfirmText.trim() !== selectedEstablishment.id || deletingEstablishment) && styles.disabledDangerButton]}
                onPress={confirmDeleteSelectedEstablishment}
                disabled={deleteEstablishmentConfirmText.trim() !== selectedEstablishment.id || deletingEstablishment}
              >
                <Text style={styles.establishmentDeleteButtonText}>{deletingEstablishment ? "Eliminando..." : "Eliminar definitivamente"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={proEstablishmentModalVisible} transparent animationType="fade" onRequestClose={() => setProEstablishmentModalVisible(false)}>
        <View style={styles.smallNoticeBackdrop}>
          <View style={styles.upgradeModal}>
            <View style={styles.upgradeIcon}>
              <Text style={styles.upgradeIconText}>PRO</Text>
            </View>
            <Text style={styles.smallNoticeTitle}>Plan Pro requerido</Text>
            <Text style={styles.smallNoticeText}>{planUpgradeMessage || "Agregar mas establecimientos esta disponible solo para clientes con licencia Pro activa."}</Text>
            <View style={styles.upgradeBenefits}>
              <Text style={styles.upgradeBenefit}>Multi punto de emision</Text>
              <Text style={styles.upgradeBenefit}>Sucursales separadas por secuencial</Text>
              <Text style={styles.upgradeBenefit}>Control comercial desde panel SaaS</Text>
            </View>
            <Pressable style={styles.primaryButton} onPress={() => setProEstablishmentModalVisible(false)}>
              <Text style={styles.primaryButtonText}>Entendido</Text>
            </Pressable>
            <Text style={styles.upgradeFooter}>Active o cambie el plan desde el panel maestro.</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function CrudSection({ title, onSave, children }: { title: string; onSave: () => void; children: React.ReactNode }) {
  return (
    <View style={styles.stack}>
      <Section title={`Nuevo ${title.toLowerCase()}`}>
        {children}
        <PrimaryButton label="Guardar" onPress={onSave} />
      </Section>
    </View>
  );
}

function QuickClientEditor({
  visible,
  form,
  onChange,
  onSave,
  onClose
}: {
  visible: boolean;
  form: {
    name: string;
    identification: string;
    email: string;
    phone: string;
    address: string;
    identificationType: Client["identificationType"];
  };
  onChange: (form: {
    name: string;
    identification: string;
    email: string;
    phone: string;
    address: string;
    identificationType: Client["identificationType"];
  }) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.creditModalBackdrop}>
        <View style={styles.quickClientModal}>
          <View style={styles.creditModalHeader}>
            <View style={styles.flex}>
              <Text style={styles.creditModalTitle}>Editar cliente</Text>
              <Text style={styles.creditModalMeta}>Corrija los datos sin salir de la venta.</Text>
            </View>
            <Pressable style={styles.smallButton} onPress={onClose}>
              <Text style={styles.smallButtonText}>Cerrar</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.creditModalContent} keyboardShouldPersistTaps="handled">
            <Input label="Nombre / razon social" value={form.name} onChangeText={(name) => onChange({ ...form, name })} />
            <Input label="Identificacion" value={form.identification} onChangeText={(identification) => onChange({ ...form, identification })} keyboardType="number-pad" />
            <Select
              label="Tipo"
              value={form.identificationType}
              onChange={(identificationType) => onChange({ ...form, identificationType: identificationType as Client["identificationType"] })}
              options={[
                { label: "RUC", value: "04" },
                { label: "Cedula", value: "05" },
                { label: "Pasaporte", value: "06" },
                { label: "Consumidor final", value: "07" },
                { label: "Exterior", value: "08" }
              ]}
            />
            <Input label="Email" value={form.email} onChangeText={(email) => onChange({ ...form, email })} autoCapitalize="none" />
            <Input label="Telefono WhatsApp" value={form.phone} onChangeText={(phone) => onChange({ ...form, phone })} keyboardType="phone-pad" />
            <Input label="Direccion" value={form.address} onChangeText={(address) => onChange({ ...form, address })} />
            <PrimaryButton label="Guardar y continuar venta" onPress={onSave} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function SaleLineEditor({
  visible,
  item,
  form,
  onChange,
  onSave,
  onClose
}: {
  visible: boolean;
  item?: SaleItem;
  form: {
    quantity: string;
    unitGrossPrice: string;
    grossDiscount: string;
    discountMode: "amount" | "percent";
  };
  onChange: (form: {
    quantity: string;
    unitGrossPrice: string;
    grossDiscount: string;
    discountMode: "amount" | "percent";
  }) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const quantity = Math.max(0, parseDecimal(form.quantity) || 0);
  const grossPrice = Math.max(0, parseDecimal(form.unitGrossPrice) || 0);
  const discountValue = Math.max(0, parseDecimal(form.grossDiscount) || 0);
  const grossDiscount = form.discountMode === "percent" ? grossPrice * quantity * discountValue / 100 : discountValue;
  const unitPrice = item ? grossToNetUnitPrice(grossPrice, item.ivaRate) : 0;
  const discount = item ? grossToNetUnitPrice(grossDiscount, item.ivaRate) : 0;
  const previewItem = item ? { ...item, quantity, unitPrice, discount } : undefined;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.creditModalBackdrop}>
        <View style={styles.quickClientModal}>
          <View style={styles.creditModalHeader}>
            <View style={styles.flex}>
              <Text style={styles.creditModalTitle}>Editar detalle</Text>
              <Text style={styles.creditModalMeta}>{item ? `${item.code} - ${item.name}` : "Producto"}</Text>
            </View>
            <Pressable style={styles.smallButton} onPress={onClose}>
              <Text style={styles.smallButtonText}>Cerrar</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.creditModalContent} keyboardShouldPersistTaps="handled">
            <Input label="Cantidad" value={form.quantity} onChangeText={(value) => onChange({ ...form, quantity: value })} keyboardType="decimal-pad" />
            <Input label="Precio publico" value={form.unitGrossPrice} onChangeText={(value) => onChange({ ...form, unitGrossPrice: value })} keyboardType="decimal-pad" />
            <Select
              label="Tipo de descuento"
              value={form.discountMode}
              onChange={(value) => onChange({ ...form, discountMode: value as "amount" | "percent" })}
              options={[
                { label: "Valor $", value: "amount" },
                { label: "Porcentaje %", value: "percent" }
              ]}
            />
            <Input label={form.discountMode === "percent" ? "Descuento %" : "Descuento publico"} value={form.grossDiscount} onChangeText={(value) => onChange({ ...form, grossDiscount: value })} keyboardType="decimal-pad" />
            {previewItem ? (
              <View style={styles.creditTotalsBox}>
                <Text style={styles.totalLine}>Base: ${money(calculateLineSubtotal(previewItem))}</Text>
                <Text style={styles.totalLine}>Descuento: ${money(calculateLineDiscount(previewItem))}</Text>
                <Text style={styles.totalLine}>IVA: ${money(calculateLineTax(previewItem))}</Text>
                <Text style={styles.totalStrong}>Total linea: ${money(calculateLineTotal(previewItem))}</Text>
              </View>
            ) : null}
            <PrimaryButton label="Guardar cambio" onPress={onSave} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ProductPriceOptionsModal({
  visible,
  product,
  quantity,
  unitGrossPrice,
  grossDiscount,
  discountMode,
  onQuantityChange,
  onUnitGrossPriceChange,
  onGrossDiscountChange,
  onDiscountModeChange,
  onAdd,
  onClose
}: {
  visible: boolean;
  product?: Product;
  quantity: string;
  unitGrossPrice: string;
  grossDiscount: string;
  discountMode: "amount" | "percent";
  onQuantityChange: (value: string) => void;
  onUnitGrossPriceChange: (value: string) => void;
  onGrossDiscountChange: (value: string) => void;
  onDiscountModeChange: (value: "amount" | "percent") => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  const qty = Math.max(0, parseDecimal(quantity) || 0);
  const grossPrice = Math.max(0, parseDecimal(unitGrossPrice) || 0);
  const discountValue = Math.max(0, parseDecimal(grossDiscount) || 0);
  const grossDiscountValue = discountMode === "percent" ? grossPrice * qty * discountValue / 100 : discountValue;
  const unitPrice = product ? grossToNetUnitPrice(grossPrice, product.ivaRate) : 0;
  const discount = product ? grossToNetUnitPrice(grossDiscountValue, product.ivaRate) : 0;
  const previewItem = product ? {
    productId: product.id,
    code: product.code,
    name: product.name,
    quantity: qty,
    unitPrice,
    cost: productCost(product),
    discount,
    ivaRate: product.ivaRate
  } : undefined;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.creditModalBackdrop}>
        <View style={styles.quickClientModal}>
          <View style={styles.creditModalHeader}>
            <View style={styles.flex}>
              <Text style={styles.creditModalTitle}>Precio y descuento</Text>
              <Text style={styles.creditModalMeta}>{product ? `${product.code} - ${product.name}` : "Seleccione producto"}</Text>
            </View>
            <Pressable style={styles.smallButton} onPress={onClose}>
              <Text style={styles.smallButtonText}>Cerrar</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.creditModalContent} keyboardShouldPersistTaps="handled">
            <Input label="Cantidad" value={quantity} onChangeText={onQuantityChange} keyboardType="decimal-pad" />
            <Input label="Precio publico" value={unitGrossPrice} onChangeText={onUnitGrossPriceChange} keyboardType="decimal-pad" />
            <Select
              label="Tipo de descuento"
              value={discountMode}
              onChange={(value) => onDiscountModeChange(value as "amount" | "percent")}
              options={[
                { label: "Valor $", value: "amount" },
                { label: "Porcentaje %", value: "percent" }
              ]}
            />
            <Input label={discountMode === "percent" ? "Descuento %" : "Descuento publico"} value={grossDiscount} onChangeText={onGrossDiscountChange} keyboardType="decimal-pad" />
            {previewItem ? (
              <View style={styles.creditTotalsBox}>
                <Text style={styles.totalLine}>Base: ${money(calculateLineSubtotal(previewItem))}</Text>
                <Text style={styles.totalLine}>Descuento: ${money(calculateLineDiscount(previewItem))}</Text>
                <Text style={styles.totalLine}>IVA: ${money(calculateLineTax(previewItem))}</Text>
                <Text style={styles.totalStrong}>Total linea: ${money(calculateLineTotal(previewItem))}</Text>
              </View>
            ) : null}
            <PrimaryButton label="Agregar producto" onPress={onAdd} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}

function ProcessingOverlay({ visible, message }: { visible: boolean; message: string }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.processingBackdrop}>
        <View style={styles.processingCard}>
          <ActivityIndicator size="large" color="#0f766e" />
          <Text style={styles.processingTitle}>Procesando</Text>
          <Text style={styles.processingText}>{message || "Espere un momento..."}</Text>
        </View>
      </View>
    </Modal>
  );
}

function Input(props: React.ComponentProps<typeof TextInput> & { label: string; rightElement?: React.ReactNode }) {
  const { label, rightElement, style, ...rest } = props;
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      {rightElement ? (
        <View style={styles.inputShell}>
          <TextInput style={[styles.input, styles.inputWithRightElement, style]} placeholderTextColor="#7d8796" {...rest} />
          <View style={styles.inputRightElement}>{rightElement}</View>
        </View>
      ) : (
        <TextInput style={[styles.input, style]} placeholderTextColor="#7d8796" {...rest} />
      )}
    </View>
  );
}

function CameraIcon() {
  return (
    <View style={styles.cameraIconBody}>
      <View style={styles.cameraIconTop} />
      <View style={styles.cameraIconLens} />
    </View>
  );
}

function MenuIcon() {
  return (
    <View style={styles.menuIcon}>
      <View style={styles.menuIconLine} />
      <View style={styles.menuIconLine} />
      <View style={styles.menuIconLine} />
    </View>
  );
}

function PencilIcon() {
  return (
    <Text style={styles.editEmojiIcon}>✎</Text>
  );
}

function MenuAction({ icon, label, tone = "default", onPress }: { icon: string; label: string; tone?: "default" | "danger"; onPress: () => void }) {
  const danger = tone === "danger";
  return (
    <Pressable style={styles.menuAction} onPress={onPress}>
      <Text style={[styles.menuActionIcon, danger && styles.menuActionIconDanger]}>{icon}</Text>
      <Text style={[styles.menuActionText, danger && styles.menuActionTextDanger]}>{label}</Text>
    </Pressable>
  );
}

function CompanyLogoMark({ logoUrl, backendUrl }: { logoUrl: string; backendUrl: string }) {
  const resolvedLogoUrl = resolveCompanyLogoUrl(logoUrl, backendUrl);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [resolvedLogoUrl]);

  return (
    <View style={[styles.brandMark, resolvedLogoUrl && !failed && styles.brandLogoMark]}>
      {resolvedLogoUrl && !failed ? (
        <Image source={{ uri: resolvedLogoUrl }} style={styles.brandLogoImage} resizeMode="contain" onError={() => setFailed(true)} />
      ) : (
        <Text style={styles.brandMarkText}>FD</Text>
      )}
    </View>
  );
}

function OnboardingStep({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <View style={styles.onboardingStep}>
      <Text style={styles.onboardingStepNumber}>{number}</Text>
      <View style={styles.flex}>
        <Text style={styles.onboardingStepTitle}>{title}</Text>
        <Text style={styles.onboardingStepText}>{text}</Text>
      </View>
    </View>
  );
}

function CalendarDateInput({ label, value, onChange, allowClear = false }: { label: string; value: string; onChange: (value: string) => void; allowClear?: boolean }) {
  const parsedValue = parseInputDate(value, "start");
  const [visible, setVisible] = useState(false);
  const [cursorDate, setCursorDate] = useState(parsedValue || new Date());
  const year = cursorDate.getFullYear();
  const month = cursorDate.getMonth();
  const days = buildCalendarDays(year, month);
  const monthLabel = `${monthOptions[month]?.label || ""} ${year}`;

  useEffect(() => {
    if (!visible) return;
    setCursorDate(parsedValue || new Date());
  }, [parsedValue?.getTime(), visible]);

  const moveMonth = (amount: number) => {
    setCursorDate((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  };

  const selectDate = (date: Date) => {
    onChange(toInputDate(date));
    setVisible(false);
  };

  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.dateField} onPress={() => setVisible(true)}>
        <Text style={[styles.dateFieldText, !value && styles.dateFieldPlaceholder]}>{value || "Seleccionar fecha"}</Text>
      </Pressable>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.calendarBackdrop} onPress={() => setVisible(false)}>
          <Pressable style={styles.calendarSheet}>
            <View style={styles.calendarHeader}>
              <Pressable style={styles.calendarNavButton} onPress={() => moveMonth(-1)}>
                <Text style={styles.calendarNavText}>{"<"}</Text>
              </Pressable>
              <Text style={styles.calendarTitle}>{monthLabel}</Text>
              <Pressable style={styles.calendarNavButton} onPress={() => moveMonth(1)}>
                <Text style={styles.calendarNavText}>{">"}</Text>
              </Pressable>
            </View>
            <View style={styles.calendarWeekRow}>
              {["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"].map((day) => (
                <Text key={day} style={styles.calendarWeekText}>{day}</Text>
              ))}
            </View>
            <View style={styles.calendarGrid}>
              {days.map((date, index) => {
                const isCurrentMonth = date.getMonth() === month;
                const dateValue = toInputDate(date);
                const selected = value === dateValue;
                const today = dateValue === toInputDate(new Date());
                return (
                  <Pressable key={`${dateValue}-${index}`} style={[styles.calendarDay, selected && styles.calendarDaySelected, today && !selected && styles.calendarDayToday]} onPress={() => selectDate(date)}>
                    <Text style={[styles.calendarDayText, !isCurrentMonth && styles.calendarDayMuted, selected && styles.calendarDaySelectedText]}>{date.getDate()}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.calendarActions}>
              {allowClear ? (
                <Pressable style={styles.actionSheetCancel} onPress={() => { onChange(""); setVisible(false); }}>
                  <Text style={styles.actionSheetCancelText}>Limpiar</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.actionSheetButton} onPress={() => selectDate(new Date())}>
                <Text style={styles.actionSheetButtonText}>Hoy</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function BarcodeScannerModal({ visible, title, onClose, onScan }: { visible: boolean; title: string; onClose: () => void; onScan: (code: string) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (visible) setScanned(false);
  }, [visible]);

  const handleOpenPermission = async () => {
    const result = await requestPermission();
    if (!result.granted) {
      Alert.alert("Camara sin permiso", "Active el permiso de camara para escanear codigos.");
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scannerBackdrop}>
        <View style={styles.scannerSheet}>
          <View style={styles.scannerHeader}>
            <View style={styles.flex}>
              <Text style={styles.scannerTitle}>{title}</Text>
              <Text style={styles.scannerMeta}>Apunte al codigo de barras o QR del producto.</Text>
            </View>
            <Pressable style={styles.smallButton} onPress={onClose}>
              <Text style={styles.smallButtonText}>Cerrar</Text>
            </Pressable>
          </View>
          {!permission?.granted ? (
            <View style={styles.scannerPermission}>
              <Text style={styles.paragraph}>La app necesita permiso de camara para escanear codigos.</Text>
              <PrimaryButton label="Permitir camara" onPress={handleOpenPermission} />
            </View>
          ) : (
            <View style={styles.scannerCameraWrap}>
              <CameraView
                style={styles.scannerCamera}
                facing="back"
                barcodeScannerSettings={{
                  barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "itf14", "qr"]
                }}
                onBarcodeScanned={scanned ? undefined : ({ data }) => {
                  const code = normalizeProductCode(String(data || ""));
                  if (!code) return;
                  setScanned(true);
                  onScan(code);
                }}
              />
              <View style={styles.scannerFrame} />
            </View>
          )}
          {scanned ? (
            <Pressable style={styles.scanButton} onPress={() => setScanned(false)}>
              <Text style={styles.scanButtonText}>Escanear otro</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: { label: string; value: string }[]; onChange: (value: string) => void }) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.selectRow}>
          {options.map((option) => (
            <Pressable key={option.value} style={[styles.choice, value === option.value && styles.choiceActive]} onPress={() => onChange(option.value)}>
              <Text style={[styles.choiceText, value === option.value && styles.choiceTextActive]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.primaryButton} onPress={onPress}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function InlineInputButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.inlineInputButton} onPress={onPress}>
      <Text style={styles.inlineInputButtonText}>{label}</Text>
    </Pressable>
  );
}

function PasswordVisibilityButton({ visible, onPress }: { visible: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={visible ? "Ocultar clave" : "Mostrar clave"}
      style={styles.passwordVisibilityButton}
      onPress={onPress}
    >
      <EyeIcon hidden={visible} />
    </Pressable>
  );
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <View style={styles.eyeIconWrap}>
      <View style={styles.eyeIcon}>
        <View style={styles.eyePupil} />
      </View>
      {hidden ? <View style={styles.eyeSlash} /> : null}
    </View>
  );
}

function LoadMoreButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.smallButton} onPress={onPress}>
      <Text style={styles.smallButtonText}>{label}</Text>
    </Pressable>
  );
}

function ListItem({
  title,
  meta,
  badge,
  secondaryLabel,
  emailLabel,
  whatsappLabel,
  retryLabel,
  supportLabel,
  invoiceLabel,
  ticketLabel,
  proformaInvoiceLabel,
  creditNoteLabel,
  retentionLabel,
  cancelLabel,
  editLabel,
  onDelete,
  onOpen,
  onSecondary,
  onEmail,
  onWhatsapp,
  onRetry,
  onSupport,
  onInvoice,
  onTicket,
  onProformaInvoice,
  onCreditNote,
  onRetention,
  onCancel,
  onEdit
}: {
  title: string;
  meta: string;
  badge?: string;
  secondaryLabel?: string;
  emailLabel?: string;
  whatsappLabel?: string;
  retryLabel?: string;
  supportLabel?: string;
  invoiceLabel?: string;
  ticketLabel?: string;
  proformaInvoiceLabel?: string;
  creditNoteLabel?: string;
  retentionLabel?: string;
  cancelLabel?: string;
  editLabel?: string;
  onDelete?: ActionHandler;
  onOpen?: ActionHandler;
  onSecondary?: ActionHandler;
  onEmail?: ActionHandler;
  onWhatsapp?: ActionHandler;
  onRetry?: ActionHandler;
  onSupport?: ActionHandler;
  onInvoice?: ActionHandler;
  onTicket?: ActionHandler;
  onProformaInvoice?: ActionHandler;
  onCreditNote?: ActionHandler;
  onRetention?: ActionHandler;
  onCancel?: ActionHandler;
  onEdit?: ActionHandler;
}) {
  const [actionsVisible, setActionsVisible] = useState(false);
  const [processingActionLabel, setProcessingActionLabel] = useState("");
  const actions = [
    secondaryLabel && onSecondary ? { label: secondaryLabel, onPress: onSecondary, tone: "info" as const } : null,
    emailLabel && onEmail ? { label: emailLabel, onPress: onEmail, tone: "success" as const } : null,
    whatsappLabel && onWhatsapp ? { label: whatsappLabel, onPress: onWhatsapp, tone: "success" as const } : null,
    retryLabel && onRetry ? { label: retryLabel, onPress: onRetry, tone: "warning" as const } : null,
    supportLabel && onSupport ? { label: supportLabel, onPress: onSupport, tone: "info" as const } : null,
    invoiceLabel && onInvoice ? { label: invoiceLabel, onPress: onInvoice, tone: "primary" as const } : null,
    ticketLabel && onTicket ? { label: ticketLabel, onPress: onTicket, tone: "primary" as const } : null,
    proformaInvoiceLabel && onProformaInvoice ? { label: proformaInvoiceLabel, onPress: onProformaInvoice, tone: "primary" as const } : null,
    creditNoteLabel && onCreditNote ? { label: creditNoteLabel, onPress: onCreditNote, tone: "warning" as const } : null,
    retentionLabel && onRetention ? { label: retentionLabel, onPress: onRetention, tone: "info" as const } : null,
    editLabel && onEdit ? { label: editLabel, onPress: onEdit, tone: "info" as const } : null,
    cancelLabel && onCancel ? { label: cancelLabel, onPress: onCancel, tone: "danger" as const } : null,
    onDelete ? { label: "Eliminar", onPress: onDelete, tone: "danger" as const } : null
  ].filter((action): action is { label: string; onPress: ActionHandler; tone: "primary" | "success" | "warning" | "info" | "danger" } => Boolean(action));
  const compactActions = actions.length > 2;
  const isProcessingAction = Boolean(processingActionLabel);
  const runAction = async (label: string, action: ActionHandler) => {
    if (isProcessingAction) return;
    setProcessingActionLabel(label);
    setActionsVisible(false);
    try {
      await Promise.resolve(action());
    } catch (error) {
      Alert.alert("Accion no completada", error instanceof Error ? error.message : "No se pudo completar la accion.");
    } finally {
      setProcessingActionLabel("");
    }
  };

  return (
    <Pressable style={styles.listItem} onPress={onOpen} disabled={isProcessingAction}>
      <View style={styles.flex}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemTitle} numberOfLines={2}>{title}</Text>
          {badge ? <Text style={[styles.badge, badge === "AUTORIZADA" && styles.badgeOk, badge === "RECHAZADA" && styles.badgeError, badge === "ANULADA" && styles.badgeNeutral, badge === "INTERNA" && styles.badgeInfo, badge === "PROFORMA" && styles.badgeWarning]}>{badge}</Text> : null}
        </View>
        <Text style={styles.itemMeta} numberOfLines={2}>
          {meta}
        </Text>
      </View>
      {compactActions ? (
        <View style={styles.actionGroup}>
          <Pressable style={[styles.actionsButton, isProcessingAction && styles.disabledActionButton]} onPress={() => setActionsVisible(true)} disabled={isProcessingAction}>
            <Text style={styles.actionsButtonText}>{isProcessingAction ? "Procesando..." : "Acciones"}</Text>
          </Pressable>
          <Modal visible={actionsVisible} transparent animationType="fade" onRequestClose={() => setActionsVisible(false)}>
            <Pressable style={styles.actionModalBackdrop} onPress={() => setActionsVisible(false)}>
              <Pressable style={styles.actionSheet}>
                <Text style={styles.actionSheetTitle}>{title}</Text>
                <Text style={styles.actionSheetMeta} numberOfLines={2}>{meta}</Text>
                {actions.map((action) => (
                  <Pressable key={action.label} style={[styles.actionSheetButton, action.tone === "danger" && styles.actionSheetDanger]} onPress={() => { void runAction(action.label, action.onPress); }}>
                    <Text style={[styles.actionSheetButtonText, action.tone === "danger" && styles.actionSheetDangerText]}>{action.label}</Text>
                  </Pressable>
                ))}
                <Pressable style={styles.actionSheetCancel} onPress={() => setActionsVisible(false)}>
                  <Text style={styles.actionSheetCancelText}>Cerrar</Text>
                </Pressable>
              </Pressable>
            </Pressable>
          </Modal>
        </View>
      ) : actions.length > 0 ? (
        <View style={styles.actionGroup}>
          {actions.map((action) => (
            <Pressable key={action.label} style={[actionButtonStyle(action.tone), isProcessingAction && styles.disabledActionButton]} onPress={() => { void runAction(action.label, action.onPress); }} disabled={isProcessingAction}>
              <Text style={actionButtonTextStyle(action.tone)}>{processingActionLabel === action.label ? "Procesando..." : action.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

function actionButtonStyle(tone: "primary" | "success" | "warning" | "info" | "danger") {
  if (tone === "primary") return styles.invoiceButton;
  if (tone === "success") return styles.emailButton;
  if (tone === "warning") return styles.retryButton;
  if (tone === "danger") return styles.cancelButton;
  return styles.rideButton;
}

function actionButtonTextStyle(tone: "primary" | "success" | "warning" | "info" | "danger") {
  if (tone === "primary") return styles.invoiceButtonText;
  if (tone === "success") return styles.emailButtonText;
  if (tone === "warning") return styles.retryButtonText;
  if (tone === "danger") return styles.cancelButtonText;
  return styles.rideButtonText;
}

function Empty({ text }: { text: string }) {
  return <Text style={styles.hint}>{text}</Text>;
}

function OperationTile({ title, value, detail, tone }: { title: string; value: string; detail: string; tone: "success" | "warning" | "danger" }) {
  return (
    <View style={[styles.operationTile, tone === "success" && styles.operationSuccess, tone === "warning" && styles.operationWarning, tone === "danger" && styles.operationDanger]}>
      <Text style={[styles.operationTitle, tone === "success" && styles.operationSuccessText, tone === "warning" && styles.operationWarningText, tone === "danger" && styles.operationDangerText]}>{title}</Text>
      <Text style={styles.operationValue}>{value}</Text>
      <Text style={styles.operationDetail}>{detail}</Text>
    </View>
  );
}

function StatBox({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" | "warning" | "danger" | "info" }) {
  return (
    <View style={[styles.statBox, tone === "success" && styles.statBoxSuccess, tone === "warning" && styles.statBoxWarning, tone === "danger" && styles.statBoxDanger, tone === "info" && styles.statBoxInfo]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function App() {
  return (
    <StartupErrorBoundary>
      <AppContent />
    </StartupErrorBoundary>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f5f7fb"
  },
  keyboardAvoiding: {
    flex: 1
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f7fb"
  },
  processingBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(15, 23, 42, 0.35)"
  },
  processingCard: {
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
    gap: 10,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dbe4ee",
    backgroundColor: "#ffffff"
  },
  processingTitle: {
    color: "#102033",
    fontSize: 16,
    fontWeight: "900"
  },
  processingText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    textAlign: "center"
  },
  loginPanel: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f7f9fc"
  },
  loginBrandRow: {
    marginBottom: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10
  },
  loginBrandMark: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f766e"
  },
  loginBrandMarkText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900"
  },
  loginBrand: {
    color: "#0f2f66",
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "900"
  },
  authCard: {
    borderRadius: 14,
    padding: 26,
    gap: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#edf1f7",
    shadowColor: "#0f172a",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6
  },
  authTitle: {
    marginBottom: 10,
    color: "#1f2937",
    fontSize: 21,
    lineHeight: 25,
    fontWeight: "900",
    textAlign: "center"
  },
  authSubtitle: {
    marginTop: -10,
    marginBottom: 2,
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center"
  },
  authLinkButton: {
    marginTop: 22,
    alignItems: "center"
  },
  authLinkText: {
    color: "#2f6f96",
    fontSize: 14,
    fontWeight: "800"
  },
  authMutedLink: {
    marginTop: 20,
    color: "#2f6f96",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center"
  },
  authActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2
  },
  authActionPrimary: {
    flex: 1.35,
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  authActionSecondary: {
    flex: 1,
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  authActionSecondaryText: {
    color: "#0f5f59",
    fontSize: 13,
    fontWeight: "900"
  },
  authInlineFooter: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5
  },
  authInlineText: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "700"
  },
  authInlineLink: {
    color: "#2f6f96",
    fontSize: 14,
    fontWeight: "900"
  },
  authFeedback: {
    color: "#2563eb",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    textAlign: "center"
  },
  authFeedbackError: {
    color: "#b91c1c"
  },
  authFeedbackSuccess: {
    color: "#047857"
  },
  companyChoiceList: {
    gap: 10
  },
  companyChoice: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: "#f8fafc"
  },
  companyChoiceTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900"
  },
  companyChoiceMeta: {
    marginTop: 3,
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700"
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderColor: "#e2e7f0"
  },
  xmlModalHeader: {
    minHeight: 58,
    paddingBottom: 10
  },
  brand: {
    fontSize: 21,
    lineHeight: 25,
    fontWeight: "800",
    color: "#1a2a3a"
  },
  brandRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  brandMark: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f766e",
    overflow: "hidden"
  },
  brandLogoMark: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff"
  },
  brandLogoImage: {
    width: "100%",
    height: "100%"
  },
  brandMarkText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900"
  },
  headerBrand: {
    fontSize: 16,
    lineHeight: 19,
    fontWeight: "900",
    color: "#1a2a3a"
  },
  headerMetaRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  headerUser: {
    flexShrink: 1,
    color: "#5d6979",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14
  },
  subtitle: {
    marginTop: 1,
    color: "#5d6979",
    fontSize: 12,
    lineHeight: 16
  },
  syncStatus: {
    marginTop: 2,
    color: "#c2410c",
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 13
  },
  scopeStatus: {
    marginTop: 2,
    color: "#0f766e",
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 13
  },
  syncStatusError: {
    color: "#b91c1c"
  },
  licensePill: {
    flexShrink: 0,
    maxWidth: 116,
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 2,
    color: "#047857",
    backgroundColor: "#dcfce7",
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 13
  },
  licensePillError: {
    color: "#b91c1c",
    backgroundColor: "#fee2e2"
  },
  headerMenuButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc"
  },
  menuIcon: {
    width: 16,
    gap: 3
  },
  menuIconLine: {
    height: 2,
    borderRadius: 2,
    backgroundColor: "#64748b"
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.16)",
    alignItems: "flex-end",
    paddingTop: Platform.OS === "android" ? (NativeStatusBar.currentHeight || 0) + 50 : 58,
    paddingHorizontal: 12
  },
  appMenu: {
    width: 238,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    padding: 8,
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6
  },
  appMenuHeader: {
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  appMenuTitle: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "900"
  },
  appMenuMeta: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700"
  },
  appMenuDivider: {
    height: 1,
    backgroundColor: "#e2e8f0",
    marginVertical: 6
  },
  menuAction: {
    minHeight: 40,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  menuActionIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    overflow: "hidden",
    color: "#0f766e",
    backgroundColor: "#ecfdf5",
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 22,
    textAlign: "center"
  },
  menuActionIconDanger: {
    color: "#b91c1c",
    backgroundColor: "#fee2e2"
  },
  menuActionText: {
    flex: 1,
    color: "#334155",
    fontSize: 13,
    fontWeight: "800"
  },
  menuActionTextDanger: {
    color: "#b91c1c"
  },
  onboardingBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.38)",
    padding: 18,
    justifyContent: "center"
  },
  onboardingCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    padding: 18,
    gap: 12
  },
  onboardingEyebrow: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  onboardingTitle: {
    color: "#111827",
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "900"
  },
  onboardingText: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700"
  },
  onboardingSteps: {
    gap: 8
  },
  onboardingStep: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#f8fafc"
  },
  onboardingStepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: "hidden",
    color: "#ffffff",
    backgroundColor: "#0f766e",
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 24,
    textAlign: "center"
  },
  onboardingStepTitle: {
    color: "#1f2937",
    fontSize: 13,
    fontWeight: "900"
  },
  onboardingStepText: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700"
  },
  onboardingPrimary: {
    minHeight: 44,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f766e"
  },
  onboardingPrimaryText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  onboardingSecondary: {
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center"
  },
  onboardingSecondaryText: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "800"
  },
  checkRow: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  checkOk: {
    backgroundColor: "#ecfdf5",
    borderColor: "#86efac"
  },
  checkPending: {
    backgroundColor: "#fff7ed",
    borderColor: "#fdba74"
  },
  checkInfo: {
    backgroundColor: "#eff6ff",
    borderColor: "#bfdbfe"
  },
  checkText: {
    fontSize: 12,
    fontWeight: "900"
  },
  checkOkText: {
    color: "#047857"
  },
  checkPendingText: {
    color: "#c2410c"
  },
  checkInfoText: {
    color: "#1d4ed8"
  },
  tabs: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderColor: "#e2e7f0",
    minHeight: 50,
    flexGrow: 0
  },
  tabsContent: {
    paddingHorizontal: 4,
    alignItems: "center",
    flexDirection: "row",
    minHeight: 50
  },
  tab: {
    minWidth: 82,
    paddingHorizontal: 8,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 3,
    borderBottomColor: "transparent"
  },
  tabActive: {
    borderBottomColor: "#0f766e"
  },
  tabText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#6b7280",
    lineHeight: 14
  },
  tabTextActive: {
    color: "#0f766e"
  },
  content: {
    padding: 12,
    paddingBottom: 170
  },
  stack: {
    gap: 12
  },
  dashboardHero: {
    borderRadius: 8,
    padding: 14,
    backgroundColor: "#0b6b62",
    alignItems: "stretch",
    gap: 12,
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3
  },
  heroMain: {
    gap: 8
  },
  heroTopLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  dashboardEyebrow: {
    color: "#ccfbf1",
    fontSize: 12,
    fontWeight: "800"
  },
  heroStatusPill: {
    borderRadius: 8,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
    color: "#065f46",
    backgroundColor: "#d1fae5",
    fontSize: 10,
    fontWeight: "900"
  },
  heroStatusWarning: {
    color: "#92400e",
    backgroundColor: "#fef3c7"
  },
  heroStatusDanger: {
    color: "#991b1b",
    backgroundColor: "#fee2e2"
  },
  dashboardTitle: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "900",
    marginTop: 3
  },
  dashboardText: {
    color: "#ecfeff",
    marginTop: 2,
    fontWeight: "700"
  },
  heroAmountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  heroMetaGrid: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4
  },
  heroMetaItem: {
    flex: 1,
    minWidth: 0,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "rgba(255, 255, 255, 0.13)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)"
  },
  heroMetaValue: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 12
  },
  heroMetaLabel: {
    color: "#cffafe",
    fontWeight: "700",
    fontSize: 10,
    marginTop: 2
  },
  heroButton: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#ffffff",
    alignSelf: "center",
    minWidth: 112,
    alignItems: "center"
  },
  heroButtonText: {
    color: "#0f766e",
    fontWeight: "900"
  },
  section: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e7f0",
    gap: 9,
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1f2937"
  },
  paragraph: {
    color: "#4b5563",
    lineHeight: 20
  },
  saleGroup: {
    borderWidth: 1,
    borderColor: "#e2e7f0",
    borderRadius: 8,
    padding: 12,
    gap: 10,
    backgroundColor: "#fbfdff"
  },
  saleGroupCompact: {
    borderWidth: 1,
    borderColor: "#e2e7f0",
    borderRadius: 8,
    padding: 10,
    gap: 8,
    backgroundColor: "#ffffff"
  },
  scanBox: {
    borderWidth: 1,
    borderColor: "#dbe4ee",
    borderRadius: 8,
    padding: 12,
    gap: 8,
    backgroundColor: "#ffffff"
  },
  scanButton: {
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  scanButtonText: {
    color: "#ffffff",
    fontWeight: "900",
    textAlign: "center"
  },
  groupTitle: {
    color: "#0f766e",
    fontWeight: "900",
    fontSize: 13,
    textTransform: "uppercase"
  },
  inlineInfo: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18
  },
  inlineCard: {
    borderWidth: 1,
    borderColor: "#dbe4ee",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  productSummaryCard: {
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#f0fdf4",
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  iconButton: {
    minHeight: 38,
    borderRadius: 8,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f766e"
  },
  iconButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900"
  },
  quickEditButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f766e"
  },
  editEmojiIcon: {
    color: "#ffffff",
    fontSize: 18,
    lineHeight: 20,
    fontWeight: "900",
    textAlign: "center"
  },
  secondaryActionButton: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  secondaryActionText: {
    color: "#0f5f59",
    fontSize: 12,
    fontWeight: "900"
  },
  establishmentDeleteButton: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fff1f2",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  establishmentDeleteButtonText: {
    color: "#991b1b",
    fontWeight: "900",
    textAlign: "center"
  },
  disabledDangerButton: {
    opacity: 0.55
  },
  quantityBlock: {
    width: 152,
    flexShrink: 0,
    gap: 6
  },
  saleControlsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8
  },
  quantityStepper: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center"
  },
  stepperButton: {
    width: 38,
    flexShrink: 0,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eef2ff"
  },
  stepperButtonText: {
    color: "#1d4ed8",
    fontSize: 20,
    fontWeight: "900"
  },
  stepperInput: {
    flex: 1,
    minWidth: 42,
    minHeight: 44,
    textAlign: "center",
    color: "#111827",
    fontWeight: "900",
    backgroundColor: "#ffffff"
  },
  stockWarningBox: {
    borderWidth: 1,
    borderColor: "#fbbf24",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#fffbeb"
  },
  stockWarningText: {
    color: "#92400e",
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 17
  },
  errorText: {
    color: "#b91c1c"
  },
  successText: {
    color: "#047857"
  },
  inputGroup: {
    gap: 6
  },
  label: {
    fontSize: 12,
    color: "#4b5563",
    fontWeight: "700"
  },
  optionsLabel: {
    paddingLeft: 2,
    marginBottom: 6
  },
  input: {
    minHeight: 38,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    color: "#111827",
    backgroundColor: "#fbfdff"
  },
  inputShell: {
    position: "relative",
    justifyContent: "center"
  },
  inputWithRightElement: {
    paddingRight: 96
  },
  inputRightElement: {
    position: "absolute",
    right: 6,
    top: 6,
    bottom: 6,
    justifyContent: "center"
  },
  inputCameraButton: {
    width: 42,
    minHeight: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f766e"
  },
  inlineInputButton: {
    minWidth: 78,
    minHeight: 26,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    backgroundColor: "#0f766e"
  },
  inlineInputButtonText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900"
  },
  passwordVisibilityButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center"
  },
  eyeIconWrap: {
    width: 22,
    height: 16,
    alignItems: "center",
    justifyContent: "center"
  },
  eyeIcon: {
    width: 21,
    height: 13,
    borderWidth: 1.8,
    borderColor: "#64748b",
    borderRadius: 11,
    transform: [{ scaleY: 0.82 }],
    alignItems: "center",
    justifyContent: "center"
  },
  eyePupil: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#64748b"
  },
  eyeSlash: {
    position: "absolute",
    width: 25,
    height: 1.8,
    borderRadius: 1,
    backgroundColor: "#64748b",
    transform: [{ rotate: "-38deg" }]
  },
  cameraIconBody: {
    width: 18,
    height: 14,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center"
  },
  cameraIconTop: {
    position: "absolute",
    top: -5,
    width: 8,
    height: 4,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    backgroundColor: "#ffffff"
  },
  cameraIconLens: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#ffffff"
  },
  dateField: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: "#fbfdff",
    justifyContent: "center"
  },
  dateFieldText: {
    color: "#111827",
    fontWeight: "800"
  },
  dateFieldPlaceholder: {
    color: "#7d8796",
    fontWeight: "600"
  },
  calendarBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.38)",
    justifyContent: "flex-end",
    padding: 14
  },
  calendarSheet: {
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    gap: 10
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  calendarTitle: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "900",
    textTransform: "capitalize"
  },
  calendarNavButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center"
  },
  calendarNavText: {
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 24
  },
  calendarWeekRow: {
    flexDirection: "row",
    gap: 6
  },
  calendarWeekText: {
    flex: 1,
    textAlign: "center",
    color: "#64748b",
    fontSize: 11,
    fontWeight: "900"
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  calendarDay: {
    width: "13.33%",
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center"
  },
  calendarDayToday: {
    borderWidth: 1,
    borderColor: "#0f766e"
  },
  calendarDaySelected: {
    backgroundColor: "#0f766e"
  },
  calendarDayText: {
    color: "#111827",
    fontWeight: "900"
  },
  calendarDayMuted: {
    color: "#94a3b8"
  },
  calendarDaySelectedText: {
    color: "#ffffff"
  },
  calendarActions: {
    flexDirection: "row",
    gap: 8
  },
  scannerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "flex-end",
    padding: 12
  },
  scannerSheet: {
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden"
  },
  scannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb"
  },
  scannerTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900"
  },
  scannerMeta: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 3
  },
  scannerPermission: {
    padding: 14,
    gap: 12
  },
  scannerCameraWrap: {
    height: 360,
    backgroundColor: "#020617"
  },
  scannerCamera: {
    flex: 1
  },
  scannerFrame: {
    position: "absolute",
    left: "12%",
    right: "12%",
    top: "36%",
    height: 92,
    borderWidth: 2,
    borderColor: "#22c55e",
    borderRadius: 10,
    backgroundColor: "transparent"
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: 10
  },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  buttonRowButton: {
    flexGrow: 1,
    flexBasis: "45%"
  },
  flex: {
    flex: 1,
    minWidth: 130
  },
  selectRow: {
    flexDirection: "row",
    gap: 8
  },
  choice: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fbfdff"
  },
  choiceActive: {
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb"
  },
  choiceText: {
    color: "#4b5563",
    fontWeight: "700"
  },
  choiceTextActive: {
    color: "#0f766e"
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "800"
  },
  disabledButton: {
    backgroundColor: "#94a3b8"
  },
  addButton: {
    flexGrow: 1,
    minWidth: 96,
    height: 46,
    borderRadius: 8,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14
  },
  addButtonText: {
    color: "#ffffff",
    fontWeight: "800"
  },
  smallButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  smallButtonText: {
    color: "#0f5f59",
    fontWeight: "900"
  },
  listItem: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#dfe6ef",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: "#ffffff",
    shadowColor: "#0f172a",
    shadowOpacity: 0.035,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1
  },
  itemTitle: {
    color: "#111827",
    fontWeight: "900",
    flexShrink: 1
  },
  itemHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8
  },
  badge: {
    borderRadius: 8,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#e5e7eb",
    color: "#374151",
    fontSize: 10,
    fontWeight: "900",
    minWidth: 76,
    textAlign: "center"
  },
  badgeOk: {
    backgroundColor: "#dcfce7",
    color: "#166534"
  },
  badgeError: {
    backgroundColor: "#fee2e2",
    color: "#991b1b"
  },
  badgeNeutral: {
    backgroundColor: "#e5e7eb",
    color: "#374151"
  },
  badgeInfo: {
    backgroundColor: "#dbeafe",
    color: "#1d4ed8"
  },
  badgeWarning: {
    backgroundColor: "#fef3c7",
    color: "#92400e"
  },
  actionGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
    justifyContent: "flex-end",
    flexShrink: 0
  },
  actionsButton: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#111827",
    minWidth: 86,
    alignItems: "center"
  },
  actionsButtonText: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 12
  },
  disabledActionButton: {
    opacity: 0.72
  },
  actionModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
    justifyContent: "flex-end",
    padding: 14
  },
  actionSheet: {
    borderRadius: 12,
    backgroundColor: "#ffffff",
    padding: 14,
    gap: 9,
    borderWidth: 1,
    borderColor: "#e5e7eb"
  },
  actionSheetTitle: {
    color: "#111827",
    fontWeight: "900",
    fontSize: 15
  },
  actionSheetMeta: {
    color: "#64748b",
    fontSize: 12,
    marginBottom: 4
  },
  actionSheetButton: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  actionSheetButtonText: {
    color: "#0f172a",
    fontWeight: "900",
    textAlign: "center"
  },
  actionSheetDanger: {
    backgroundColor: "#fee2e2"
  },
  actionSheetDangerText: {
    color: "#991b1b"
  },
  actionSheetCancel: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  actionSheetCancelText: {
    color: "#0f5f59",
    fontWeight: "900",
    textAlign: "center"
  },
  creditModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "flex-end",
    padding: 12
  },
  creditModal: {
    maxHeight: "92%",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden"
  },
  quickClientModal: {
    maxHeight: "92%",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden"
  },
  establishmentModal: {
    maxHeight: "92%",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden"
  },
  diagnosticModal: {
    maxHeight: "94%",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden"
  },
  smallNoticeBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  smallNoticeModal: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    padding: 18,
    gap: 12
  },
  upgradeModal: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#99f6e4",
    backgroundColor: "#ffffff",
    padding: 18,
    gap: 12,
    shadowColor: "#0f172a",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4
  },
  upgradeIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f766e"
  },
  upgradeIconText: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 12
  },
  upgradeBenefits: {
    borderWidth: 1,
    borderColor: "#ccfbf1",
    borderRadius: 8,
    backgroundColor: "#f0fdfa",
    padding: 10,
    gap: 6
  },
  upgradeBenefit: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "900"
  },
  upgradeFooter: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center"
  },
  establishmentPickerModal: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    padding: 18,
    gap: 10
  },
  establishmentPickerOption: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#99f6e4",
    backgroundColor: "#f0fdfa",
    paddingHorizontal: 12,
    paddingVertical: 11
  },
  establishmentPickerOptionActive: {
    borderColor: "#0f766e",
    backgroundColor: "#ccfbf1"
  },
  smallNoticeTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center"
  },
  smallNoticeText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    textAlign: "center"
  },
  creditModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb"
  },
  creditModalTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900"
  },
  creditModalMeta: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 3
  },
  creditModalContent: {
    padding: 14,
    gap: 10
  },
  sectionMiniTitle: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 4
  },
  pendingSyncCard: {
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#fffbeb",
    gap: 4
  },
  pendingSyncTitle: {
    color: "#111827",
    fontWeight: "900"
  },
  pendingSyncMeta: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700"
  },
  pendingSyncError: {
    color: "#92400e",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17
  },
  diagnosticText: {
    fontFamily: "monospace",
    color: "#111827",
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    fontSize: 11,
    lineHeight: 17
  },
  creditSelectAllButton: {
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  creditSelectAllText: {
    color: "#3730a3",
    fontWeight: "900"
  },
  creditLineCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 10,
    gap: 8,
    backgroundColor: "#fbfdff"
  },
  creditLineTitle: {
    color: "#0f172a",
    fontWeight: "900"
  },
  creditLineMeta: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 17
  },
  creditLineTotalBox: {
    minWidth: 100,
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    paddingHorizontal: 10
  },
  creditLineTotal: {
    color: "#0f766e",
    fontWeight: "900",
    fontSize: 16
  },
  creditTotalsBox: {
    borderRadius: 8,
    backgroundColor: "#ecfdf5",
    padding: 12,
    gap: 4
  },
  itemMeta: {
    marginTop: 2,
    color: "#6b7280",
    fontSize: 12
  },
  deleteButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#fee2e2"
  },
  deleteButtonText: {
    color: "#991b1b",
    fontWeight: "800",
    fontSize: 12
  },
  rideButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#dbeafe"
  },
  rideButtonText: {
    color: "#1d4ed8",
    fontWeight: "900",
    fontSize: 12
  },
  emailButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#dcfce7"
  },
  emailButtonText: {
    color: "#166534",
    fontWeight: "900",
    fontSize: 12
  },
  whatsappButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#dcfce7"
  },
  whatsappButtonText: {
    color: "#15803d",
    fontWeight: "900",
    fontSize: 12
  },
  editButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#e0f2fe"
  },
  editButtonText: {
    color: "#075985",
    fontWeight: "900",
    fontSize: 12
  },
  retryButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#fef3c7"
  },
  retryButtonText: {
    color: "#92400e",
    fontWeight: "900",
    fontSize: 12
  },
  supportButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#e0f2fe"
  },
  supportButtonText: {
    color: "#075985",
    fontWeight: "900",
    fontSize: 12
  },
  invoiceButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#ccfbf1"
  },
  invoiceButtonText: {
    color: "#0f766e",
    fontWeight: "900",
    fontSize: 12
  },
  cancelButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#fee2e2"
  },
  cancelButtonText: {
    color: "#991b1b",
    fontWeight: "900",
    fontSize: 12
  },
  totalBox: {
    borderTopWidth: 1,
    borderColor: "#e5e7eb",
    paddingTop: 10,
    gap: 4
  },
  taxPreview: {
    borderWidth: 1,
    borderColor: "#bae6fd",
    borderRadius: 8,
    padding: 9,
    backgroundColor: "#f0f9ff"
  },
  taxPreviewText: {
    color: "#075985",
    fontSize: 12,
    fontWeight: "800"
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  quickAction: {
    flexGrow: 1,
    flexBasis: "45%",
    borderWidth: 1,
    borderColor: "#b8e7df",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#f4fbfa",
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center"
  },
  quickActionText: {
    color: "#0f766e",
    fontWeight: "900"
  },
  operationGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  operationTile: {
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: 150,
    borderWidth: 1,
    borderColor: "#d7dee8",
    borderRadius: 8,
    padding: 11,
    backgroundColor: "#f8fafc",
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1
  },
  operationSuccess: {
    borderColor: "#86efac",
    backgroundColor: "#f0fdf4"
  },
  operationWarning: {
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb"
  },
  operationDanger: {
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2"
  },
  operationTitle: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "900"
  },
  operationSuccessText: {
    color: "#166534"
  },
  operationWarningText: {
    color: "#92400e"
  },
  operationDangerText: {
    color: "#991b1b"
  },
  operationValue: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 5
  },
  operationDetail: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4,
    lineHeight: 15
  },
  planLockCard: {
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 8,
    padding: 12,
    gap: 7,
    backgroundColor: "#eff6ff"
  },
  planLockHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  planLockKicker: {
    color: "#1d4ed8",
    fontSize: 11,
    fontWeight: "900"
  },
  planLockBadge: {
    color: "#0f766e",
    backgroundColor: "#ccfbf1",
    borderRadius: 8,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 10,
    fontWeight: "900"
  },
  planLockTitle: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900"
  },
  planLockText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
  },
  statBox: {
    flexGrow: 1,
    flexBasis: "45%",
    borderWidth: 1,
    borderColor: "#d7dee8",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#f8fafc",
    shadowColor: "#0f172a",
    shadowOpacity: 0.035,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1
  },
  statBoxSuccess: {
    borderColor: "#bbf7d0",
    backgroundColor: "#f0fdf4"
  },
  statBoxWarning: {
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb"
  },
  statBoxDanger: {
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2"
  },
  statBoxInfo: {
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff"
  },
  statValue: {
    color: "#111827",
    fontWeight: "900",
    fontSize: 16
  },
  statLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3
  },
  reportRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 8
  },
  reportLabel: {
    color: "#374151",
    fontWeight: "700",
    flex: 1
  },
  reportValue: {
    color: "#111827",
    fontWeight: "800",
    textAlign: "right"
  },
  reportStrong: {
    fontSize: 15,
    color: "#0f766e"
  },
  alertRow: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10
  },
  alertWarning: {
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb"
  },
  alertDanger: {
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2"
  },
  alertTitle: {
    fontWeight: "900"
  },
  alertDetail: {
    marginTop: 3,
    lineHeight: 17
  },
  alertWarningText: {
    color: "#92400e"
  },
  alertDangerText: {
    color: "#991b1b"
  },
  totalLine: {
    color: "#374151",
    textAlign: "right"
  },
  totalStrong: {
    color: "#111827",
    fontWeight: "900",
    textAlign: "right",
    fontSize: 18
  },
  hint: {
    color: "#6b7280",
    textAlign: "center",
    marginTop: 8
  },
  noticeBox: {
    borderWidth: 1,
    borderColor: "#86efac",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#f0fdf4"
  },
  editNoticeBox: {
    borderWidth: 1,
    borderColor: "#fbbf24",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#fffbeb",
    gap: 8
  },
  noticeTitle: {
    color: "#166534",
    fontWeight: "900"
  },
  noticeText: {
    color: "#166534",
    marginTop: 3,
    lineHeight: 18
  },
  issueNoticeBox: {
    borderWidth: 1,
    borderColor: "#fbbf24",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#fffbeb"
  },
  issueNoticeText: {
    color: "#92400e",
    fontWeight: "800",
    lineHeight: 18
  },
  xml: {
    fontFamily: "monospace",
    color: "#111827",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    lineHeight: 18
  }
});
