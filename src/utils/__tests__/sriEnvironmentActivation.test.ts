import { initialData } from "../../database";
import type { AppData } from "../../types";
import { canActivateRealBilling, changeSriEnvironmentAuthoritatively, realBillingRequirements } from "../sriEnvironmentActivation";
import type { ProductionChecklistValue } from "../../components/ProductionChecklist";
import { buildProductionChecklist } from "../../validation";

const readyChecklist: ProductionChecklistValue = {
  baseChecks: [{ label: "RUC emisor valido", ok: true }, { label: "Secuenciales factura/guia/nota credito", ok: true }],
  connectionChecks: [{ label: "Servidor probado en esta sesion", ok: true }, { label: "Certificado y clave detectados", ok: true }],
  productionChecks: [{ label: "Ambiente app en produccion", ok: false }, { label: "Backend en produccion", ok: true }, { label: "Envio real al SRI activo", ok: true }]
};

function snapshot(environment: "1" | "2" = "1"): AppData {
  return { ...initialData, issuer: { ...initialData.issuer, environment, environmentVersion: 4 }, sales: [...initialData.sales], pendingSync: [{ id: "pending", title: "sincronizar", createdAt: new Date().toISOString(), attempts: 0, patch: {} }] };
}

describe("guided SRI environment activation", () => {
  it("reconoce el formato actual del diagnostico del backend productivo", () => {
    const checklist = buildProductionChecklist(
      initialData.issuer,
      "https://api.factudarwin.com",
      [
        "Backend responde: SI",
        "Ambiente backend por defecto: production",
        "Envio real al SRI: ACTIVO",
        "Certificado existe: SI",
        "Clave certificado configurada: SI"
      ].join("\n")
    );

    expect(checklist.productionChecks.find((item) => item.label === "Backend en produccion")?.ok).toBe(true);
  });

  it("usa los checks existentes e ignora solo el check que será satisfecho por la activación", () => {
    expect(canActivateRealBilling(readyChecklist)).toBe(true);
    expect(realBillingRequirements(readyChecklist).some((item) => item.label === "Ambiente app en produccion")).toBe(false);
    expect(canActivateRealBilling({ ...readyChecklist, connectionChecks: [{ label: "Certificado y clave detectados", ok: false }] })).toBe(false);
  });

  it("confirma backend con expectedVersion antes de cambiar el estado local", async () => {
    const data = snapshot("1");
    const events: string[] = [];
    let committed: AppData | null = null;
    await changeSriEnvironmentAuthoritatively({
      data,
      target: "2",
      backendToken: "token",
      readCanonical: async () => { events.push("read"); return { ok: true, environment: "1", environmentVersion: 4 }; },
      updateCanonical: async (_url, environment, expectedVersion) => { events.push(`update:${environment}:${expectedVersion}`); return { ok: true, environment: "2", environmentVersion: 5 }; },
      commit: async (next) => { events.push("commit"); committed = next; }
    });
    expect(events).toEqual(["read", "update:2:4", "commit"]);
    expect(committed!.issuer.environment).toBe("2");
    expect(committed!.issuer.environmentVersion).toBe(5);
    expect(committed!.issuer.sequential).toBe(data.issuer.sequential);
    expect(committed!.sales).toEqual(data.sales);
    expect(committed!.pendingSync).toEqual(data.pendingSync);
    expect(data.issuer.environment).toBe("1");
  });

  it("un fallo backend no marca producción localmente", async () => {
    const data = snapshot("1");
    const commit = jest.fn();
    await expect(changeSriEnvironmentAuthoritatively({
      data,
      target: "2",
      backendToken: "token",
      readCanonical: async () => ({ ok: true, environment: "1", environmentVersion: 7 }),
      updateCanonical: async () => { throw new Error("offline"); },
      commit
    })).rejects.toThrow("offline");
    expect(commit).not.toHaveBeenCalled();
    expect(data.issuer.environment).toBe("1");
  });

  it("recalcula empresa A/B sin mezclar ambientes", () => {
    expect(snapshot("2").issuer.environment).toBe("2");
    expect(snapshot("1").issuer.environment).toBe("1");
  });
});
