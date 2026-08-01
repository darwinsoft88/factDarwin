import type { PendingSyncItem } from "../../types";
import { normalizeSyncRequestId } from "../../utils/pendingSync";

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stable(nested)]),
    );
  }
  return value;
}

export function canonicalPendingSyncItem(item: PendingSyncItem) {
  const patch = item.patch as { requestId?: unknown } | null;
  return {
    id: String(item.id ?? ""),
    createdAt: String(item.createdAt ?? ""),
    attempts: Number(item.attempts),
    title: String(item.title ?? ""),
    lastError: typeof item.lastError === "string" ? item.lastError : null,
    requestId: normalizeSyncRequestId(patch?.requestId),
    patch: stable(item.patch),
  };
}

export async function hashPendingSyncItem(
  item: PendingSyncItem,
): Promise<string> {
  const { CryptoDigestAlgorithm, digestStringAsync } =
    await import("expo-crypto");
  return digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    JSON.stringify(canonicalPendingSyncItem(item)),
  );
}
