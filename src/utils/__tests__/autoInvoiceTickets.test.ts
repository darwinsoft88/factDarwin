import { initialData } from "../../database";
import { Sale } from "../../types";
import { isAutoInvoiceTicket, pendingAutoInvoiceTickets } from "../autoInvoiceTickets";

const baseSale = {
  id: "sale",
  clientId: "client",
  userId: "user",
  createdAt: "2026-06-01T00:00:00.000Z",
  sequence: "NV-000000001",
  accessKey: "",
  subtotal: 10,
  tax: 1.5,
  total: 11.5,
  paymentMethod: "01",
  items: []
} as unknown as Sale;

function ticket(overrides: Partial<Sale>): Sale {
  return {
    ...baseSale,
    documentType: "nota_venta",
    status: "TICKET_OFFLINE",
    autoInvoiceOnSync: true,
    ...overrides
  };
}

describe("autoInvoiceTickets", () => {
  it("solo toma tickets offline creados para autofacturar", () => {
    const autoTicket = ticket({ id: "auto" });
    const normalTicket = ticket({ id: "normal", autoInvoiceOnSync: false });
    const convertedTicket = ticket({ id: "converted", status: "CONVERTIDA" });

    expect(isAutoInvoiceTicket(autoTicket, [autoTicket])).toBe(true);
    expect(isAutoInvoiceTicket(normalTicket, [normalTicket])).toBe(false);
    expect(isAutoInvoiceTicket(convertedTicket, [convertedTicket])).toBe(false);
  });

  it("no vuelve a tomar un ticket si ya existe factura relacionada", () => {
    const autoTicket = ticket({ id: "auto" });
    const invoice = {
      ...baseSale,
      id: "invoice",
      documentType: "factura",
      status: "ERROR_SRI",
      sequence: "000000001",
      sourceSaleId: "auto"
    } as Sale;

    expect(isAutoInvoiceTicket(autoTicket, [autoTicket, invoice])).toBe(false);
  });

  it("ordena por fecha y respeta limite de procesamiento", () => {
    const data = {
      ...initialData,
      sales: [
        ticket({ id: "new", createdAt: "2026-06-02T00:00:00.000Z" }),
        ticket({ id: "old", createdAt: "2026-06-01T00:00:00.000Z" }),
        ticket({ id: "normal", autoInvoiceOnSync: false, createdAt: "2026-05-31T00:00:00.000Z" })
      ]
    };

    expect(pendingAutoInvoiceTickets(data, 1).map((sale) => sale.id)).toEqual(["old"]);
  });
});
