import { AppData, CashClosing, Issuer, RemissionGuide, Sale } from "../types";
import { activeEstablishment, issuerForGuide, issuerForSale } from "./establishments";

export function documentNumber(sale: Sale, issuer: Issuer) {
  const scopedIssuer = issuerForSale(issuer, sale);
  if (sale.establishment && sale.emissionPoint) return `${scopedIssuer.establishment}-${scopedIssuer.emissionPoint}-${sale.sequence}`;
  return isInvoiceDocument(sale) || isCreditNoteDocument(sale) ? `${scopedIssuer.establishment}-${scopedIssuer.emissionPoint}-${sale.sequence}` : sale.sequence;
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

export function activeScopeId(data: AppData) {
  const establishment = activeEstablishment(data.issuer);
  return establishment.id;
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
  return documentScopeId(sale, data.issuer) === activeScopeId(data);
}

export function guideInActiveScope(guide: RemissionGuide, data: AppData) {
  return documentScopeId(guide, data.issuer) === activeScopeId(data);
}

export function closingInActiveScope(closing: CashClosing, data: AppData) {
  if (closing.establishment && closing.emissionPoint) return `${closing.establishment}-${closing.emissionPoint}` === activeScopeId(data);
  return true;
}

export function scopedReportData(data: AppData, scopeId = activeScopeId(data)) {
  const sales = data.sales.filter((sale) => documentScopeId(sale, data.issuer) === scopeId);
  const saleIds = new Set(sales.map((sale) => sale.id));
  return {
    ...data,
    sales,
    guides: (data.guides || []).filter((guide) => documentScopeId(guide, data.issuer) === scopeId),
    receivedRetentions: (data.receivedRetentions || []).filter((retention) => !retention.saleId || saleIds.has(retention.saleId)),
    cashClosings: (data.cashClosings || []).filter((closing) => closing.establishment && closing.emissionPoint ? `${closing.establishment}-${closing.emissionPoint}` === scopeId : true)
  };
}

function isInvoiceDocument(sale: Sale) {
  return (sale.documentType || "factura") === "factura";
}

function isCreditNoteDocument(sale: Sale) {
  return sale.documentType === "nota_credito";
}

function timestampOf(value?: string) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}
