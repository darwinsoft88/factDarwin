import { initialData } from "../../database";
import { activeEstablishment, normalizedEstablishments, updateIssuerEstablishmentSequence } from "../establishments";

describe("establishments", () => {
  it("renames duplicate Matriz labels so emission points are distinguishable", () => {
    const issuer = {
      ...initialData.issuer,
      establishments: [
        { id: "002-003", name: "Matriz", establishment: "002", emissionPoint: "003", address: "A", sequential: 18, active: true },
        { id: "001-001", name: "Matriz", establishment: "001", emissionPoint: "001", address: "B", sequential: 2, active: true }
      ]
    };

    const establishments = normalizedEstablishments(issuer);

    expect(establishments.map((item) => item.name)).toEqual(["Sucursal 002-003", "Matriz"]);
  });

  it("does not select inactive establishments as active", () => {
    const issuer = {
      ...initialData.issuer,
      activeEstablishmentId: "001-010",
      establishments: [
        { id: "001-010", name: "Eliminado", establishment: "001", emissionPoint: "010", address: "A", sequential: 1, active: false },
        { id: "002-003", name: "Matriz", establishment: "002", emissionPoint: "003", address: "B", sequential: 18, active: true }
      ]
    };

    expect(activeEstablishment(issuer)).toMatchObject({ id: "002-003", active: true });
  });

  it("updates only the selected establishment sequence", () => {
    const issuer = {
      ...initialData.issuer,
      activeEstablishmentId: "002-003",
      establishments: [
        { id: "001-001", name: "Matriz", establishment: "001", emissionPoint: "001", address: "A", sequential: 2, active: true },
        { id: "002-003", name: "Sucursal", establishment: "002", emissionPoint: "003", address: "B", sequential: 18, active: true }
      ]
    };

    const updated = updateIssuerEstablishmentSequence(issuer, "002-003", "sequential", 20);
    const establishments = normalizedEstablishments(updated);

    expect(establishments.find((item) => item.id === "002-003")?.sequential).toBe(20);
    expect(establishments.find((item) => item.id === "001-001")?.sequential).toBe(2);
    expect(updated.sequential).toBe(20);
  });
});
