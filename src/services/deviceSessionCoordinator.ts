import AsyncStorage from "@react-native-async-storage/async-storage";
import { refreshDeviceSession, registerDeviceSession } from "./backend";
import {
  completeLegacyBiometricMigration,
  loadBiometricCredential,
  saveBiometricCredential,
  type BiometricCredential
} from "./biometricCredentialStorage";
import { getIncrementalDeviceId } from "./incrementalDeviceIdentity";
import type { User } from "../types";

const REQUEST_KEY_PREFIX = "factudarwin:device-refresh-request:v2:";
let refreshInFlight: Promise<DeviceSessionRefreshResult> | null = null;

export type DeviceSessionRefreshResult = {
  token: string;
  user: BiometricCredential["user"];
  credential: BiometricCredential;
};

export async function refreshRegisteredDeviceSession(): Promise<DeviceSessionRefreshResult> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = runRefresh().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

export async function registerCurrentDeviceSession(input: {
  backendUrl: string;
  accessToken: string;
  companyRuc: string;
  establishmentId: string;
  user: User;
  platform: string;
}): Promise<BiometricCredential> {
  if (!input.accessToken || !input.user.companyId) throw codedError("DEVICE_SESSION_REQUEST_INVALID", "Inicie sesion en linea antes de activar la biometria.");
  const deviceId = await getIncrementalDeviceId();
  const result = await registerDeviceSession(input.backendUrl, input.accessToken, {
    deviceId,
    deviceLabel: input.platform,
    platform: input.platform
  });
  const credential: BiometricCredential = {
    version: 2,
    companyId: input.user.companyId,
    userId: input.user.id,
    email: input.user.email,
    displayName: input.user.name,
    backendUrl: input.backendUrl,
    companyRuc: input.companyRuc,
    establishmentId: input.establishmentId,
    deviceId,
    sessionId: result.sessionId!,
    refreshToken: result.refreshToken!,
    user: input.user
  };
  await saveBiometricCredential(credential);
  await completeLegacyBiometricMigration();
  return credential;
}

async function runRefresh(): Promise<DeviceSessionRefreshResult> {
  const credential = await loadBiometricCredential();
  if (!credential) throw codedError("BIOMETRIC_CREDENTIAL_INVALIDATED", "La credencial segura ya no esta disponible.");
  const requestKey = `${REQUEST_KEY_PREFIX}${credential.sessionId}`;
  let requestId = await AsyncStorage.getItem(requestKey);
  if (!requestId) {
    const { randomUUID } = await import("expo-crypto");
    requestId = randomUUID();
    await AsyncStorage.setItem(requestKey, requestId);
  }

  const result = await refreshDeviceSession(credential.backendUrl, {
    refreshToken: credential.refreshToken,
    requestId,
    deviceId: credential.deviceId
  });
  if (!result.user || result.user.id !== credential.userId || result.user.companyId !== credential.companyId) {
    throw codedError("TENANT_MISMATCH", "La sesion renovada no coincide con la cuenta registrada.");
  }
  const nextCredential: BiometricCredential = {
    ...credential,
    refreshToken: result.refreshToken!,
    sessionId: result.sessionId || credential.sessionId,
    user: {
      ...credential.user,
      ...result.user,
      role: (result.user.role || credential.user.role) as BiometricCredential["user"]["role"]
    }
  };
  await saveBiometricCredential(nextCredential);
  await AsyncStorage.removeItem(requestKey);
  return { token: result.token!, user: nextCredential.user, credential: nextCredential };
}

export function shouldInvalidateDeviceCredential(error: unknown): boolean {
  const code = String((error as { code?: string } | null)?.code || "");
  return [
    "DEVICE_SESSION_CREDENTIAL_INVALID",
    "DEVICE_SESSION_REVOKED",
    "REFRESH_REPLAY",
    "ACCOUNT_DISABLED",
    "TENANT_MISMATCH",
    "BIOMETRIC_CREDENTIAL_INVALIDATED"
  ].includes(code);
}

function codedError(code: string, message: string) {
  const error = new Error(message) as Error & { code?: string };
  error.code = code;
  return error;
}
