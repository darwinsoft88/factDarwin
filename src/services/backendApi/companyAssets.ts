import { authHeaders, backendBaseUrl, postJson, readJson } from "./http";
import { CompanyAssetsStatus } from "./types";

export async function getCompanyAssetsStatus(backendUrl: string, token = "") {
  const baseUrl = backendBaseUrl(backendUrl);
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    response = await fetch(`${baseUrl}/api/company/assets/status`, { headers: authHeaders(token), signal: controller.signal });
  } catch {
    throw new Error("No hay respuesta del servidor para consultar logo y certificado. Revise conexion o backend.");
  } finally {
    clearTimeout(timeout);
  }

  const result = (await readJson(response)) as CompanyAssetsStatus;
  if (!response.ok) {
    throw new Error(result.error || "No se pudo consultar logo y certificado.");
  }
  return result;
}

export async function uploadCompanyLogo(backendUrl: string, payload: { fileName?: string; mimeType: string; base64: string }, token = "") {
  const baseUrl = backendBaseUrl(backendUrl);
  const response = await postJson(`${baseUrl}/api/company/logo`, payload, "No hay conexion para subir el logo.", token);
  const result = (await readJson(response)) as { ok?: boolean; logoUrl?: string; error?: string };
  if (!response.ok || !result.ok) {
    throw new Error(result.error || "No se pudo subir el logo.");
  }
  return result;
}

export async function uploadCompanyCertificate(backendUrl: string, payload: { fileName?: string; password: string; base64: string }, token = "") {
  const baseUrl = backendBaseUrl(backendUrl);
  const response = await postJson(`${baseUrl}/api/company/certificate`, payload, "No hay conexion para subir el certificado.", token);
  const result = (await readJson(response)) as { ok?: boolean; uploadedAt?: string; size?: number; error?: string };
  if (!response.ok || !result.ok) {
    throw new Error(result.error || "No se pudo subir el certificado.");
  }
  return result;
}
