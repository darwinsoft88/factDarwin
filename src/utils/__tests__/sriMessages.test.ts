import { explainSriResult } from "../sriMessages";

describe("SRI signing messages", () => {
  it("reports a certificate RUC mismatch without claiming the p12 is missing", () => {
    const result = explainSriResult({
      ok: false,
      error: "RucCertificado: 1111111111111 RucComprobante: 2222222222222"
    } as any);

    expect(result.title).toBe("El certificado no corresponde al comprobante");
    expect(result.detail).not.toContain("No se encontro la firma");
    expect(result.detail).not.toContain("1111111111111");
    expect(result.detail).not.toContain("2222222222222");
    expect(result.action).toContain("No reintente");
  });

  it("distinguishes an invalid signature from a missing certificate", () => {
    const result = explainSriResult({ ok: false, error: "FIRMA INVALIDA" } as any);

    expect(result.title).toBe("Firma electronica invalida");
    expect(result.detail).not.toContain("No se encontro la firma");
  });
});
