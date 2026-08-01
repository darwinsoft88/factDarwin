export const SQLITE_REMISSION_GUIDES_READ_FEATURE_FLAG =
  "EXPO_PUBLIC_SQLITE_REMISSION_GUIDE_READS";

export function sqliteRemissionGuideReadsEnabled(): boolean {
  return process.env.EXPO_PUBLIC_SQLITE_REMISSION_GUIDE_READS === "1";
}
