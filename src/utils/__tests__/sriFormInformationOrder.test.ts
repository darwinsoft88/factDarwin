import fs from "node:fs";
import path from "node:path";

describe("orden profesional del formulario SRI", () => {
  it("presenta identidad y régimen antes de establecimientos y servidor", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/screens/SriScreen.tsx"), "utf8");
    const identity = source.indexOf("<IssuerIdentityFields");
    const taxes = source.indexOf("<IssuerTaxSettings");
    const establishment = source.indexOf("<IssuerEstablishmentFields");
    const actions = source.indexOf("<EstablishmentActions");
    const server = source.indexOf("<IssuerServerSettings");

    expect(identity).toBeGreaterThan(-1);
    expect(identity).toBeLessThan(taxes);
    expect(taxes).toBeLessThan(establishment);
    expect(establishment).toBeLessThan(actions);
    expect(actions).toBeLessThan(server);
    expect(source).toContain("styles.establishmentCard");
  });
});
