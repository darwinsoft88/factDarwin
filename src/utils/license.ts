import { BackendLicenseStatus } from "../services/backend";
import { AppLicense, Issuer } from "../types";
import { normalizedEstablishments } from "./establishments";

export function maxEmissionPointsForLicense(license?: AppLicense | BackendLicenseStatus) {
  if (license?.plan === "trial" || isProLicensePlan(license?.plan) || isPremiumLicensePlan(license?.plan)) return Math.max(999, Number(license?.maxEmissionPoints || 999));
  return 1;
}

export function isProLicensePlan(plan?: string) {
  return String(plan || "").startsWith("pro_");
}

export function isPremiumLicensePlan(plan?: string) {
  return String(plan || "").startsWith("premium_");
}

export function normalizeLicensePlanValue(plan?: string) {
  if (plan === "mensual") return "basico_mensual";
  if (plan === "anual") return "basico_anual";
  if (plan === "pro") return "pro_anual";
  if (["trial", "basico_mensual", "basico_anual", "pro_mensual", "pro_anual", "premium_mensual", "premium_anual"].includes(String(plan))) return String(plan);
  return "trial";
}

export function canUseEmissionScope(issuer: Issuer, license: AppLicense | BackendLicenseStatus | undefined, establishmentId: string) {
  const allowed = normalizedEstablishments(issuer).filter((item) => item.active !== false).slice(0, maxEmissionPointsForLicense(license));
  return allowed.some((item) => item.id === establishmentId);
}
