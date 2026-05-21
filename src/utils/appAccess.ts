import { licensePlanOptions, roleOptions } from "../constants/options";
import { BackendLicenseStatus } from "../services/backend";
import { AppLicense, UserRole } from "../types";
import { parseInputDate } from "./format";
import { normalizeLicensePlanValue } from "./license";

export type AppTab = "dashboard" | "ventas" | "clientes" | "productos" | "inventario" | "caja" | "guias" | "usuarios" | "reportes" | "sri";

export function tabLabel(tab: AppTab) {
  const labels: Record<AppTab, string> = {
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

export function roleLabel(role: UserRole) {
  return roleOptions.find((option) => option.value === role)?.label || "Vendedor";
}

export function appLicenseStatus(license?: AppLicense | BackendLicenseStatus) {
  const today = new Date();
  const expires = parseInputDate(String(license?.expiresAt || ""), "end");
  const expiredByDate = expires ? expires.getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() : false;
  const rawStatus = String(license?.status || "trial");
  const effectiveStatus = rawStatus === "suspended" ? "suspended" : expiredByDate || rawStatus === "expired" ? "expired" : rawStatus;
  const active = (rawStatus === "active" || rawStatus === "trial") && !expiredByDate;
  const daysLeft = expires ? Math.ceil((expires.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000) : 0;
  return { active, effectiveStatus, daysLeft };
}

export function licenseStatusLabel(license?: AppLicense | BackendLicenseStatus) {
  const status = appLicenseStatus(license);
  if (status.effectiveStatus === "suspended") return "Licencia suspendida";
  if (status.effectiveStatus === "expired") return "Licencia vencida";
  const plan = licensePlanOptions.find((option) => option.value === normalizeLicensePlanValue(license?.plan))?.label || "Demo";
  return `${plan} | vence ${license?.expiresAt || "sin fecha"} | ${Math.max(0, status.daysLeft)} dias`;
}

export function compactLicenseStatusLabel(license?: AppLicense | BackendLicenseStatus) {
  const status = appLicenseStatus(license);
  if (status.effectiveStatus === "suspended") return "Suspendida";
  if (status.effectiveStatus === "expired") return "Vencida";
  const plan = licensePlanOptions.find((option) => option.value === normalizeLicensePlanValue(license?.plan))?.label || "Demo";
  return `${plan} activo`;
}

export function tabsForRole(role: UserRole): AppTab[] {
  if (role === "admin") return ["dashboard", "ventas", "clientes", "productos", "inventario", "caja", "guias", "reportes", "usuarios", "sri"];
  if (role === "cajero") return ["dashboard", "ventas", "clientes", "caja", "reportes"];
  if (role === "contador") return ["dashboard", "caja", "reportes"];
  return ["dashboard", "ventas", "clientes", "productos", "inventario", "caja", "guias", "reportes"];
}

export function filterTabsByLicense(tabs: AppTab[], license: AppLicense | undefined, role: UserRole) {
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

export function canDeleteCatalog(role: UserRole) {
  return role === "admin";
}

export function canAccessSensitiveSupport(role: UserRole) {
  return role === "admin" || role === "contador";
}

export function canManageFiscalAdjustments(role: UserRole) {
  return role === "admin" || role === "contador";
}

export function canRetryDocuments(role: UserRole) {
  return role === "admin" || role === "contador";
}

export function canVoidDocuments(role: UserRole) {
  return role === "admin" || role === "contador";
}

export function canIssueFromInternalDocuments(role: UserRole) {
  return role === "admin" || role === "vendedor" || role === "cajero";
}

export function canEditCatalog(role: UserRole) {
  return role === "admin" || role === "vendedor" || role === "cajero";
}
