import AsyncStorage from "@react-native-async-storage/async-storage";

export type IncrementalEntityVersion = { recordVersion: number; payloadHash: string; action: "UPSERT" | "DELETE" };
export type IncrementalCursorState = {
  companyId: string;
  protocolVersion: 1 | 2;
  configVersion: string;
  moduleSet: string;
  cursor: string;
  snapshotRevision: number;
  versions: Record<string, IncrementalEntityVersion>;
  savedAt: string;
  inactive?: boolean;
};

const prefix = "factudarwin:incremental-cursor:v1";
const key = (companyId: string, configVersion: string, moduleSet: string, protocolVersion: 1 | 2 = 1) => `${prefix}:${companyId}:p${protocolVersion}:${configVersion}:${moduleSet}`;

export async function loadIncrementalCursor(companyId: string, configVersion: string, moduleSet: string, protocolVersion: 1 | 2 = 1): Promise<IncrementalCursorState | null> {
  try {
    const raw = await AsyncStorage.getItem(key(companyId, configVersion, moduleSet, protocolVersion));
    if (!raw) return null;
    const value = JSON.parse(raw) as IncrementalCursorState;
    if (value.companyId !== companyId || value.protocolVersion !== protocolVersion || value.configVersion !== configVersion || value.moduleSet !== moduleSet || !value.cursor || !value.versions || value.inactive) return null;
    return value;
  } catch { return null; }
}

export async function saveIncrementalCursor(state: IncrementalCursorState): Promise<void> {
  const serialized = JSON.stringify(state);
  const storageKey = key(state.companyId, state.configVersion, state.moduleSet, state.protocolVersion);
  await AsyncStorage.setItem(storageKey, serialized);
  if (await AsyncStorage.getItem(storageKey) !== serialized) throw new Error("No se pudo verificar el cursor incremental.");
}

export async function markIncrementalCursorInactive(companyId: string): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  for (const storageKey of keys.filter((item) => item.startsWith(`${prefix}:${companyId}:`))) {
    const raw = await AsyncStorage.getItem(storageKey);
    if (raw) await AsyncStorage.setItem(storageKey, JSON.stringify({ ...JSON.parse(raw), inactive: true }));
  }
}
