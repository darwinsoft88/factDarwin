export const DOCUMENT_HISTORY_PAGINATION_FLAG = "EXPO_PUBLIC_DOCUMENT_HISTORY_PAGINATION";

export function historicalDocumentPaginationEnabled(
  value = process.env[DOCUMENT_HISTORY_PAGINATION_FLAG],
): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}
