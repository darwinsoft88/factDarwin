export type SyncTransportOperation =
  | "merge"
  | "snapshot_metadata"
  | "snapshot_download"
  | "snapshot_upload";

type SyncTransportMetric = {
  operation: SyncTransportOperation;
  durationMs: number;
  ok: boolean;
  requestBytes?: number;
  responseBytes?: number;
  statusCode?: number;
  errorCode?: string;
};

export function utf8ByteLength(value: unknown): number {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(serialized).length;
  }
  return unescape(encodeURIComponent(serialized)).length;
}

export function recordSyncTransportMetric(metric: SyncTransportMetric): void {
  // Solo se registran metadatos operativos; nunca payloads, XML, tokens o PII.
  // eslint-disable-next-line no-console
  console.info(JSON.stringify({
    event: "sync_transport_metric",
    operation: metric.operation,
    durationMs: Math.max(0, Math.round(metric.durationMs)),
    ok: metric.ok,
    requestBytes: nonNegative(metric.requestBytes),
    responseBytes: nonNegative(metric.responseBytes),
    statusCode: metric.statusCode,
    errorCode: metric.errorCode,
  }));
}

export function syncErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: unknown }).code || "").trim();
    if (code) return code.slice(0, 80);
  }
  if (error instanceof Error && error.name) return error.name.slice(0, 80);
  return "UNKNOWN_ERROR";
}

function nonNegative(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.round(value));
}
