import { Issuer, TaxRegime } from "../types";

export function normalizeTaxRegime(value: unknown): TaxRegime {
  return value === "rimpe_emprendedor" || value === "rimpe_negocio_popular" ? value : "general";
}

export function taxRegimeLabel(value: unknown) {
  const regime = normalizeTaxRegime(value);
  if (regime === "rimpe_emprendedor") return "Contribuyente Régimen RIMPE";
  if (regime === "rimpe_negocio_popular") return "Contribuyente Negocio Popular - Régimen RIMPE";
  return "";
}

export function issuerTaxRegimeLabel(issuer: Issuer) {
  return taxRegimeLabel(issuer.taxRegime);
}

export function taxRegimeDisplayName(value: unknown) {
  const regime = normalizeTaxRegime(value);
  if (regime === "rimpe_emprendedor") return "RIMPE emprendedor";
  if (regime === "rimpe_negocio_popular") return "RIMPE negocio popular";
  return "Regimen general";
}
