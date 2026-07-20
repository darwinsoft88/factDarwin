import { DocumentType } from "../types";

export type WorkflowDocumentType = DocumentType | "guia_remision";

export type DocumentWorkflowPolicy = {
  blocksWithoutServerBeforeSave: boolean;
  createsPendingSyncWhenOffline: boolean;
  label: string;
  sriDocument: boolean;
};

const policies: Record<WorkflowDocumentType, DocumentWorkflowPolicy> = {
  factura: {
    blocksWithoutServerBeforeSave: true,
    createsPendingSyncWhenOffline: true,
    label: "Factura SRI",
    sriDocument: true
  },
  nota_credito: {
    blocksWithoutServerBeforeSave: true,
    createsPendingSyncWhenOffline: true,
    label: "Nota de credito SRI",
    sriDocument: true
  },
  guia_remision: {
    blocksWithoutServerBeforeSave: true,
    createsPendingSyncWhenOffline: true,
    label: "Guia de remision SRI",
    sriDocument: true
  },
  nota_venta: {
    blocksWithoutServerBeforeSave: false,
    createsPendingSyncWhenOffline: true,
    label: "Nota de venta interna",
    sriDocument: false
  },
  proforma: {
    blocksWithoutServerBeforeSave: false,
    createsPendingSyncWhenOffline: true,
    label: "Proforma",
    sriDocument: false
  }
};

export function documentWorkflowPolicy(documentType: WorkflowDocumentType) {
  return policies[documentType];
}

export function documentRequiresServerBeforeSave(documentType: WorkflowDocumentType) {
  return documentWorkflowPolicy(documentType).blocksWithoutServerBeforeSave;
}

export function documentCreatesPendingSyncWhenOffline(documentType: WorkflowDocumentType) {
  return documentWorkflowPolicy(documentType).createsPendingSyncWhenOffline;
}
