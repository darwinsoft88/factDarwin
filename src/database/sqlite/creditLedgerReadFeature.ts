export const SQLITE_CREDIT_LEDGER_READ_FEATURE_FLAG =
  "EXPO_PUBLIC_SQLITE_CREDIT_LEDGER_READS";

export function sqliteCreditLedgerReadsEnabled(): boolean {
  return process.env.EXPO_PUBLIC_SQLITE_CREDIT_LEDGER_READS === "1";
}
