import { queryInvoiceAuthorization } from "../backendApi/sri";

describe("queryInvoiceAuthorization", () => {
  afterEach(() => jest.restoreAllMocks());

  it("calls only the authorization-query endpoint with the access key", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, sent: true, status: "ENVIADA", authorizationPending: true, numberOfDocuments: 0 })
    } as Response);

    const result = await queryInvoiceAuthorization("https://api.test", "key-371", "token");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]!;
    expect(request[0]).toBe("https://api.test/api/facturas/consultar-autorizacion");
    expect(JSON.parse(String((request[1] as RequestInit).body))).toEqual({ accessKey: "key-371" });
    expect(result.authorizationPending).toBe(true);
  });
});
