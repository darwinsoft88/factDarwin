import { Sale } from "../../types";
import { isStaleSriPendingDocument, shouldAutoRetrySriDocument, sriStatusHelpText, statusForAuthorizationFailure } from "../sriRetryPolicy";

const baseSale = {
  id: "s1",
  documentType: "factura",
  clientId: "c1",
  userId: "u1",
  createdAt: "2026-06-01T12:00:00.000Z",
  sequence: "000000001",
  accessKey: "key",
  subtotal: 10,
  tax: 1.5,
  total: 11.5,
  paymentMethod: "01",
  items: []
} as unknown as Sale;

function sale(overrides: Partial<Sale>): Sale {
  return { ...baseSale, status: "FIRMADA", ...overrides };
}

describe("sriRetryPolicy", () => {
  const sameDay = new Date("2026-06-01T10:00:00.000Z");

  it("permite reintento automatico para estados intermedios", () => {
    expect(shouldAutoRetrySriDocument(sale({ status: "FIRMADA" }), sameDay)).toBe(true);
    expect(shouldAutoRetrySriDocument(sale({ status: "ENVIADA" }), sameDay)).toBe(true);
  });

  it("permite reintento automatico solo para ERROR_SRI temporal", () => {
    expect(shouldAutoRetrySriDocument(sale({ status: "ERROR_SRI", sriMessage: "Network request failed" }), sameDay)).toBe(true);
    expect(shouldAutoRetrySriDocument(sale({ status: "ERROR_SRI", sriMessage: "Cedula invalida en comprador" }), sameDay)).toBe(false);
  });

  it("bloquea reintento automatico cuando el documento ya no es del mismo dia", () => {
    const nextDay = new Date("2026-06-02T10:00:00.000Z");
    const stale = sale({ status: "PENDIENTE_SRI" });
    expect(isStaleSriPendingDocument(stale, nextDay)).toBe(true);
    expect(shouldAutoRetrySriDocument(stale, nextDay)).toBe(false);
  });

  it("clasifica fallas de conexion SRI como pendiente, no como error de documento", () => {
    expect(statusForAuthorizationFailure("No se pudo conectar con el servicio del SRI. Detalle: fetch failed. Codigo: ECONNRESET.")).toBe("PENDIENTE_SRI");
    expect(statusForAuthorizationFailure("Cedula invalida en comprador")).toBe("ERROR_SRI");
  });

  it("no reintenta automaticamente documentos finales", () => {
    expect(shouldAutoRetrySriDocument(sale({ status: "AUTORIZADA" }))).toBe(false);
    expect(shouldAutoRetrySriDocument(sale({ status: "DEVUELTA" }))).toBe(false);
  });

  it("explica el estado con texto orientado al usuario", () => {
    expect(sriStatusHelpText(sale({ status: "ENVIADA", createdAt: new Date().toISOString() }))).toContain("En revision SRI");
    expect(sriStatusHelpText(sale({ status: "ERROR_SRI", sriMessage: "Cedula invalida" }))).toContain("Error del documento");
  });
});
