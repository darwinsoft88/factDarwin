export type AuthorizationResponse = {
  ok: boolean;
  sent?: boolean;
  status?: string;
  message?: string;
  accessKey?: string;
  authorizationStatus?: string;
  authorizationNumber?: string;
  authorizationDate?: string;
  sriEnvironment?: string;
  sriMessage?: string;
  authorizedXml?: string;
  signedXml?: string;
  reception?: unknown;
  authorization?: unknown;
  error?: string;
};

export type BackendHealthResponse = {
  ok?: boolean;
  service?: string;
  sriEnv?: "test" | "production" | string;
  allowSriSend?: boolean;
  sriAllowInsecureTls?: boolean;
  database?: {
    engine?: string;
    path?: string;
  };
  technicalLogs?: {
    enabled?: boolean;
    retentionDays?: number;
  };
  certConfigured?: boolean;
  certExists?: boolean;
  authRequired?: boolean;
  license?: BackendLicenseStatus;
  error?: string;
};

export type BackendLoginResponse = {
  ok?: boolean;
  requiresCompanySelection?: boolean;
  token?: string;
  user?: {
    id: string;
    companyId?: string;
    name: string;
    email: string;
    role: string;
    mustChangePassword?: boolean;
  };
  company?: BackendCompanyOption;
  companyOptions?: BackendCompanyOption[];
  license?: BackendLicenseStatus;
  error?: string;
};

export type BackendCompanyOption = {
  id: string;
  ruc: string;
  businessName?: string;
  tradeName?: string;
  role?: string;
  status?: string;
};

export type BackendRegisterPayload = {
  company: {
    ruc: string;
    businessName: string;
    tradeName?: string;
    phone?: string;
    address?: string;
  };
  admin: {
    name: string;
    email: string;
    password: string;
  };
  device?: {
    deviceId?: string;
    deviceLabel?: string;
    platform?: string;
  };
};

export type BackendRegisterResponse<T> = BackendLoginResponse & {
  company?: {
    id: string;
    ruc: string;
    businessName: string;
    tradeName?: string;
    status?: string;
  };
  snapshot?: {
    data: T;
    updatedAt: string;
    summary?: BackupSummary | null;
  };
};

export type BackendLicenseStatus = {
  status?: string;
  plan?: string;
  effectiveStatus?: string;
  active?: boolean;
  startsAt?: string;
  expiresAt?: string;
  daysLeft?: number;
  maxUsers?: number;
  maxDevices?: number;
  maxEmissionPoints?: number;
  features?: Record<string, boolean>;
  notes?: string;
};

export type TechnicalLog = {
  time?: string;
  level?: "info" | "warn" | "error" | string;
  event?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  message?: string;
  user?: {
    email?: string;
    role?: string;
  };
  body?: unknown;
};

export type ReservedSequenceResponse = {
  ok?: boolean;
  documentType?: "factura" | "nota_credito" | "guia_remision";
  sequence?: string;
  accessKey?: string;
  error?: string;
};

export type CompanyAssetsStatus = {
  ok?: boolean;
  logo?: {
    configured?: boolean;
    url?: string;
  };
  certificate?: {
    configured?: boolean;
    needsUpload?: boolean;
    uploadedAt?: string;
    fileName?: string;
    size?: number;
    error?: string;
  };
  error?: string;
};

export type IdentityLookupResponse = {
  ok?: boolean;
  type?: "cedula" | "ruc";
  identificationType?: "04" | "05";
  identification?: string;
  name?: string;
  businessName?: string;
  tradeName?: string;
  address?: string;
  status?: string;
  taxpayerType?: "natural" | "juridica";
  accountingRequired?: "SI" | "NO";
  specialTaxpayer?: "SI" | "NO";
  establishments?: Array<{
    tradeName?: string;
    establishment?: string;
    address?: string;
    status?: string;
    matriz?: string;
  }>;
  error?: string;
};

export async function checkBackendHealth(backendUrl: string): Promise<BackendHealthResponse> {
  const baseUrl = backendUrl.replace(/\/$/, "");
  let response: Response;

  try {
    response = await fetch(`${baseUrl}/health`);
  } catch {
    throw new Error("No hay conexion con el servidor. Revise internet e intente nuevamente.");
  }

  const result = (await readJson(response)) as BackendHealthResponse;

  if (!response.ok) {
    throw new Error(result.error || "El backend respondio con error al probar la conexion.");
  }

  return result;
}

export async function loginBackend(backendUrl: string, email: string, password: string, companyId = "") {
  const baseUrl = backendUrl.replace(/\/$/, "");
  const response = await postJson(`${baseUrl}/api/auth/login`, { email, password, companyId }, "No hay conexion con el servidor para validar la sesion. Puede seguir usando la app con los datos guardados en este dispositivo.");
  const result = (await readJson(response)) as BackendLoginResponse;
  if (result.companyOptions?.length) {
    const error = new Error(result.error || "Elija la empresa con la que desea trabajar.") as Error & { companyOptions?: BackendCompanyOption[] };
    error.companyOptions = result.companyOptions;
    throw error;
  }
  if (!response.ok || !result.token) {
    if (response.status === 401) {
      throw new Error(result.error || "No encontramos una cuenta activa con ese correo o RUC.");
    }
    throw new Error(result.error || "No se pudo iniciar sesion en el backend.");
  }
  return result;
}

export async function registerBackend<T>(backendUrl: string, payload: BackendRegisterPayload) {
  const baseUrl = backendUrl.replace(/\/$/, "");
  const response = await postJson(`${baseUrl}/api/auth/register`, payload, "No hay conexion con el servidor para crear la cuenta. Revise internet e intente nuevamente.");
  const result = (await readJson(response)) as BackendRegisterResponse<T>;
  if (!response.ok || !result.token || !result.snapshot?.data) {
    throw new Error(result.error || "No se pudo crear la cuenta.");
  }
  return result;
}

export async function requestPasswordReset(backendUrl: string, identifier: string) {
  const baseUrl = backendUrl.replace(/\/$/, "");
  const response = await postJson(`${baseUrl}/api/auth/password-reset`, { identifier }, "No hay conexion con el servidor para recuperar la contrasena.");
  const result = (await readJson(response)) as { ok?: boolean; message?: string; email?: string; error?: string };
  if (!response.ok || !result.ok) {
    throw new Error(result.error || "No se pudo recuperar la contrasena.");
  }
  return result;
}

export async function changeBackendPassword(backendUrl: string, password: string, token = "") {
  const baseUrl = backendUrl.replace(/\/$/, "");
  const response = await postJson(`${baseUrl}/api/auth/change-password`, { password }, "No hay conexion con el servidor para cambiar la contrasena.", token);
  const result = (await readJson(response)) as BackendLoginResponse;
  if (!response.ok || !result.ok || !result.token || !result.user) {
    throw new Error(result.error || "No se pudo cambiar la contrasena.");
  }
  return result;
}

export async function lookupIdentityData(backendUrl: string, identifier: string, token = "") {
  const baseUrl = backendUrl.replace(/\/$/, "");
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    response = await fetch(`${baseUrl}/api/datos/identificacion/${encodeURIComponent(identifier)}`, {
      headers: authHeaders(token),
      signal: controller.signal
    });
  } catch (error) {
    throw new Error(error instanceof Error && error.name === "AbortError"
      ? "La consulta tardo demasiado. Intente nuevamente."
      : "No hay conexion para consultar datos personales.");
  } finally {
    clearTimeout(timeout);
  }

  const result = (await readJson(response)) as IdentityLookupResponse;
  if (!response.ok || !result.ok) {
    throw new Error(result.error || "No se pudo consultar la identificacion.");
  }
  return result;
}

export async function authorizeInvoice(backendUrl: string, xml: string, token = ""): Promise<AuthorizationResponse> {
  const baseUrl = backendUrl.replace(/\/$/, "");
  const response = await postJson(`${baseUrl}/api/facturas/autorizar`, { xml }, "No hay conexion para autorizar el documento en este momento. El documento quedara guardado para reenviar cuando vuelva internet.", token);
  const result = (await readJson(response)) as AuthorizationResponse;

  if (!response.ok) {
    throw new Error(result.error || "No se pudo autorizar la factura.");
  }

  return result;
}

export async function authorizeRemissionGuide(backendUrl: string, xml: string, token = ""): Promise<AuthorizationResponse> {
  const baseUrl = backendUrl.replace(/\/$/, "");
  const response = await postJson(`${baseUrl}/api/guias/autorizar`, { xml }, "No hay conexion para autorizar la guia en este momento. Guardela y reintente cuando vuelva internet.", token);
  const result = (await readJson(response)) as AuthorizationResponse;

  if (!response.ok) {
    throw new Error(result.error || "No se pudo autorizar la guia de remision.");
  }

  return result;
}

export async function reserveDocumentSequence(backendUrl: string, payload: { documentType: "factura" | "nota_credito" | "guia_remision"; issuer: unknown; createdAt: string }, token = "") {
  const baseUrl = backendUrl.replace(/\/$/, "");
  const response = await postJson(`${baseUrl}/api/secuenciales/reservar`, payload, "No hay conexion para obtener el numero oficial de factura. Para evitar duplicados, guarde como ticket y facture cuando vuelva internet.", token);
  const result = (await readJson(response)) as ReservedSequenceResponse;

  if (!response.ok || !result.sequence || !result.accessKey) {
    throw new Error(result.error || "No se pudo reservar el secuencial en el backend.");
  }

  return result;
}

export async function sendInvoiceEmail(backendUrl: string, payload: { to: string; subject: string; html: string; xml: string; pdfBase64?: string; documentType?: "factura" | "nota_credito"; documentNumber?: string }, token = "") {
  const baseUrl = backendUrl.replace(/\/$/, "");
  const response = await postJson(`${baseUrl}/api/email/invoice`, payload, "No hay conexion para enviar el correo. Intente nuevamente cuando tenga internet.", token);
  const result = (await readJson(response)) as { ok?: boolean; error?: string };

  if (!response.ok) {
    throw new Error(result.error || "No se pudo enviar el correo.");
  }

  return result;
}

export async function sendTestEmail(backendUrl: string, payload: { to?: string }, token = "") {
  const baseUrl = backendUrl.replace(/\/$/, "");
  const response = await postJson(`${baseUrl}/api/email/test`, payload, "No hay conexion para probar el correo.", token);
  const result = (await readJson(response)) as { ok?: boolean; to?: string; error?: string };

  if (!response.ok || !result.ok) {
    throw new Error(result.error || "No se pudo enviar el correo de prueba.");
  }

  return result;
}

export async function backupAppData<T>(backendUrl: string, data: T, token = "") {
  const baseUrl = backendUrl.replace(/\/$/, "");
  const response = await postJson(`${baseUrl}/api/data`, { data }, "Sin conexion con el servidor. Los datos quedan guardados en este dispositivo y se intentaran subir despues.", token);
  const result = (await readJson(response)) as { ok?: boolean; updatedAt?: string; summary?: BackupSummary; error?: string };

  if (!response.ok) {
    throw new Error(result.error || "No se pudo respaldar la base de datos.");
  }

  return result;
}

export async function mergeBackendData(backendUrl: string, patch: unknown, token = "") {
  const baseUrl = backendUrl.replace(/\/$/, "");
  const response = await postJson(`${baseUrl}/api/sync/merge`, patch, "Sin conexion con el servidor. El cambio queda pendiente y se sincronizara automaticamente.", token);
  const result = (await readJson(response)) as { ok?: boolean; updatedAt?: string; summary?: BackupSummary; error?: string };

  if (!response.ok) {
    throw new Error(result.error || "No se pudo sincronizar el cambio incremental.");
  }

  return result;
}

export async function restoreAppData<T>(backendUrl: string, token = "") {
  const baseUrl = backendUrl.replace(/\/$/, "");
  let response: Response;

  try {
    response = await fetch(`${baseUrl}/api/data`, { headers: authHeaders(token), cache: "no-store" });
  } catch {
    throw new Error("No hay conexion con el servidor para cargar la copia. Revise internet e intente nuevamente.");
  }

  const result = (await readJson(response)) as { ok?: boolean; snapshot?: { data: T; updatedAt: string; summary?: BackupSummary } | null; error?: string };

  if (!response.ok) {
    throw new Error(result.error || "No se pudo restaurar la base de datos.");
  }

  return result.snapshot;
}

export type HistoryQuery = {
  limit?: number;
  offset?: number;
  clientId?: string;
  status?: string;
  documentType?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
};

export type HistoryResponse<T> = {
  ok?: boolean;
  items?: T[];
  total?: number;
  limit?: number;
  offset?: number;
  hasMore?: boolean;
  error?: string;
};

export type CatalogQuery = {
  search?: string;
  limit?: number;
  offset?: number;
};

export type CatalogResponse<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

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
  const baseUrl = backendUrl.replace(/\/$/, "");
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
  const baseUrl = backendUrl.replace(/\/$/, "");
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

export async function getTechnicalLogs(backendUrl: string, token = "", limit = 80) {
  const baseUrl = backendUrl.replace(/\/$/, "");
  let response: Response;

  try {
    response = await fetch(`${baseUrl}/api/support/logs?limit=${encodeURIComponent(String(limit))}`, { headers: authHeaders(token) });
  } catch {
    throw new Error("No hay conexion con el servidor para consultar soporte. Revise internet e intente nuevamente.");
  }

  const result = (await readJson(response)) as { ok?: boolean; logs?: TechnicalLog[]; error?: string };

  if (!response.ok) {
    throw new Error(result.error || "No se pudieron consultar los logs tecnicos.");
  }

  return result.logs || [];
}

export async function getCompanyAssetsStatus(backendUrl: string, token = "") {
  const baseUrl = backendUrl.replace(/\/$/, "");
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
  const baseUrl = backendUrl.replace(/\/$/, "");
  const response = await postJson(`${baseUrl}/api/company/logo`, payload, "No hay conexion para subir el logo.", token);
  const result = (await readJson(response)) as { ok?: boolean; logoUrl?: string; error?: string };
  if (!response.ok || !result.ok) {
    throw new Error(result.error || "No se pudo subir el logo.");
  }
  return result;
}

export async function uploadCompanyCertificate(backendUrl: string, payload: { fileName?: string; password: string; base64: string }, token = "") {
  const baseUrl = backendUrl.replace(/\/$/, "");
  const response = await postJson(`${baseUrl}/api/company/certificate`, payload, "No hay conexion para subir el certificado.", token);
  const result = (await readJson(response)) as { ok?: boolean; uploadedAt?: string; size?: number; error?: string };
  if (!response.ok || !result.ok) {
    throw new Error(result.error || "No se pudo subir el certificado.");
  }
  return result;
}

export type BackupSummary = {
  users: number;
  clients: number;
  products: number;
  sales: number;
  guides: number;
  receivedRetentions: number;
  inventoryMovements: number;
  auditLogs: number;
  cashClosings?: number;
  pendingSync?: number;
  historyCount?: number;
  prunedHistory?: number;
};

async function postJson(url: string, payload: unknown, connectionMessage: string, token = "") {
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(token)
      },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new Error(connectionMessage);
  }
}

function authHeaders(token: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return { error: "El backend respondio con un formato invalido." };
  }
}
