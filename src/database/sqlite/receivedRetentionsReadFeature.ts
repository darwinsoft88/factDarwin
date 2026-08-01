export const SQLITE_RECEIVED_RETENTIONS_READ_FEATURE_FLAG =
  "EXPO_PUBLIC_SQLITE_RECEIVED_RETENTIONS_READS";

export function sqliteReceivedRetentionsReadsEnabled(): boolean {
  return process.env.EXPO_PUBLIC_SQLITE_RECEIVED_RETENTIONS_READS === "1";
}
