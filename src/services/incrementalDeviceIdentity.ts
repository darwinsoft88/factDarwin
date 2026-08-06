import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const KEY = "factudarwin:incremental-device-id:v1";

export async function getIncrementalDeviceId(): Promise<string> {
  const existing = (await AsyncStorage.getItem(KEY))?.trim();
  if (existing) return existing;
  const { randomUUID } = await import("expo-crypto");
  const created = `${Platform.OS}-${randomUUID()}`;
  await AsyncStorage.setItem(KEY, created);
  const verified = await AsyncStorage.getItem(KEY);
  if (verified !== created) throw new Error("No se pudo confirmar la identidad durable del dispositivo.");
  return created;
}
