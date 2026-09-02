import AsyncStorage from "@react-native-async-storage/async-storage";

const PASSKEY_HINT_KEY = "factudarwin:passkey-account-hint:v1";

export type PasskeyAccountHint = {
  companyId: string;
  userId: string;
  email: string;
  displayName: string;
  backendUrl: string;
  companyRuc: string;
  establishmentId: string;
};

function valid(value: unknown): value is PasskeyAccountHint {
  const item = value as Partial<PasskeyAccountHint> | null;
  return Boolean(item?.companyId && item.userId && item.email && item.backendUrl && item.companyRuc);
}

export async function savePasskeyAccountHint(hint: PasskeyAccountHint): Promise<void> {
  if (!valid(hint)) throw new Error("La cuenta de Passkey esta incompleta.");
  await AsyncStorage.setItem(PASSKEY_HINT_KEY, JSON.stringify(hint));
}

export async function loadPasskeyAccountHint(): Promise<PasskeyAccountHint | null> {
  try {
    const raw = await AsyncStorage.getItem(PASSKEY_HINT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return valid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearPasskeyAccountHint(): Promise<void> {
  await AsyncStorage.removeItem(PASSKEY_HINT_KEY);
}
