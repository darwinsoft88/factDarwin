import { authHeaders, backendBaseUrl, readJson } from "./http";
import { CatalogQuery, CatalogResponse, HistoryQuery, HistoryResponse } from "./types";

export async function getSalesHistory<T>(backendUrl: string, token = "", query: HistoryQuery = {}) {
  return getHistory<T>(backendUrl, "/api/history/sales", token, query);
}

export async function getGuidesHistory<T>(backendUrl: string, token = "", query: HistoryQuery = {}) {
  return getHistory<T>(backendUrl, "/api/history/guides", token, query);
}

export async function searchBackendClients<T>(backendUrl: string, token = "", query: CatalogQuery = {}) {
  return getCatalog<T>(backendUrl, "/api/catalog/clients", token, query);
}

export async function searchBackendProducts<T>(backendUrl: string, token = "", query: CatalogQuery = {}) {
  return getCatalog<T>(backendUrl, "/api/catalog/products", token, query);
}

async function getHistory<T>(backendUrl: string, path: string, token: string, query: HistoryQuery) {
  const baseUrl = backendBaseUrl(backendUrl);
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== "") params.set(key, String(value));
  });
  let response: Response;

  try {
    response = await fetch(`${baseUrl}${path}?${params.toString()}`, { headers: authHeaders(token), cache: "no-store" });
  } catch {
    throw new Error("No hay conexion con el servidor para consultar el historial.");
  }

  const result = (await readJson(response)) as HistoryResponse<T>;
  if (!response.ok || !result.ok) {
    throw new Error(result.error || "No se pudo consultar el historial.");
  }

  return {
    items: result.items || [],
    total: Number(result.total || 0),
    limit: Number(result.limit || query.limit || 0),
    offset: Number(result.offset || query.offset || 0),
    hasMore: Boolean(result.hasMore)
  };
}

async function getCatalog<T>(backendUrl: string, path: string, token: string, query: CatalogQuery): Promise<CatalogResponse<T>> {
  const baseUrl = backendBaseUrl(backendUrl);
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== "") params.set(key, String(value));
  });

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}?${params.toString()}`, { headers: authHeaders(token), cache: "no-store" });
  } catch {
    throw new Error("No hay conexion con el servidor para buscar registros.");
  }

  const result = (await readJson(response)) as HistoryResponse<T>;
  if (!response.ok || !result.ok) {
    throw new Error(result.error || "No se pudo consultar el catalogo.");
  }

  return {
    items: result.items || [],
    total: Number(result.total || 0),
    limit: Number(result.limit || query.limit || 0),
    offset: Number(result.offset || query.offset || 0),
    hasMore: Boolean(result.hasMore)
  };
}
