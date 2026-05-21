import React from "react";
import { DocumentType, Sale } from "../types";
import { PrimaryButton } from "./common";

type SaleSubmitButtonProps = {
  issuing: boolean;
  documentType: DocumentType;
  editingSale?: Sale;
  sourceTicket?: Sale;
  sourceProforma?: Sale;
  onSubmit: () => void;
};

function submitLabel(issuing: boolean, documentType: DocumentType, editingSale?: Sale, sourceTicket?: Sale, sourceProforma?: Sale) {
  if (issuing) return "Procesando...";
  if (sourceTicket) return "Facturar ticket";
  if (sourceProforma) return documentType === "factura" ? "Facturar proforma" : "Crear ticket desde proforma";
  if (editingSale) return editingSale.documentType === "nota_venta" || editingSale.documentType === "proforma" ? "Guardar correccion" : "Guardar y reintentar";
  if (documentType === "proforma") return "Guardar proforma";
  if (documentType === "nota_venta") return "Guardar nota de venta";
  return "Emitir factura";
}

export function SaleSubmitButton({ issuing, documentType, editingSale, sourceTicket, sourceProforma, onSubmit }: SaleSubmitButtonProps) {
  return (
    <PrimaryButton
      label={submitLabel(issuing, documentType, editingSale, sourceTicket, sourceProforma)}
      onPress={issuing ? () => undefined : onSubmit}
    />
  );
}
