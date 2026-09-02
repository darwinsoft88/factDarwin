import { initialData } from "../../database";
import { dataForDocumentEnvironmentView, localDocumentSimulationAvailable } from "../documentEnvironmentSimulation";

describe("simulación local del ambiente documental", () => {
  it("crea una proyección sin modificar el snapshot canónico", () => {
    const before = JSON.stringify(initialData);
    const projected = dataForDocumentEnvironmentView(initialData, "2");
    expect(projected.issuer.environment).toBe("2");
    expect(initialData.issuer.environment).toBe("1");
    expect(JSON.stringify(initialData)).toBe(before);
  });

  it("solo se habilita en desarrollo", () => {
    expect(localDocumentSimulationAvailable(true)).toBe(true);
    expect(localDocumentSimulationAvailable(false)).toBe(false);
  });
});
