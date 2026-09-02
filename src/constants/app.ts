import { Platform } from "react-native";

export const LIST_BATCH_SIZE = 25;
export const AUTO_BACKUP_DEBOUNCE_MS = 15000;
export const REMOTE_REFRESH_THROTTLE_MS = Platform.OS === "web" ? 30000 : 30000;
export const WEB_REMOTE_REFRESH_INTERVAL_MS = 60000;
export const WEB_SRI_AUTHORIZATION_QUERY_THROTTLE_MS = 5 * 60000;
export const CONNECTIVITY_SYNC_THROTTLE_MS = 6000;
export const APP_BRAND = "FactuDarwin";
export const APP_TAGLINE = "Facturacion electronica Ecuador";
