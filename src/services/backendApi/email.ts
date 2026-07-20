import { backendBaseUrl, postJson, readJson } from "./http";

export async function sendInvoiceEmail(backendUrl: string, payload: { to: string; subject: string; html: string; xml: string; pdfBase64?: string; documentType?: "factura" | "nota_credito"; documentNumber?: string }, token = "") {
  const baseUrl = backendBaseUrl(backendUrl);
  const response = await postJson(`${baseUrl}/api/email/invoice`, payload, "No hay conexion para enviar el correo. Intente nuevamente cuando tenga internet.", token);
  const result = (await readJson(response)) as { ok?: boolean; error?: string };

  if (!response.ok || !result.ok) {
    throw new Error(result.error || "No se pudo enviar el correo.");
  }

  return result;
}

export async function sendTestEmail(backendUrl: string, payload: { to?: string }, token = "") {
  const baseUrl = backendBaseUrl(backendUrl);
  const response = await postJson(`${baseUrl}/api/email/test`, payload, "No hay conexion para probar el correo.", token);
  const result = (await readJson(response)) as { ok?: boolean; to?: string; error?: string };

  if (!response.ok || !result.ok) {
    throw new Error(result.error || "No se pudo enviar el correo de prueba.");
  }

  return result;
}
