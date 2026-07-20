import { backendBaseUrl, postJson, readJson } from "./http";
import { AuthorizationResponse, ReservedSequenceResponse } from "./types";

export async function authorizeInvoice(backendUrl: string, xml: string, token = ""): Promise<AuthorizationResponse> {
  const baseUrl = backendBaseUrl(backendUrl);
  const response = await postJson(`${baseUrl}/api/facturas/autorizar`, { xml }, "No hay conexion para autorizar el documento en este momento. El documento quedara guardado para reenviar cuando vuelva internet.", token);
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

function reserveSequenceOfflineMessage(documentType: "factura" | "nota_credito" | "guia_remision") {
  if (documentType === "factura") {
    return "No hay conexion para obtener el numero oficial de factura. Para evitar duplicados, guarde como ticket y facture cuando vuelva internet.";
  }
  if (documentType === "nota_credito") {
    return "No hay conexion para obtener el numero oficial de nota de credito. Para evitar duplicados, emita la nota cuando vuelva internet.";
  }
  return "No hay conexion para obtener el numero oficial de guia de remision. Para evitar duplicados, emita la guia cuando vuelva internet.";
}
