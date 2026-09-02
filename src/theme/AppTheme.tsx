import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ColorSchemeName, useColorScheme } from "react-native";
import { DEFAULT_THEME_PREFERENCE, loadThemePreference, saveThemePreference, ThemePreference } from "./themeStorage";

export type ResolvedTheme = "light" | "dark";

const lightColors = {
  background: "#f6f8fb",
  surface: "#ffffff",
  surfaceMuted: "#f8fafc",
  surfaceElevated: "#ffffff",
  text: "#111827",
  textMuted: "#64748b",
  textSubtle: "#94a3b8",
  border: "#e2e8f0",
  borderStrong: "#cbd5e1",
  primary: "#0f766e",
  primaryStrong: "#0f5f59",
  primarySoft: "#ecfdf5",
  success: "#047857",
  successSoft: "#d1fae5",
  warning: "#d97706",
  warningSoft: "#fef3c7",
  danger: "#b91c1c",
  dangerSoft: "#fee2e2",
  info: "#2563eb",
  infoSoft: "#dbeafe",
  accent: "#6d5bd0",
  accentSoft: "#f5f3ff",
  backdrop: "rgba(15, 23, 42, 0.48)",
  shadow: "#020617",
  onPrimary: "#ffffff"
} as const;

const darkColors: Record<keyof typeof lightColors, string> = {
  background: "#08111f",
  surface: "#111c2e",
  surfaceMuted: "#162235",
  surfaceElevated: "#1b293d",
  text: "#f8fafc",
  textMuted: "#cbd5e1",
  textSubtle: "#94a3b8",
  border: "#29384d",
  borderStrong: "#3b4c63",
  primary: "#2dd4bf",
  primaryStrong: "#5eead4",
  primarySoft: "#123b3a",
  success: "#34d399",
  successSoft: "#12382f",
  warning: "#fbbf24",
  warningSoft: "#422f12",
  danger: "#f87171",
  dangerSoft: "#431c24",
  info: "#60a5fa",
  infoSoft: "#172d52",
  accent: "#c4b5fd",
  accentSoft: "#302650",
  backdrop: "rgba(2, 6, 23, 0.72)",
  shadow: "#000000",
  onPrimary: "#042f2e"
};

export type AppTheme = {
  mode: ResolvedTheme;
  dark: boolean;
  colors: Record<keyof typeof lightColors, string>;
};

type AppThemeContextValue = {
  preference: ThemePreference;
  theme: AppTheme;
  ready: boolean;
  setPreference: (preference: ThemePreference) => Promise<void>;
};

const fallbackTheme: AppTheme = { mode: "light", dark: false, colors: lightColors };
const AppThemeContext = createContext<AppThemeContextValue>({
  preference: DEFAULT_THEME_PREFERENCE,
  theme: fallbackTheme,
  ready: false,
  setPreference: async () => undefined
});

function resolveTheme(preference: ThemePreference, systemScheme: ColorSchemeName): ResolvedTheme {
  if (preference === "system") return systemScheme === "dark" ? "dark" : "light";
  return preference;
}

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setStoredPreference] = useState<ThemePreference>(DEFAULT_THEME_PREFERENCE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    void loadThemePreference().then((stored) => {
      if (!mounted) return;
      setStoredPreference(stored);
      setReady(true);
    });
    return () => { mounted = false; };
  }, []);

  const setPreference = useCallback(async (nextPreference: ThemePreference) => {
    await saveThemePreference(nextPreference);
    setStoredPreference(nextPreference);
  }, []);

  const value = useMemo<AppThemeContextValue>(() => {
    const mode = resolveTheme(preference, systemScheme);
    return {
      preference,
      ready,
      setPreference,
      theme: {
        mode,
        dark: mode === "dark",
        colors: mode === "dark" ? darkColors : lightColors
      }
    };
  }, [preference, ready, setPreference, systemScheme]);

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme(): AppThemeContextValue {
  return useContext(AppThemeContext);
}
