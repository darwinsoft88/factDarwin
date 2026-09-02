import type { ProductionChecklistValue } from "../../components/ProductionChecklist";
import { realBillingSummary } from "../sriEnvironmentPresentation";

const readyChecklist: ProductionChecklistValue = {
  baseChecks: [
    { label: "RUC emisor valido", ok: true },
    { label: "Establecimiento y punto de emision", ok: true },
    { label: "Secuenciales factura/guia/nota credito", ok: true },
    { label: "URL de servidor configurada", ok: true }
  ],
  connectionChecks: [
    { label: "Servidor probado en esta sesion", ok: true },
    { label: "Certificado y clave detectados", ok: true }
  ],
  productionChecks: [
    { label: "Ambiente app en produccion", ok: false },
    { label: "Backend en produccion", ok: true },
    { label: "Envio real SRI activo", ok: true }
  ]
};

describe("resumen de facturación electrónica", () => {
  it("agrupa todos los requisitos empresariales sin exponer checks técnicos", () => {
    const summary = realBillingSummary(readyChecklist, { configured: true, expirationStatus: "valid" });
    expect(summary.company).toEqual({ ok: true, label: "Empresa lista" });
    expect(summary.connection).toEqual({ ok: true, label: "Servidor del SRI verificado" });
  });

  it("marca empresa incompleta cuando falla un requisito empresarial", () => {
    const checklist = { ...readyChecklist, baseChecks: readyChecklist.baseChecks.map((item, index) => index === 1 ? { ...item, ok: false } : item) };
    expect(realBillingSummary(checklist).company).toEqual({ ok: false, label: "Completa los datos de tu empresa" });
  });

  it("distingue firma vigente, ausente y vencida desde metadata real", () => {
    expect(realBillingSummary(readyChecklist, { configured: true, expirationStatus: "valid" }).certificate).toEqual({ ok: true, label: "Firma electrónica lista" });
    expect(realBillingSummary(readyChecklist, { configured: false }).certificate).toEqual({ ok: false, label: "Falta firma electrónica" });
    expect(realBillingSummary(readyChecklist, { configured: true, expirationStatus: "expired" }).certificate).toEqual({ ok: false, label: "Firma electrónica vencida" });
  });

  it("avisa vencimiento próximo sin inventar un bloqueo", () => {
    expect(realBillingSummary(readyChecklist, { configured: true, expirationStatus: "warning", daysRemaining: 20 }).certificate).toEqual({ ok: true, label: "Firma electrónica lista", warning: "Vence pronto · 20 día(s)" });
  });

  it("resume como pendiente cualquier fallo interno de conexión", () => {
    const checklist = { ...readyChecklist, productionChecks: readyChecklist.productionChecks.map((item, index) => index === 2 ? { ...item, ok: false } : item) };
    expect(realBillingSummary(checklist, { configured: true, expirationStatus: "valid" }).connection).toEqual({ ok: false, label: "Falta verificar el servidor del SRI" });
  });
});
