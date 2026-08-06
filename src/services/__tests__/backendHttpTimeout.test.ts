import * as http from "../backendApi/http";
import { backupAppData } from "../backendApi/data";
import { authorizeInvoice } from "../backendApi/sri";

function abortablePendingFetch() {
  return jest.fn((_url: string, options?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    options?.signal?.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    });
  }));
}

describe("timeouts del cliente HTTP", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("conserva 12 segundos como timeout predeterminado", async () => {
    jest.useFakeTimers();
    global.fetch = abortablePendingFetch() as typeof fetch;

    const request = http.postJson("https://example.test/api/login", {}, "Sin conexion");
    const rejection = expect(request).rejects.toThrow("tiempo de espera agotado (12s)");
    await jest.advanceTimersByTimeAsync(12000);

    await rejection;
  });

  it("permite 60 segundos solamente cuando la llamada lo solicita", async () => {
    jest.useFakeTimers();
    global.fetch = abortablePendingFetch() as typeof fetch;

    const request = http.postJson("https://example.test/api/data", {}, "Sin conexion", "token", 60000);
    const rejection = expect(request).rejects.toThrow("tiempo de espera agotado (60s)");
    await jest.advanceTimersByTimeAsync(12000);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(48000);

    await rejection;
  });

  it("backupAppData aplica 60 segundos a POST /api/data sin esperar si el servidor responde", async () => {
    const response = new Response(JSON.stringify({ ok: true, updatedAt: "2026-08-01T10:00:00.000Z" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
    const postSpy = jest.spyOn(http, "postJson").mockResolvedValue(response);

    const result = await backupAppData("https://api.example.test", { clients: [] }, "token");

    expect(result.ok).toBe(true);
    expect(postSpy).toHaveBeenCalledWith(
      "https://api.example.test/api/data",
      { data: { clients: [] } },
      expect.any(String),
      "token",
      60000
    );
  });

  it("aplica 60 segundos solamente a la autorizacion de facturas SRI", async () => {
    const response = new Response(JSON.stringify({ ok: true, authorizationStatus: "AUTORIZADO" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
    const postSpy = jest.spyOn(http, "postJson").mockResolvedValue(response);

    await authorizeInvoice("https://api.example.test", "<factura />", "token");

    expect(postSpy).toHaveBeenCalledWith(
      "https://api.example.test/api/facturas/autorizar",
      { xml: "<factura />" },
      expect.any(String),
      "token",
      60000
    );
  });

  it("permite completar un snapshot cercano a 6,6 MB despues de superar 12 segundos", async () => {
    jest.useFakeTimers();
    let receivedBytes = 0;
    global.fetch = jest.fn((_url: string, options?: RequestInit) => {
      receivedBytes = typeof options?.body === "string" ? new TextEncoder().encode(options.body).byteLength : 0;
      return new Promise<Response>((resolve) => {
        setTimeout(() => resolve(new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })), 13000);
      });
    }) as typeof fetch;
    const snapshot = { payload: "x".repeat(Math.floor(6.6 * 1024 * 1024)) };

    const upload = backupAppData("https://api.example.test", snapshot, "token");
    await jest.advanceTimersByTimeAsync(12000);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1000);
    await expect(upload).resolves.toMatchObject({ ok: true });
    expect(receivedBytes).toBeGreaterThanOrEqual(Math.floor(6.6 * 1024 * 1024));
  });

  it("distingue una interrupcion de red de un timeout", async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Network request failed")) as typeof fetch;

    await expect(backupAppData("https://api.example.test", { clients: [] }, "token"))
      .rejects.toThrow("Network request failed");
  });

  it("no informa exito cuando el backend rechaza la subida", async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Subida rechazada" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    })) as typeof fetch;

    await expect(backupAppData("https://api.example.test", { clients: [] }, "token"))
      .rejects.toThrow("Subida rechazada");
  });
});
