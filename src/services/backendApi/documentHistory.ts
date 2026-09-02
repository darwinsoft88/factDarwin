import { APP_VERSION } from "../../constants/branding";
import { authHeaders, backendBaseUrl, fetchWithTimeout, readJson } from "./http";

export const HISTORICAL_DOCUMENT_PAGE_SIZE = 100;

export type HistoricalDocumentSummary = {
  documentId: string;
  documentType: "factura";
  environment: "1" | "2";
  establishment: string;
  emissionPoint: string;
  sequential: string;
  issueDate: string;
  createdAt: string;
  clientId: string;
  clientDisplayName: string;
  clientIdentificationMasked?: string;
  totalMicros: string;
  paymentCondition?: "contado" | "credito";
  creditBalanceMicros?: string;
  status: "AUTORIZADA";
  sriStatus: "AUTORIZADA";
  authorizationNumberMasked?: string;
  inventoryStatus?: string;
  emailStatus: "none" | "accepted" | "failed" | "uncertain";
  hasAuthorizedXml: boolean;
  hasRideData: boolean;
};

export type HistoricalDocumentPage = {
  ok: true;
  protocolVersion: 1;
  mode: "historical-read-only";
  items: HistoricalDocumentSummary[];
  nextCursor: string | null;
  hasMore: boolean;
  queryWatermark: string;
  countReturned: number;
};

export type HistoricalDocumentQuery = {
  documentScope: string;
  environment: "1" | "2";
  cursor?: string | null;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  limit?: number;
};

export async function getHistoricalDocumentsPage(
  backendUrl: string,
  token: string,
  platform: string,
  deviceId: string,
  query: HistoricalDocumentQuery,
): Promise<HistoricalDocumentPage> {
  const limit = Math.min(HISTORICAL_DOCUMENT_PAGE_SIZE, Math.max(1, query.limit || HISTORICAL_DOCUMENT_PAGE_SIZE));
  const params = new URLSearchParams({
    documentScope: query.documentScope,
    environment: query.environment,
    documentType: "factura",
    status: "AUTORIZADA",
    limit: String(limit),
  });
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.dateFrom) params.set("dateFrom", query.dateFrom);
  if (query.dateTo) params.set("dateTo", query.dateTo);
  if (query.search) params.set("search", query.search);

  const response = await fetchWithTimeout(
    `${backendBaseUrl(backendUrl)}/api/documents/history?${params.toString()}`,
    {
      headers: {
        ...authHeaders(token),
        "X-Historical-Documents-Protocol-Version": "1",
        "X-App-Version": APP_VERSION,
        "X-Platform": platform,
        "X-Device-Id": deviceId,
      },
      cache: "no-store",
    },
    15_000,
    "No se pudo cargar el historial anterior.",
  );
  const body = await readJson(response) as unknown;
  if (!response.ok) {
    const code = errorCodeOf(body) || `HISTORICAL_DOCUMENTS_HTTP_${response.status}`;
    throw historyClientError(code);
  }
  return validateHistoricalDocumentPage(body, limit);
}

export function validateHistoricalDocumentPage(value: unknown, requestedLimit = HISTORICAL_DOCUMENT_PAGE_SIZE): HistoricalDocumentPage {
  if (!isRecord(value) || value.ok !== true || value.protocolVersion !== 1 || value.mode !== "historical-read-only") {
    throw historyClientError("HISTORICAL_DOCUMENTS_RESPONSE_INVALID");
  }
  if (!Array.isArray(value.items) || value.items.length > Math.min(HISTORICAL_DOCUMENT_PAGE_SIZE, requestedLimit)) {
    throw historyClientError("HISTORICAL_DOCUMENTS_RESPONSE_INVALID");
  }
  const items = value.items.map(validateSummary);
  if (new Set(items.map((item) => item.documentId)).size !== items.length) {
    throw historyClientError("HISTORICAL_DOCUMENTS_DUPLICATE_PAGE");
  }
  if (typeof value.hasMore !== "boolean" || !/^\d+$/.test(String(value.queryWatermark || ""))) {
    throw historyClientError("HISTORICAL_DOCUMENTS_RESPONSE_INVALID");
  }
  if (value.nextCursor !== null && typeof value.nextCursor !== "string") {
    throw historyClientError("HISTORICAL_DOCUMENTS_RESPONSE_INVALID");
  }
  if (value.hasMore && !value.nextCursor) {
    throw historyClientError("HISTORICAL_DOCUMENTS_RESPONSE_INVALID");
  }
  if (value.countReturned !== items.length) {
    throw historyClientError("HISTORICAL_DOCUMENTS_RESPONSE_INVALID");
  }
  return value as HistoricalDocumentPage;
}

function validateSummary(value: unknown): HistoricalDocumentSummary {
  if (!isRecord(value)) throw historyClientError("HISTORICAL_DOCUMENTS_RESPONSE_INVALID");
  const requiredText = ["documentId", "environment", "establishment", "emissionPoint", "sequential", "issueDate", "createdAt", "clientId", "clientDisplayName", "totalMicros"];
  if (requiredText.some((field) => typeof value[field] !== "string") || !["1", "2"].includes(String(value.environment)) || value.documentType !== "factura" || value.status !== "AUTORIZADA" || value.sriStatus !== "AUTORIZADA") {
    throw historyClientError("HISTORICAL_DOCUMENTS_RESPONSE_INVALID");
  }
  if (!Number.isFinite(Date.parse(String(value.createdAt))) || !/^-?\d+$/.test(String(value.totalMicros))) {
    throw historyClientError("HISTORICAL_DOCUMENTS_RESPONSE_INVALID");
  }
  if (typeof value.hasAuthorizedXml !== "boolean" || typeof value.hasRideData !== "boolean") {
    throw historyClientError("HISTORICAL_DOCUMENTS_RESPONSE_INVALID");
  }
  return value as HistoricalDocumentSummary;
}

function errorCodeOf(value: unknown): string {
  if (!isRecord(value) || !isRecord(value.error)) return "";
  return typeof value.error.code === "string" ? value.error.code : "";
}

function historyClientError(code: string): Error & { code: string } {
  const error = new Error(code) as Error & { code: string };
  error.code = code;
  return error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
