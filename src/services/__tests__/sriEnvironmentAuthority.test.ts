jest.mock("../../database", () => ({ resolveStoredBackendUrl: (value: string) => value }));

import { getCompanySriEnvironment, reserveDocumentSequence, updateCompanySriEnvironment } from "../backendApi/sri";

describe("API de autoridad SRI", () => {
  afterEach(() => jest.restoreAllMocks());

  it("consulta el ambiente canonico antes de emitir", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, environment: "1", environmentVersion: 4 }) } as Response);
    await expect(getCompanySriEnvironment("https://api.test", "token")).resolves.toMatchObject({ environment: "1", environmentVersion: 4 });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/sri/environment");
  });

  it("cambia el ambiente con version esperada", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, environment: "2", environmentVersion: 5, changed: true }) } as Response);
    await updateCompanySriEnvironment("https://api.test", "2", 4, "token");
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({ environment: "2", expectedVersion: 4 });
  });

  it("backend inaccesible bloquea la confirmacion sin tocar otros modulos", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("offline"));
    await expect(getCompanySriEnvironment("https://api.test", "token")).rejects.toThrow("No se pudo confirmar el ambiente SRI vigente");
  });

  it("la reserva rechazada por ambiente obsoleto no devuelve secuencial", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({ ok: false, status: 409, json: async () => ({ code: "SRI_ENVIRONMENT_STALE", error: "No se pudo confirmar el ambiente SRI vigente." }) } as Response);
    await expect(reserveDocumentSequence("https://api.test", { documentType: "factura", issuer: { environment: "2", environmentVersion: 1 }, createdAt: "2026-08-09T00:00:00.000Z" }, "token")).rejects.toThrow("No se pudo confirmar");
  });
});
