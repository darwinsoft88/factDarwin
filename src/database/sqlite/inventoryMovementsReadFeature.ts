export const SQLITE_INVENTORY_MOVEMENTS_READ_FEATURE_FLAG =
  "EXPO_PUBLIC_SQLITE_INVENTORY_MOVEMENT_READS";

export function sqliteInventoryMovementReadsEnabled(): boolean {
  return process.env.EXPO_PUBLIC_SQLITE_INVENTORY_MOVEMENT_READS === "1";
}
