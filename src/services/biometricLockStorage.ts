import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_PREFIX = "factura-sri-mobile:biometric-lock:v1";

export function biometricLockKey(companyId: string, userId: string): string {
  return `${KEY_PREFIX}:${encodeURIComponent(companyId.trim())}:${encodeURIComponent(userId.trim())}`;
}

export async function loadBiometricLockEnabled(companyId: string, userId: string): Promise<boolean> {
  if (!companyId.trim() || !userId.trim()) return false;
  return (await AsyncStorage.getItem(biometricLockKey(companyId, userId))) === "enabled";
}

export async function saveBiometricLockEnabled(companyId: string, userId: string, enabled: boolean): Promise<void> {
  if (!companyId.trim() || !userId.trim()) throw new Error("No se pudo identificar la cuenta para protegerla.");
  const key = biometricLockKey(companyId, userId);
  if (!enabled) {
    await AsyncStorage.removeItem(key);
    return;
  }
  await AsyncStorage.setItem(key, "enabled");
  if ((await AsyncStorage.getItem(key)) !== "enabled") throw new Error("No se pudo verificar la proteccion biometrica.");
}
