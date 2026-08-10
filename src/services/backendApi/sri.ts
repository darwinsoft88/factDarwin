import { authHeaders, backendBaseUrl, fetchWithTimeout, postJson, readJson } from "./http";
import { AuthorizationResponse, ReservedSequenceResponse, SriEnvironmentResponse } from "./types";

const INVOICE_AUTHORIZATION_TIMEOUT_MS = 60000;

export async function authorizeInvoice(backendUrl: string, xml: string, token = ""): Promise<AuthorizationResponse> {
  const baseUrl = backendBaseUrl(backendUrl);
  const response = await postJson(
    `${baseUrl}/api/facturas/autorizar`,
    { xml },
    "No hay conexion para autorizar el documento en este momento. El documento quedara guardado para reenviar cuando vuelva internet.",
    token,
    INVOICE_AUTHORIZATION_TIMEOUT_MS
  );
  const result = (await readJson(response)) as AuthorizationResponse;

  if (!response.ok) {
    throw new Error(result.error || "No se pudo autorizar la factura.");
  }

  return result;
}

export async function authorizeRemissionGuide(backendUrl: string, xml: string, token = ""): Promise<AuthorizationResponse> {
  const baseUrl = backendBaseUrl(backendUrl);
  const response = await postJson(`${baseUrl}/api/guias/autorizar`, { xml }, "No hay conexion para autorizar la guia en este momento. Guardela y reintente cuando vuelva internet.", token);
  const result = (await readJson(response)) as AuthorizationResponse;

  if (!response.ok) {
    throw new Error(result.error || "No se pudo autorizar la guia de remision.");
  }

  return result;
}

export async function reserveDocumentSequence(backendUrl: string, payload: { documentType: "factura" | "nota_credito" | "guia_remision"; issuer: unknown; createdAt: string }, token = "") {
  const baseUrl = backendBaseUrl(backendUrl);
  const response = await postJson(`${baseUrl}/api/secuenciales/reservar`, payload, reserveSequenceOfflineMessage(payload.documentType), token);
  const result = (await readJson(response)) as ReservedSequenceResponse;

  if (!response.ok || !result.sequence || !result.accessKey) {
    throw new Error(result.error || "No se pudo reservar el secuencial en el backend.");
  }

  return result;
}

export async function getCompanySriEnvironment(backendUrl: string, token = ""): Promise<SriEnvironmentResponse> {
  const response = await fetchWithTimeout(`${backendBaseUrl(backendUrl)}/api/sri/environment`, { headers: authHeaders(token), cache: "no-store" }, 12_000, "No se pudo confirmar el ambiente SRI vigente.");
  const result = await readJson(response) as SriEnvironmentResponse;
  if (!response.ok || !["1", "2"].includes(String(result.environment)) || !Number.isSafeInteger(result.environmentVersion) || result.environmentVersion < 1) {
    throw new Error(result.error || "No se pudo confirmar el ambiente SRI vigente.");
  }
  return result;
}

export async function updateCompanySriEnvironment(backendUrl: string, environment: "1" | "2", expectedVersion: number, token = ""): Promise<SriEnvironmentResponse> {
  const response = await fetchWithTimeout(`${backendBaseUrl(backendUrl)}/api/sri/environment`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({ environment, expectedVersion }),
  }, 12_000, "No se pudo guardar el ambiente SRI empresarial.");
  const result = await readJson(response) as SriEnvironmentResponse;
  if (!response.ok) throw new Error(result.error || "No se pudo guardar el ambiente SRI empresarial.");
  return result;
}

function reserveSequenceOfflineMessage(documentType: "factura" | "nota_credito" | "guia_remision") {
  if (documentType === "factura") {
    return "No hay conexion para obtener el numero oficial de factura. Para evitar duplicados, guarde como ticket y facture cuando vuelva internet.";
  }
  if (documentType === "nota_credito") {
    return "No hay conexion para obtener el numero oficial de nota de credito. Para evitar duplicados, emita la nota cuando vuelva internet.";
  }
  return "No hay conexion para obtener el numero oficial de guia de remision. Para evitar duplicados, emita la guia cuando vuelva internet.";
}
