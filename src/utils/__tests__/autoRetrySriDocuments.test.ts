import { initialData } from "../../database";
import { Sale, User } from "../../types";
import { expireStaleSriPendingDocuments, pendingAutoRetrySriDocuments } from "../autoRetrySriDocuments";

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

describe("autoRetrySriDocuments", () => {
  const testUser = initialData.users[0] as User;

  it("selecciona solo documentos con problema temporal o estado intermedio", () => {
    const data = {
      ...initialData,
      sales: [
        { ...baseSale, id: "sent", status: "ENVIADA" as const },
        { ...baseSale, id: "network", status: "ERROR_SRI" as const, sriMessage: "Network request failed" },
        { ...baseSale, id: "bad-doc", status: "ERROR_SRI" as const, sriMessage: "Cedula invalida" },
        { ...baseSale, id: "ok", status: "AUTORIZADA" as const }
      ]
    };

    jest.useFakeTimers().setSystemTime(new Date("2026-06-01T10:00:00.000Z"));
    expect(pendingAutoRetrySriDocuments(data, 10).map((sale) => sale.id)).toEqual(["sent", "network"]);
    jest.useRealTimers();
  });

  it("anula documentos SRI vencidos y no los deja para reintento", () => {
    const data = {
  ...initialData,
  sales: [
    {
      ...baseSale,
      id: "old",
      status: "PENDIENTE_SRI" as const,
      inventoryState: "NOT_APPLIED" as const
    }
  ]
    };
    const result = expireStaleSriPendingDocuments(data, testUser, new Date("2026-06-02T10:00:00.000Z"));

    expect(result.expired).toBe(1);
    const expiredSale = result.data.sales[0] as Sale;
    expect(expiredSale.status).toBe("ANULADA");
    expect(expiredSale.voidReason).toContain("fuera del dia");
  });
});
