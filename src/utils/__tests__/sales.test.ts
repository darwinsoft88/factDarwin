import { canEditSale, findPotentialDuplicatePendingInvoice, isConvertedSale, saleStatusReducesStock, uniquePendingOfficialInvoices } from "../sales";
import { Sale } from "../../types";

const baseSale = {
  id: "s1",
  clientId: "c1",
  userId: "u1",
  createdAt: "2026-06-01T00:00:00.000Z",
  sequence: "NV-000000001",
  accessKey: "",
  subtotal: 10,
  tax: 0,
  total: 10,
  paymentMethod: "01",
  items: []
} as unknown as Sale;

describe("sales document lifecycle", () => {
  it("reconoce documentos convertidos por estado explicito y por datos antiguos", () => {
    expect(isConvertedSale({ ...baseSale, status: "CONVERTIDA" })).toBe(true);
    expect(isConvertedSale({ ...baseSale, status: "ANULADA", voidReason: "Convertida a factura 000000001" })).toBe(true);
    expect(isConvertedSale({ ...baseSale, status: "TICKET_OFFLINE" })).toBe(false);
  });

  it("un documento convertido no vuelve a descontar inventario", () => {
    expect(saleStatusReducesStock("TICKET_OFFLINE")).toBe(true);
    expect(saleStatusReducesStock("CONVERTIDA")).toBe(false);
  });

  it("detecta factura pendiente duplicada antes de emitir otra igual", () => {
    const pending = {
      ...baseSale,
      id: "pending",
      documentType: "factura",
      status: "PENDIENTE_SRI",
      establishment: "002",
      emissionPoint: "010",
      paymentMethod: "01",
      items: [{ productId: "p1", code: "P1", name: "Producto", quantity: 1, unitPrice: 10, discount: 0, ivaRate: 0 }]
    } as Sale;
    const draft = {
      ...pending,
      id: "draft",
      sequence: "000000002",
      accessKey: "new-key"
    };

    expect(findPotentialDuplicatePendingInvoice([pending], draft)?.id).toBe("pending");
  });

  it("mantiene una sola factura pendiente igual para reintento automatico", () => {
    const first = {
      ...baseSale,
      id: "first",
      documentType: "factura",
      status: "PENDIENTE_SRI",
      establishment: "002",
      emissionPoint: "010",
      items: [{ productId: "p1", code: "P1", name: "Producto", quantity: 1, unitPrice: 10, discount: 0, ivaRate: 0 }]
    } as Sale;
    const duplicate = { ...first, id: "duplicate", sequence: "000000002", accessKey: "key-2" } as Sale;

    expect(uniquePendingOfficialInvoices([first, duplicate]).map((sale) => sale.id)).toEqual(["first"]);
  });

  it("no permite editar facturas en proceso SRI", () => {
    expect(canEditSale({ ...baseSale, documentType: "factura", status: "PENDIENTE_SRI" })).toBe(false);
    expect(canEditSale({ ...baseSale, documentType: "factura", status: "ENVIADA" })).toBe(false);
    expect(canEditSale({ ...baseSale, documentType: "factura", status: "ERROR_SRI" })).toBe(true);
  });
});
