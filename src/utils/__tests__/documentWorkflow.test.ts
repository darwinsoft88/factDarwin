import { documentCollectsPayment, documentCreatesPendingSyncWhenOffline, documentRequiresServerBeforeSave, documentWorkflowPolicy } from "../documentWorkflow";

describe("documentWorkflow", () => {
  it("allows internal documents to be saved without server", () => {
    expect(documentRequiresServerBeforeSave("proforma")).toBe(false);
    expect(documentRequiresServerBeforeSave("nota_venta")).toBe(false);
    expect(documentCreatesPendingSyncWhenOffline("proforma")).toBe(true);
    expect(documentCreatesPendingSyncWhenOffline("nota_venta")).toBe(true);
  });

  it("requires server before saving official SRI documents", () => {
    expect(documentRequiresServerBeforeSave("factura")).toBe(true);
    expect(documentRequiresServerBeforeSave("nota_credito")).toBe(true);
    expect(documentRequiresServerBeforeSave("guia_remision")).toBe(true);
  });

  it("marks only SRI documents as official SRI flow", () => {
    expect(documentWorkflowPolicy("factura").sriDocument).toBe(true);
    expect(documentWorkflowPolicy("guia_remision").sriDocument).toBe(true);
    expect(documentWorkflowPolicy("proforma").sriDocument).toBe(false);
  });

  it("collects payment only for documents that represent a sale", () => {
    expect(documentCollectsPayment("factura")).toBe(true);
    expect(documentCollectsPayment("nota_venta")).toBe(true);
    expect(documentCollectsPayment("proforma")).toBe(false);
  });
});
