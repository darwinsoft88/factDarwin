import React from "react";
import { DocumentType, Sale } from "../types";
import { money } from "../sri";
import { PrimaryButton } from "./common";

type SaleSubmitButtonProps = {
  issuing: boolean;
  documentType: DocumentType;
  editingSale?: Sale;
  sourceTicket?: Sale;
  sourceProforma?: Sale;
  checkoutMode?: boolean;
  labelOverride?: string;
  total?: number;
  onSubmit: () => void;
};

function submitLabel(issuing: boolean, documentType: DocumentType, editingSale?: Sale, sourceTicket?: Sale, sourceProforma?: Sale, checkoutMode = false, total = 0, labelOverride?: string) {
  if (issuing) return "Procesando...";
  if (labelOverride) return total > 0 ? `${labelOverride} · $${money(total)}` : labelOverride;
  if (checkoutMode) return total > 0 ? `Cobrar $${money(total)}` : "Cobrar";
  if (sourceTicket) return "Facturar ticket";
  if (sourceProforma) return documentType === "factura" ? "Facturar proforma" : "Crear ticket desde proforma";
  if (editingSale) return editingSale.documentType === "nota_venta" || editingSale.documentType === "proforma" ? "Guardar correccion" : "Guardar y reintentar";
  if (documentType === "proforma") return "Guardar proforma";
  if (documentType === "nota_venta") return "Guardar nota de venta";
  return "Emitir factura";
}

export function SaleSubmitButton({ issuing, documentType, editingSale, sourceTicket, sourceProforma, checkoutMode = false, labelOverride, total = 0, onSubmit }: SaleSubmitButtonProps) {
  const label = submitLabel(issuing, documentType, editingSale, sourceTicket, sourceProforma, checkoutMode, total, labelOverride);
  return (
    <PrimaryButton
      label={label}
      icon={checkoutMode ? "wallet-outline" : undefined}
      onPress={issuing ? () => undefined : onSubmit}
    />
  );
}
