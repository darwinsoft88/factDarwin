import { AuthorizationResponse } from "../services/backend";
import { AppData, CashClosing, Environment, Issuer, RemissionGuide, Sale } from "../types";
import { dateKey } from "./format";
import { activeEstablishment, issuerForGuide, issuerForSale } from "./establishments";
import { isCreditNoteSale, isInvoiceSale } from "./sales";

export const MAX_DAILY_RETRIES = 3;

export function documentNumber(sale: Sale, issuer: Issuer) {
  const scopedIssuer = issuerForSale(issuer, sale);
  if (sale.establishment && sale.emissionPoint) return `${scopedIssuer.establishment}-${scopedIssuer.emissionPoint}-${sale.sequence}`;
  return isInvoiceSale(sale) || isCreditNoteSale(sale) ? `${scopedIssuer.establishment}-${scopedIssuer.emissionPoint}-${sale.sequence}` : sale.sequence;
}

export function compareSalesNewestFirst(a: Sale, b: Sale) {
  const dateDiff = timestampOf(b.createdAt) - timestampOf(a.createdAt);
  if (dateDiff !== 0) return dateDiff;
  const sequenceDiff = sequenceSortValue(b.sequence) - sequenceSortValue(a.sequence);
  if (sequenceDiff !== 0) return sequenceDiff;
  return b.id.localeCompare(a.id);
}

export function sequenceSortValue(sequence: string) {
  const match = sequence.match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : 0;
}

export function guideNumber(guide: RemissionGuide, issuer: Issuer) {
  const scopedIssuer = issuerForGuide(issuer, guide);
  return guide.establishment && guide.emissionPoint ? `${scopedIssuer.establishment}-${scopedIssuer.emissionPoint}-${guide.sequence}` : guide.sequence;
}

export function resolveInvoiceStatus(result: AuthorizationResponse): Sale["status"] {
  const raw = `${result.authorizationStatus || ""} ${result.sriMessage || ""} ${JSON.stringify(result)}`.toUpperCase();

  if (result.authorizationStatus === "AUTORIZADO" || raw.includes("<ESTADO>AUTORIZADO</ESTADO>")) return "AUTORIZADA";
  if (raw.includes("DEVUELTA")) return "DEVUELTA";
  if (result.ok === false || raw.includes("RECHAZADA") || raw.includes("ERROR") || raw.includes("NO AUTORIZADO")) return "ERROR_SRI";
  if (result.sent) return "ENVIADA";
  return result.signedXml ? "FIRMADA" : "PENDIENTE_SRI";
}

export function isAccessKeyUsed(data: AppData, accessKey: string, currentId = "") {
  if (!accessKey) return false;
  return data.sales.some((sale) => sale.id !== currentId && sale.accessKey === accessKey) || (data.guides || []).some((guide) => guide.id !== currentId && guide.accessKey === accessKey);
}

export function getRetryInfo(document: { retryHistory?: string[] }, now = new Date()) {
  const today = dateKey(now);
  const todayAttempts = (document.retryHistory || []).filter((item) => dateKey(new Date(item)) === today).length;

  return {
    today: todayAttempts,
    remaining: Math.max(0, MAX_DAILY_RETRIES - todayAttempts)
  };
}

export function activeScopeId(data: AppData) {
  const establishment = activeEstablishment(data.issuer);
  return establishment.id;
}

type EnvironmentScopedDocument = {
  environment?: string;
  sriEnvironment?: string;
  accessKey?: string;
};

/** Resuelve el ambiente sin depender de la zona, estado o ambiente actual del dispositivo. */
export function documentEnvironment(document: EnvironmentScopedDocument): Environment | undefined {
  const explicit = normalizeDocumentEnvironment(document.environment) || normalizeDocumentEnvironment(document.sriEnvironment);
  if (explicit) return explicit;
  const accessKey = String(document.accessKey || "");
  if (/^\d{49}$/.test(accessKey)) return normalizeDocumentEnvironment(accessKey.slice(23, 24));
  return undefined;
}

export function documentInEnvironment(document: EnvironmentScopedDocument, environment: Environment) {
  const resolved = documentEnvironment(document);
  // Compatibilidad no destructiva: registros legacy sin metadata ni clave válida no se ocultan.
  // Todo documento nuevo queda marcado explícitamente y sí se aísla de forma estricta.
  return resolved === undefined || resolved === environment;
}

export function normalizeDocumentEnvironment(value?: string): Environment | undefined {
  const normalized = String(value || "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (["1", "PRUEBA", "PRUEBAS", "TEST"].includes(normalized)) return "1";
  if (["2", "PRODUCCION", "PRODUCTION"].includes(normalized)) return "2";
  return undefined;
}

export function documentScopeId(document: { establishment?: string; emissionPoint?: string; accessKey?: string }, fallbackIssuer: Issuer) {
  if (document.establishment && document.emissionPoint) return `${document.establishment}-${document.emissionPoint}`;
  const accessKeyScope = scopeIdFromAccessKey(document.accessKey || "");
  if (accessKeyScope) return accessKeyScope;
  return `${fallbackIssuer.establishment}-${fallbackIssuer.emissionPoint}`;
}

export function scopeIdFromAccessKey(accessKey: string) {
  if (!/^\d{49}$/.test(accessKey)) return "";
  return `${accessKey.slice(24, 27)}-${accessKey.slice(27, 30)}`;
}

export function saleInActiveScope(sale: Sale, data: AppData) {
  return documentScopeId(sale, data.issuer) === activeScopeId(data) && documentInEnvironment(sale, data.issuer.environment);
}

export function guideInActiveScope(guide: RemissionGuide, data: AppData) {
  return documentScopeId(guide, data.issuer) === activeScopeId(data) && documentInEnvironment(guide, data.issuer.environment);
}

export function closingInActiveScope(closing: CashClosing, data: AppData) {
  const inEnvironment = documentInEnvironment(closing, data.issuer.environment);
  if (!inEnvironment) return false;
  if (closing.establishment && closing.emissionPoint) return `${closing.establishment}-${closing.emissionPoint}` === activeScopeId(data);
  return true;
}

export function scopedReportData(data: AppData, scopeId = activeScopeId(data)) {
  const inRequestedScope = (document: { establishment?: string; emissionPoint?: string; accessKey?: string }) => scopeId === "all" || documentScopeId(document, data.issuer) === scopeId;
  const sales = data.sales.filter((sale) => inRequestedScope(sale) && documentInEnvironment(sale, data.issuer.environment));
  const saleIds = new Set(sales.map((sale) => sale.id));
  return {
    ...data,
    sales,
    guides: (data.guides || []).filter((guide) => inRequestedScope(guide) && documentInEnvironment(guide, data.issuer.environment)),
    receivedRetentions: (data.receivedRetentions || []).filter((retention) => !retention.saleId || saleIds.has(retention.saleId)),
    cashClosings: (data.cashClosings || []).filter((closing) => documentInEnvironment(closing, data.issuer.environment) && (scopeId === "all" || (closing.establishment && closing.emissionPoint ? `${closing.establishment}-${closing.emissionPoint}` === scopeId : true)))
  };
}

function timestampOf(value?: string) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}
