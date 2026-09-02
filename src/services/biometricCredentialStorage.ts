import AsyncStorage from "@react-native-async-storage/async-storage";
import type { User } from "../types";

const LEGACY_CREDENTIAL_KEY = "factudarwin.biometric-credential.v1";
const DEVICE_CREDENTIAL_KEY = "factudarwin.biometric-credential.v2";
const BIOMETRIC_ACCOUNT_HINT_KEY = "factudarwin:biometric-account-hint:v2";
const LEGACY_ACCOUNT_HINT_KEY = "factudarwin:biometric-account-hint:v1";

export type BiometricAccountHint = {
  version: 1 | 2;
  companyId: string;
  userId: string;
  email: string;
  displayName: string;
  backendUrl?: string;
};

export type BiometricCredential = {
  version: 2;
  companyId: string;
  userId: string;
  email: string;
  displayName: string;
  backendUrl: string;
  companyRuc: string;
  establishmentId: string;
  deviceId: string;
  sessionId: string;
  refreshToken: string;
  user: User;
};

export type LegacyBiometricCredential = Omit<BiometricCredential, "version" | "deviceId" | "sessionId" | "refreshToken"> & {
  token: string;
};

function isValidHint(value: unknown): value is BiometricAccountHint {
  const candidate = value as Partial<BiometricAccountHint> | null;
  return Boolean(candidate?.companyId && candidate.userId && candidate.email);
}

function isValidCredential(value: unknown): value is BiometricCredential {
  const candidate = value as Partial<BiometricCredential> | null;
  return Boolean(
    candidate?.version === 2 && candidate.companyId && candidate.userId && candidate.email &&
    candidate.backendUrl && candidate.companyRuc && candidate.deviceId && candidate.sessionId &&
    candidate.refreshToken && candidate.user?.id === candidate.userId
  );
}

function isValidLegacyCredential(value: unknown): value is LegacyBiometricCredential {
  const candidate = value as Partial<LegacyBiometricCredential> | null;
  return Boolean(
    candidate?.companyId && candidate.userId && candidate.email && candidate.backendUrl &&
    candidate.companyRuc && candidate.token && candidate.user?.id === candidate.userId
  );
}

async function getProtectedStore() {
  const secureStore = await import("expo-secure-store");
  return {
    secureStore,
    options: {
      keychainAccessible: secureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      requireAuthentication: true,
      authenticationPrompt: "Confirme su identidad para usar FactuDarwin"
    }
  };
}

export async function saveBiometricCredential(credential: BiometricCredential): Promise<void> {
  if (!isValidCredential(credential)) throw new Error("La credencial biometrica esta incompleta.");
  const { secureStore, options } = await getProtectedStore();
  await secureStore.setItemAsync(DEVICE_CREDENTIAL_KEY, JSON.stringify(credential), options);
  await AsyncStorage.setItem(BIOMETRIC_ACCOUNT_HINT_KEY, JSON.stringify({
    version: 2,
    companyId: credential.companyId,
    userId: credential.userId,
    email: credential.email,
    displayName: credential.displayName,
    backendUrl: credential.backendUrl
  } satisfies BiometricAccountHint));
}

export async function loadBiometricAccountHint(): Promise<BiometricAccountHint | null> {
  for (const key of [BIOMETRIC_ACCOUNT_HINT_KEY, LEGACY_ACCOUNT_HINT_KEY]) {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;
      const parsed: unknown = JSON.parse(raw);
      if (isValidHint(parsed)) return { ...parsed, version: key === BIOMETRIC_ACCOUNT_HINT_KEY ? 2 : 1 };
    } catch {
      // A corrupt non-secret hint must not delete the protected credential.
    }
  }
  return null;
}

export async function loadBiometricCredential(): Promise<BiometricCredential | null> {
  const { secureStore, options } = await getProtectedStore();
  const raw = await secureStore.getItemAsync(DEVICE_CREDENTIAL_KEY, options);
  if (!raw) return null;
  const parsed: unknown = JSON.parse(raw);
  return isValidCredential(parsed) ? parsed : null;
}

export async function loadLegacyBiometricCredential(): Promise<LegacyBiometricCredential | null> {
  const { secureStore } = await getProtectedStore();
  const raw = await secureStore.getItemAsync(LEGACY_CREDENTIAL_KEY);
  if (!raw) return null;
  const parsed: unknown = JSON.parse(raw);
  return isValidLegacyCredential(parsed) ? parsed : null;
}

export async function completeLegacyBiometricMigration(): Promise<void> {
  const { secureStore } = await getProtectedStore();
  await secureStore.deleteItemAsync(LEGACY_CREDENTIAL_KEY);
  await AsyncStorage.removeItem(LEGACY_ACCOUNT_HINT_KEY);
}

export async function clearBiometricCredential(): Promise<void> {
  const { secureStore } = await getProtectedStore();
  await Promise.all([
    secureStore.deleteItemAsync(DEVICE_CREDENTIAL_KEY),
    secureStore.deleteItemAsync(LEGACY_CREDENTIAL_KEY),
    AsyncStorage.removeItem(BIOMETRIC_ACCOUNT_HINT_KEY),
    AsyncStorage.removeItem(LEGACY_ACCOUNT_HINT_KEY)
  ]);
}
