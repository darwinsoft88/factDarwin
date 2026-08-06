import {
  recordSyncTransportMetric,
  syncErrorCode,
  utf8ByteLength,
} from "../syncObservability";

describe("syncObservability", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("calcula bytes UTF-8 y no cantidad de caracteres", () => {
    expect(utf8ByteLength("á")).toBe(2);
    expect(utf8ByteLength({ ok: true })).toBe(
      utf8ByteLength(JSON.stringify({ ok: true })),
    );
  });

  it("registra únicamente metadata estructurada", () => {
    const info = jest.spyOn(console, "info").mockImplementation(() => undefined);

    recordSyncTransportMetric({
      operation: "merge",
      durationMs: 10.6,
      ok: true,
      requestBytes: 120,
      responseBytes: 80,
      statusCode: 200,
    });

    expect(info).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(String(info.mock.calls[0]?.[0]));
    expect(entry).toEqual({
      event: "sync_transport_metric",
      operation: "merge",
      durationMs: 11,
      ok: true,
      requestBytes: 120,
      responseBytes: 80,
      statusCode: 200,
    });
  });

  it("clasifica errores sin incluir el mensaje potencialmente sensible", () => {
    const error = Object.assign(new Error("correo privado"), {
      code: "SYNC_OPERATION_MISMATCH",
    });
    expect(syncErrorCode(error)).toBe("SYNC_OPERATION_MISMATCH");
    expect(syncErrorCode(new TypeError("dato privado"))).toBe("TypeError");
  });
});
