import { backendBaseUrl, postJson, readJson } from "./http";

type InvoiceEmailPayload = {
  to: string;
  documentId: string;
  documentType: "factura" | "nota_credito";
  requestId?: string;
} | {
  to: string;
  subject: string;
  html: string;
  xml: string;
  pdfBase64?: string;
  documentType?: "factura" | "nota_credito";
  documentNumber?: string;
};

export async function sendInvoiceEmail(backendUrl: string, payload: InvoiceEmailPayload, token = "") {
  const baseUrl = backendBaseUrl(backendUrl);
  const response = await postJson(`${baseUrl}/api/email/invoice`, payload, "No hay conexion para enviar el correo. Intente nuevamente cuando tenga internet.", token);
  const result = (await readJson(response)) as {
    ok?: boolean;
    error?: string;
    messageId?: string;
    accepted?: string[];
    rejected?: string[];
    response?: string;
  };

  if (!response.ok || !result.ok || !result.accepted?.length) {
    throw new Error(result.error || "No se pudo confirmar que el servidor de correo aceptara el mensaje.");
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

export async function fetchDocumentRide(
  backendUrl: string,
  payload: { documentId: string; documentType: "factura" | "nota_credito" },
  token = ""
) {
  const baseUrl = backendBaseUrl(backendUrl);
  const response = await postJson(
    `${baseUrl}/api/documents/ride`,
    payload,
    "No hay conexion para obtener el RIDE.",
    token,
    30000
  );
  const result = (await readJson(response)) as {
    ok?: boolean;
    error?: string;
    filename?: string;
    mimeType?: string;
    pdfBase64?: string;
  };
  if (!response.ok || !result.ok || !result.pdfBase64) {
    throw new Error(result.error || "No se pudo generar el RIDE.");
  }
  return {
    filename: result.filename || "RIDE.pdf",
    mimeType: result.mimeType || "application/pdf",
    pdfBase64: result.pdfBase64
  };
}
