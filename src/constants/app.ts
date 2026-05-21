import { Platform } from "react-native";

export const LIST_BATCH_SIZE = 25;
export const AUTO_BACKUP_DEBOUNCE_MS = Platform.OS === "web" ? 3000 : 1000;
export const REMOTE_REFRESH_THROTTLE_MS = Platform.OS === "web" ? 5000 : 30000;
export const WEB_REMOTE_REFRESH_INTERVAL_MS = 7000;
export const CONNECTIVITY_SYNC_THROTTLE_MS = 6000;
export const APP_BRAND = "FactuDarwin";
export const APP_TAGLINE = "Facturacion electronica Ecuador";
