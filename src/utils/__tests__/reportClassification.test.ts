import { Sale } from "../../types";
import { buildReportDocumentCounts, saleMatchesReportFilter } from "../reportClassification";

const baseSale = {
  id: "sale",
  clientId: "client",
  userId: "user",
  createdAt: "2026-06-01T00:00:00.000Z",
  sequence: "000000001",
  accessKey: "",
  subtotal: 10,
  tax: 1.5,
  total: 11.5,
  paymentMethod: "01",
  items: []
} as unknown as Sale;

function sale(overrides: Partial<Sale>): Sale {
  return {
    ...baseSale,
    documentType: "factura",
    status: "AUTORIZADA",
    ...overrides
  };
}

describe("reportClassification", () => {
  it("deja el reporte tributario solo con documentos SRI autorizados", () => {
    expect(saleMatchesReportFilter(sale({ documentType: "factura", status: "AUTORIZADA" }), "tax", "all")).toBe(true);
    expect(saleMatchesReportFilter(sale({ documentType: "nota_credito", status: "AUTORIZADA" }), "tax", "all")).toBe(true);
    expect(saleMatchesReportFilter(sale({ documentType: "nota_venta", status: "TICKET_OFFLINE" }), "tax", "all")).toBe(false);
    expect(saleMatchesReportFilter(sale({ documentType: "nota_venta", status: "CONVERTIDA" }), "tax", "all")).toBe(false);
  });

  it("clasifica contadores de documentos operativos sin sumar convertidos como activos", () => {
    const counts = buildReportDocumentCounts([
      sale({ documentType: "factura", status: "AUTORIZADA" }),
      sale({ documentType: "nota_credito", status: "AUTORIZADA" }),
      sale({ documentType: "nota_venta", status: "TICKET_OFFLINE" }),
      sale({ documentType: "nota_venta", status: "CONVERTIDA" }),
      sale({ documentType: "proforma", status: "PROFORMA" }),
      sale({ documentType: "factura", status: "DEVUELTA" }),
      sale({ documentType: "factura", status: "BORRADOR" }),
      sale({ documentType: "nota_venta", status: "ANULADA" })
    ]);

    expect(counts.authorizedCount).toBe(2);
    expect(counts.creditNoteCount).toBe(1);
    expect(counts.internalCount).toBe(1);
    expect(counts.convertedCount).toBe(1);
    expect(counts.proformaCount).toBe(1);
    expect(counts.rejectedCount).toBe(1);
    expect(counts.pendingCount).toBe(1);
    expect(counts.voidedCount).toBe(1);
  });
});
