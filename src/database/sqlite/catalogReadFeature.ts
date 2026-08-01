export const SQLITE_CATALOG_READ_FEATURE_FLAG =
  "EXPO_PUBLIC_SQLITE_CATALOG_READS";

export function sqliteCatalogReadsEnabled(): boolean {
  return process.env.EXPO_PUBLIC_SQLITE_CATALOG_READS === "1";
}
