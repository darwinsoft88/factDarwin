import { initialData } from "../../database";
import { authorizeInvoice, queryInvoiceAuthorization } from "../../services/backend";
import { Sale, User } from "../../types";
import { autoRetrySriDocuments, expireStaleSriPendingDocuments, pendingAutoRetrySriDocuments } from "../autoRetrySriDocuments";

jest.mock("../../services/backend", () => ({
  authorizeInvoice: jest.fn(),
  queryInvoiceAuthorization: jest.fn()
}));

const authorizeInvoiceMock = authorizeInvoice as jest.MockedFunction<typeof authorizeInvoice>;
const queryInvoiceAuthorizationMock = queryInvoiceAuthorization as jest.MockedFunction<typeof queryInvoiceAuthorization>;

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

  it("consulta una factura ENVIADA sin reconstruirla, reenviarla ni tocar inventario", async () => {
    const sentSale = {
      ...baseSale,
      status: "ENVIADA" as const,
      accessKey: "1808202601172377209900110020100000003711234567811",
      inventoryState: "APPLIED" as const,
      inventoryOperationId: "inventory-371",
      signedXml: "<factura>firmada-original</factura>",
      retryHistory: ["2026-06-01T08:00:00.000Z"]
    };
    let current: typeof initialData = { ...initialData, backendUrl: "https://api.test", sales: [sentSale] };
    queryInvoiceAuthorizationMock.mockResolvedValue({
      ok: true,
      sent: true,
      status: "ENVIADA",
      accessKey: sentSale.accessKey,
      authorizationPending: true,
      numberOfDocuments: 0,
      sriMessage: "Pendiente de autorizacion"
    });

    const result = await autoRetrySriDocuments({
      backendToken: "token",
      initialData: current,
      getCurrentData: () => current,
      persistMutation: async (mutation) => {
        current = typeof mutation === "function" ? await mutation(current) : current;
        return current;
      },
      user: testUser,
      authorizationQueriesOnly: true
    });

    expect(queryInvoiceAuthorizationMock).toHaveBeenCalledWith("https://api.test", sentSale.accessKey, "token");
    expect(authorizeInvoiceMock).not.toHaveBeenCalled();
    expect(current.sales[0]).toMatchObject({
      status: "ENVIADA",
      inventoryState: "APPLIED",
      inventoryOperationId: "inventory-371",
      signedXml: "<factura>firmada-original</factura>",
      retryHistory: ["2026-06-01T08:00:00.000Z"]
    });
    expect(result.authorized).toBe(0);
  });

  it("promueve una factura ENVIADA a AUTORIZADA usando solo la consulta", async () => {
    const sentSale = {
      ...baseSale,
      status: "ENVIADA" as const,
      accessKey: "1808202601172377209900110020100000003711234567811",
      inventoryState: "APPLIED" as const,
      inventoryOperationId: "inventory-371",
      signedXml: "<factura>firmada-original</factura>"
    };
    let current: typeof initialData = { ...initialData, backendUrl: "https://api.test", sales: [sentSale] };
    queryInvoiceAuthorizationMock.mockResolvedValue({
      ok: true,
      sent: true,
      accessKey: sentSale.accessKey,
      authorizationStatus: "AUTORIZADO",
      authorizationNumber: sentSale.accessKey,
      authorizationDate: "2026-08-18T22:13:00-05:00",
      authorizedXml: "<factura>autorizada</factura>",
      sriMessage: "AUTORIZADO"
    });

    const result = await autoRetrySriDocuments({
      backendToken: "token",
      initialData: current,
      getCurrentData: () => current,
      persistMutation: async (mutation) => {
        current = typeof mutation === "function" ? await mutation(current) : current;
        return current;
      },
      user: testUser,
      authorizationQueriesOnly: true
    });

    expect(authorizeInvoiceMock).not.toHaveBeenCalled();
    expect(current.sales[0]).toMatchObject({
      status: "AUTORIZADA",
      inventoryState: "APPLIED",
      signedXml: "<factura>firmada-original</factura>",
      authorizedXml: "<factura>autorizada</factura>"
    });
    expect(result.authorized).toBe(1);
  });
});
