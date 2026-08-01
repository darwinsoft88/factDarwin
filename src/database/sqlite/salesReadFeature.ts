export const SQLITE_SALES_READ_FEATURE_FLAG =
  "EXPO_PUBLIC_SQLITE_SALES_READS";

export function sqliteSalesReadsEnabled(): boolean {
  return process.env.EXPO_PUBLIC_SQLITE_SALES_READS === "1";
}
