import { displayInvoiceStatus, normalizeSaleStatus } from "../invoiceStatus";
import { resolveInvoiceStatus } from "../documents";
import { Sale } from "../../types";

describe("invoiceStatus", () => {
  it("normaliza tickets antiguos anulados por conversion al estado convertido", () => {
    const sale = {
      status: "ANULADA",
      voidReason: "Convertida a factura 000000120",
      sriMessage: ""
    } as Sale;

    expect(normalizeSaleStatus(sale)).toBe("CONVERTIDA");
    expect(displayInvoiceStatus("CONVERTIDA")).toBe("CONVERTIDA");
  });

  it("no deja una factura emitida como borrador si la autorizacion queda incompleta", () => {
    expect(resolveInvoiceStatus({ ok: true })).toBe("PENDIENTE_SRI");
  });
});
