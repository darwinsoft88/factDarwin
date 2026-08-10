import { DocumentType } from "../types";

export type WorkflowDocumentType = DocumentType | "guia_remision";

export type DocumentWorkflowPolicy = {
  blocksWithoutServerBeforeSave: boolean;
  collectsPayment: boolean;
  createsPendingSyncWhenOffline: boolean;
  label: string;
  sriDocument: boolean;
};

const policies: Record<WorkflowDocumentType, DocumentWorkflowPolicy> = {
  factura: {
    blocksWithoutServerBeforeSave: true,
    collectsPayment: true,
    createsPendingSyncWhenOffline: true,
    label: "Factura SRI",
    sriDocument: true
  },
  nota_credito: {
    blocksWithoutServerBeforeSave: true,
    collectsPayment: false,
    createsPendingSyncWhenOffline: true,
    label: "Nota de credito SRI",
    sriDocument: true
  },
  guia_remision: {
    blocksWithoutServerBeforeSave: true,
    collectsPayment: false,
    createsPendingSyncWhenOffline: true,
    label: "Guia de remision SRI",
    sriDocument: true
  },
  nota_venta: {
    blocksWithoutServerBeforeSave: false,
    collectsPayment: true,
    createsPendingSyncWhenOffline: true,
    label: "Nota de venta interna",
    sriDocument: false
  },
  proforma: {
    blocksWithoutServerBeforeSave: false,
    collectsPayment: false,
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

export function documentCollectsPayment(documentType: WorkflowDocumentType) {
  return documentWorkflowPolicy(documentType).collectsPayment;
}
