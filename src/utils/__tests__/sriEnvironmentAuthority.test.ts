import { initialData } from "../../database";
import type { AppData } from "../../types";
import { mergeAppDataSnapshots } from "../dataMerge";
import { applyCanonicalSriEnvironment } from "../sriEnvironmentAuthority";

function withEnvironment(environment: "1" | "2", environmentVersion?: number): AppData {
  return { ...initialData, issuer: { ...initialData.issuer, environment, environmentVersion } };
}

describe("autoridad empresarial del ambiente SRI", () => {
  it("iOS y PWA obsoletos aceptan la version remota superior", () => {
    const merged = mergeAppDataSnapshots(withEnvironment("1", 5), withEnvironment("2", 2));
    expect(merged.issuer).toMatchObject({ environment: "1", environmentVersion: 5 });
  });

  it("en igualdad de version prevalece el snapshot remoto canonico", () => {
    const merged = mergeAppDataSnapshots(withEnvironment("2", 3), withEnvironment("1", 3));
    expect(merged.issuer.environment).toBe("2");
  });

  it("una copia local con version realmente superior no se degrada", () => {
    const merged = mergeAppDataSnapshots(withEnvironment("1", 2), withEnvironment("2", 4));
    expect(merged.issuer).toMatchObject({ environment: "2", environmentVersion: 4 });
  });

  it("la confirmacion previa actualiza solo ambiente y version", () => {
    const current = withEnvironment("2", 1);
    const updated = applyCanonicalSriEnvironment(current, { environment: "1", environmentVersion: 2 });
    expect(updated.issuer).toMatchObject({ environment: "1", environmentVersion: 2, ruc: current.issuer.ruc });
    expect(updated.sales).toBe(current.sales);
  });

  it("cambiar establecimiento no modifica la autoridad empresarial", () => {
    const current = withEnvironment("2", 6);
    const changed = { ...current, issuer: { ...current.issuer, establishment: "002", emissionPoint: "010" } };
    expect(changed.issuer).toMatchObject({ environment: "2", environmentVersion: 6 });
  });
});
