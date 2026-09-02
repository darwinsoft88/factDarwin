jest.mock("../../database", () => ({ resolveStoredBackendUrl: (value: string) => value }));

import { getHistoricalDocumentsPage } from "../backendApi/documentHistory";

const item = {
  documentId: "sale-1",
  documentType: "factura",
  environment: "1",
  establishment: "002",
  emissionPoint: "010",
  sequential: "000000001",
  issueDate: "01/01/2025",
  createdAt: "2025-01-01T00:00:00.000Z",
  clientId: "client-1",
  clientDisplayName: "Cliente",
  totalMicros: "1000000",
  status: "AUTORIZADA",
  sriStatus: "AUTORIZADA",
  emailStatus: "none",
  hasAuthorizedXml: true,
  hasRideData: true,
};

describe("cliente HTTP del historial documental", () => {
  afterEach(() => jest.restoreAllMocks());

  it("envia el contrato, headers y cursor sin superar 100 registros", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, protocolVersion: 1, mode: "historical-read-only", items: [item], nextCursor: "opaque", hasMore: true, queryWatermark: "9", countReturned: 1 }),
    } as Response);
    await getHistoricalDocumentsPage("https://api.example", "token", "android", "device", { documentScope: "002-010", environment: "1", cursor: "previous", limit: 500 });
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("limit=100");
    expect(String(url)).toContain("cursor=previous");
    expect(String(url)).toContain("environment=1");
    expect((options?.headers as Record<string, string>)["X-Historical-Documents-Protocol-Version"]).toBe("1");
    expect((options?.headers as Record<string, string>)["X-Device-Id"]).toBe("device");
  });

  it("propaga un codigo HTTP estructurado sin borrar el fallback local", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ ok: false, error: { code: "HISTORICAL_DOCUMENTS_DATABASE_ERROR" } }),
    } as Response);
    await expect(getHistoricalDocumentsPage("https://api.example", "token", "web", "device", { documentScope: "002-010", environment: "2" }))
      .rejects.toMatchObject({ code: "HISTORICAL_DOCUMENTS_DATABASE_ERROR" });
  });
});
