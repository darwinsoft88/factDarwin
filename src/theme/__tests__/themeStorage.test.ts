const store = new Map<string, string>();

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async (key: string) => store.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { store.set(key, value); })
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_THEME_PREFERENCE, isThemePreference, loadThemePreference, saveThemePreference } from "../themeStorage";

describe("theme preference storage", () => {
  beforeEach(() => {
    store.clear();
    jest.clearAllMocks();
  });

  it("uses light as the safe default", async () => {
    expect(await loadThemePreference()).toBe(DEFAULT_THEME_PREFERENCE);
  });

  it.each(["light", "dark", "system"] as const)("persists and verifies %s", async (preference) => {
    await saveThemePreference(preference);
    expect(await loadThemePreference()).toBe(preference);
  });

  it("falls back to light for corrupted values", async () => {
    store.set("factura-sri-mobile:theme-preference:v1", "unknown");
    expect(await loadThemePreference()).toBe("light");
  });

  it("falls back to light when storage cannot be read", async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error("storage unavailable"));
    expect(await loadThemePreference()).toBe("light");
  });

  it("rejects unsupported values", () => {
    expect(isThemePreference("blue")).toBe(false);
    expect(() => saveThemePreference("blue" as never)).rejects.toThrow("Preferencia de tema no valida");
  });
});
