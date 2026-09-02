const ACCESS_TOKEN_KEY = "factudarwin.active-access-token.v2";

export function usesNativeSecureSessionToken(): boolean {
  return typeof navigator !== "undefined" && navigator.product === "ReactNative";
}

export async function loadNativeSessionToken(): Promise<string> {
  if (!usesNativeSecureSessionToken()) return "";
  const secureStore = await import("expo-secure-store");
  return (await secureStore.getItemAsync(ACCESS_TOKEN_KEY)) || "";
}

export async function saveNativeSessionToken(token: string): Promise<void> {
  if (!usesNativeSecureSessionToken()) return;
  const secureStore = await import("expo-secure-store");
  if (!token) {
    await secureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    return;
  }
  await secureStore.setItemAsync(ACCESS_TOKEN_KEY, token, {
    keychainAccessible: secureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  });
}

export async function clearNativeSessionToken(): Promise<void> {
  if (!usesNativeSecureSessionToken()) return;
  const secureStore = await import("expo-secure-store");
  await secureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
}
