import AsyncStorage from "@react-native-async-storage/async-storage";

export type ThemePreference = "light" | "dark" | "system";

const THEME_PREFERENCE_KEY = "factura-sri-mobile:theme-preference:v1";
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "light";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export async function loadThemePreference(): Promise<ThemePreference> {
  try {
    const stored = await AsyncStorage.getItem(THEME_PREFERENCE_KEY);
    return isThemePreference(stored) ? stored : DEFAULT_THEME_PREFERENCE;
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

export async function saveThemePreference(preference: ThemePreference): Promise<void> {
  if (!isThemePreference(preference)) {
    throw new TypeError("Preferencia de tema no valida.");
  }

  await AsyncStorage.setItem(THEME_PREFERENCE_KEY, preference);
  const verified = await AsyncStorage.getItem(THEME_PREFERENCE_KEY);
  if (verified !== preference) {
    throw new Error("No se pudo verificar la preferencia de tema.");
  }
}
