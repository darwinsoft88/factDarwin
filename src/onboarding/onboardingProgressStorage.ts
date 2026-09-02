import AsyncStorage from "@react-native-async-storage/async-storage";
import { ONBOARDING_VERSION, type OnboardingExperience } from "./onboardingTypes";

const PREFIX = "factudarwin:onboarding";

export function onboardingStorageKey(userId: string, companyId: string, version = ONBOARDING_VERSION): string | null {
  const safeUser = normalizeScope(userId);
  const safeCompany = normalizeScope(companyId);
  if (!safeUser || !safeCompany || !Number.isInteger(version) || version <= 0) return null;
  return `${PREFIX}:v${version}:${safeUser}:${safeCompany}`;
}

export function defaultOnboardingExperience(): OnboardingExperience {
  return { version: ONBOARDING_VERSION, welcomeSeen: false, centerMinimized: false, completionAcknowledged: false, skippedOptionalSteps: [], seenCoachMarks: [] };
}

export async function loadOnboardingExperience(userId: string, companyId: string): Promise<OnboardingExperience> {
  const key = onboardingStorageKey(userId, companyId);
  if (!key) return defaultOnboardingExperience();
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return defaultOnboardingExperience();
    return normalizeExperience(JSON.parse(raw));
  } catch {
    return defaultOnboardingExperience();
  }
}

export async function saveOnboardingExperience(userId: string, companyId: string, experience: OnboardingExperience): Promise<void> {
  const key = onboardingStorageKey(userId, companyId);
  if (!key) return;
  await AsyncStorage.setItem(key, JSON.stringify(normalizeExperience(experience)));
}

function normalizeScope(value: string): string {
  return String(value || "").trim().replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160);
}

function normalizeExperience(value: unknown): OnboardingExperience {
  const defaults = defaultOnboardingExperience();
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const source = value as Partial<OnboardingExperience>;
  if (source.version !== ONBOARDING_VERSION) return defaults;
  const stepIds = new Set(["business", "product", "first-sale", "own-client"]);
  const coachIds = new Set(["product-create", "sale-create", "certificate-upload"]);
  return {
    version: ONBOARDING_VERSION,
    welcomeSeen: source.welcomeSeen === true,
    centerMinimized: source.centerMinimized === true,
    completionAcknowledged: source.completionAcknowledged === true,
    skippedOptionalSteps: Array.isArray(source.skippedOptionalSteps) ? source.skippedOptionalSteps.filter((id) => stepIds.has(id)) as OnboardingExperience["skippedOptionalSteps"] : [],
    seenCoachMarks: Array.isArray(source.seenCoachMarks) ? source.seenCoachMarks.filter((id) => coachIds.has(id)) as OnboardingExperience["seenCoachMarks"] : []
  };
}

