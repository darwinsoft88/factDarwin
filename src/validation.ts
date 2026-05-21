import { AppData, AppLicense, Client, Issuer, LicensePlan, LicenseStatus, Product, UserRole } from "./types";

const validRoles = new Set<UserRole>(["admin", "vendedor", "cajero", "contador"]);
const validLicenseStatuses = new Set<LicenseStatus>(["trial", "active", "expired", "suspended"]);
const validLicensePlans = new Set<LicensePlan>(["trial", "basico_mensual", "basico_anual", "pro_mensual", "pro_anual"]);

export function normalizeClientIdentification(value: string) {
  return value.trim().replace(/\s+/g, "");
}

export function normalizeProductCode(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export function normalizeUserEmail(value: string) {
  return value.trim().toLowerCase();
}

export function findDuplicateClient(clients: Client[], identification: string, currentId = "") {
  const normalized = normalizeClientIdentification(identification);
  return clients.find((client) => client.id !== currentId && normalizeClientIdentification(client.identification) === normalized);
}

export function findDuplicateProductCode(products: Product[], code: string, currentId = "") {
  const normalized = normalizeProductCode(code);
  return products.find((product) => product.id !== currentId && normalizeProductCode(product.code) === normalized);
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isValidUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function isValidCedula(value: string) {
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

export function isValidRuc(value: string) {
  if (!/^\d{13}$/.test(value) || !value.endsWith("001")) return false;
  const thirdDigit = Number(value[2]);

  if (thirdDigit < 6) return isValidCedula(value.slice(0, 10));
  if (thirdDigit === 6) return validateMod11(value, [3, 2, 7, 6, 5, 4, 3, 2], 8);
  if (thirdDigit === 9) return validateMod11(value, [4, 3, 2, 7, 6, 5, 4, 3, 2], 9);

  return false;
}

export function sanitizeAppData(data: AppData): AppData {
  const deletedIds = normalizeDeletedIds(data.deletedIds, data.auditLogs || []);
  const deletedClients = new Set(deletedIds.clients);
  const deletedProducts = new Set(deletedIds.products);
  const deletedUsers = new Set(deletedIds.users);
  const seenClients = new Set<string>();
  const clients = data.clients.map((client) => ({
    ...client,
    identification: normalizeClientIdentification(client.identification),
    email: client.email.trim(),
    phone: client.phone.trim(),
    updatedAt: client.updatedAt || ""
  })).filter((client) => {
    if (deletedClients.has(client.id)) return false;
    const key = normalizeClientIdentification(client.identification);
    if (!key || seenClients.has(key)) return false;
    seenClients.add(key);
    return true;
  });

  const seenProducts = new Set<string>();
  const products = data.products.map((product) => ({
    ...product,
    code: normalizeProductCode(product.code),
    name: product.name.trim(),
    cost: Number.isFinite(Number(product.cost)) ? Number(product.cost) : 0,
    minStock: Number.isFinite(Number(product.minStock)) ? Number(product.minStock) : 5,
    updatedAt: product.updatedAt || ""
  })).filter((product) => {
    if (deletedProducts.has(product.id)) return false;
    const key = normalizeProductCode(product.code);
    if (!key || seenProducts.has(key)) return false;
    seenProducts.add(key);
    return true;
  });

  const seenUsers = new Set<string>();
  const users = data.users.map((user) => ({
    ...user,
    name: user.name.trim(),
    email: normalizeUserEmail(user.email),
    role: validRoles.has(user.role as UserRole) ? user.role : "vendedor"
  })).filter((user) => {
    if (deletedUsers.has(user.id)) return false;
    const key = normalizeUserEmail(user.email);
    if (!key || seenUsers.has(key)) return false;
    seenUsers.add(key);
    return true;
  });

  return {
    ...data,
    issuer: sanitizeIssuer(data.issuer),
    clients,
    products,
    users,
    auditLogs: data.auditLogs || [],
    receivedRetentions: data.receivedRetentions || [],
    guides: data.guides || [],
    cashClosings: data.cashClosings || [],
    pendingSync: data.pendingSync || [],
    deletedIds,
    license: sanitizeLicense(data.license)
  };
}

function validateMod11(value: string, coefficients: number[], verifierIndex: number) {
  const total = coefficients.reduce((sum, coefficient, index) => sum + Number(value[index]) * coefficient, 0);
  const remainder = total % 11;
  const verifier = remainder === 0 ? 0 : 11 - remainder;

  return verifier === Number(value[verifierIndex]);
}

function normalizeDeletedIds(deletedIds: AppData["deletedIds"], auditLogs: AppData["auditLogs"]) {
  const result = {
    clients: new Set<string>(deletedIds?.clients || []),
    products: new Set<string>(deletedIds?.products || []),
    users: new Set<string>(deletedIds?.users || [])
  };
  (auditLogs || []).forEach((log) => {
    if (!log.entityId) return;
    if (log.event === "CLIENT_DELETED") result.clients.add(log.entityId);
    if (log.event === "PRODUCT_DELETED") result.products.add(log.entityId);
    if (log.event === "USER_DELETED") result.users.add(log.entityId);
  });
  return {
    clients: Array.from(result.clients),
    products: Array.from(result.products),
    users: Array.from(result.users)
  };
}

function sanitizeIssuer(issuer: Issuer): Issuer {
  const source = issuer || ({} as Issuer);
  const ruc = source.ruc === "1790012345001" ? "1790012344001" : source.ruc;
  const fallbackId = `${String(source.establishment || "001").padStart(3, "0")}-${String(source.emissionPoint || "001").padStart(3, "0")}`;
  const rawEstablishments = Array.isArray(source.establishments) && source.establishments.length > 0
    ? source.establishments
    : [{
      id: fallbackId,
      name: "Matriz",
      establishment: source.establishment || "001",
      emissionPoint: source.emissionPoint || "001",
      address: source.address || "",
      sequential: source.sequential || 1,
      remissionSequential: source.remissionSequential || 1,
      creditNoteSequential: source.creditNoteSequential || 1,
      active: true
    }];
  const seen = new Set<string>();
  const establishments = normalizeEstablishmentNames(rawEstablishments.map((item) => {
    const establishment = String(item.establishment || "001").replace(/\D/g, "").padStart(3, "0").slice(-3);
    const emissionPoint = String(item.emissionPoint || "001").replace(/\D/g, "").padStart(3, "0").slice(-3);
    const id = `${establishment}-${emissionPoint}`;
    return {
      id,
      name: String(item.name || `Establecimiento ${id}`).trim(),
      establishment,
      emissionPoint,
      address: String(item.address || source.address || "").trim(),
      sequential: positiveInteger(item.sequential, 1),
      remissionSequential: positiveInteger(item.remissionSequential || 1, 1),
      creditNoteSequential: positiveInteger(item.creditNoteSequential || 1, 1),
      active: item.active !== false
  };
  })).filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  const active = establishments.find((item) => item.id === source.activeEstablishmentId && item.active) || establishments.find((item) => item.active) || establishments[0] || {
    id: "001-001",
    name: "Matriz",
    establishment: "001",
    emissionPoint: "001",
    address: source.address || "",
    sequential: source.sequential || 1,
    remissionSequential: source.remissionSequential || 1,
    creditNoteSequential: source.creditNoteSequential || 1,
    active: true
  };

  return {
    ...source,
    ruc,
    email: normalizeUserEmail(source.email || ""),
    activeEstablishmentId: active.id,
    establishmentsUpdatedAt: source.establishmentsUpdatedAt || "",
    establishments,
    establishment: active.establishment,
    emissionPoint: active.emissionPoint,
    address: active.address || source.address || "",
    sequential: active.sequential,
    remissionSequential: active.remissionSequential || 1,
    creditNoteSequential: active.creditNoteSequential || 1
  };
}

function normalizeEstablishmentNames<T extends { id: string; name: string; establishment: string; emissionPoint: string }>(establishments: T[]) {
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

function sanitizeLicense(license?: AppLicense): AppLicense {
  const today = new Date();
  const expires = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const fallback: AppLicense = {
    status: "trial",
    plan: "trial",
    startsAt: today.toISOString().slice(0, 10),
    expiresAt: expires.toISOString().slice(0, 10),
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
    notes: "Licencia de prueba inicial"
  };
  const source = license || fallback;

  const plan = normalizeLicensePlan(source.plan);
  const openAllModules = plan === "trial";
  const proPlan = isProLicensePlan(plan);
  const features = {
    ...fallback.features,
    ...(source.features || {})
  };
  const multiEmissionPoint = openAllModules || proPlan;

  return {
    ...fallback,
    ...source,
    status: validLicenseStatuses.has(source.status) ? source.status : fallback.status,
    plan,
    startsAt: normalizeDate(source.startsAt) || fallback.startsAt,
    expiresAt: normalizeDate(source.expiresAt) || fallback.expiresAt,
    maxUsers: positiveInteger(source.maxUsers, fallback.maxUsers),
    maxDevices: positiveInteger(source.maxDevices, fallback.maxDevices),
    maxEmissionPoints: multiEmissionPoint ? Math.max(999, positiveInteger(source.maxEmissionPoints || 999, 999)) : 1,
    features: {
      ...features,
      sales: openAllModules || features.sales !== false,
      sri: openAllModules || features.sri !== false,
      inventory: openAllModules || features.inventory !== false,
      reports: openAllModules || features.reports !== false,
      multiDevice: openAllModules || features.multiDevice !== false,
      multiEmissionPoint
    },
    notes: String(source.notes || "")
  };
}

function normalizeLicensePlan(plan: unknown): LicensePlan {
  if (plan === "mensual") return "basico_mensual";
  if (plan === "anual") return "basico_anual";
  if (plan === "pro") return "pro_anual";
  return validLicensePlans.has(plan as LicensePlan) ? plan as LicensePlan : "trial";
}

function isProLicensePlan(plan: LicensePlan) {
  return plan === "pro_mensual" || plan === "pro_anual";
}

function normalizeDate(value: string) {
  const date = new Date(`${String(value || "").slice(0, 10)}T00:00:00`);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "";
}

function positiveInteger(value: number, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
