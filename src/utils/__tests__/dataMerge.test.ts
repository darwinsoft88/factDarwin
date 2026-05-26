import { initialData } from "../../storage";
import { Sale } from "../../types";
import { mergeAppDataSnapshots } from "../dataMerge";
import { normalizedEstablishments } from "../establishments";

function sale(id: string, sequence: string, createdAt: string): Sale {
  return {
    id,
    clientId: "client-1",
    userId: "user-1",
    createdAt,
    sequence,
    accessKey: "",
    subtotal: 0,
    tax: 0,
    total: 0,
    paymentMethod: "01",
    status: "INTERNA",
    items: []
  };
}

describe("dataMerge", () => {
  it("keeps local pending sync while merging remote documents", () => {
    const remote = {
      ...initialData,
      sales: [sale("remote-sale", "000000010", "2026-05-01T00:00:00.000Z")],
      pendingSync: []
    };
    const local = {
      ...initialData,
      sales: [sale("local-sale", "000000011", "2026-05-01T00:00:01.000Z")],
      pendingSync: [{ id: "p1", title: "Pendiente", attempts: 0, createdAt: "2026-05-01T00:00:02.000Z", lastError: "offline", patch: { baseData: initialData } }]
    };

    const merged = mergeAppDataSnapshots(remote, local);

    expect(merged.sales.map((sale) => sale.id)).toEqual(["local-sale", "remote-sale"]);
    expect(merged.pendingSync).toHaveLength(1);
    expect(merged.pendingSync?.[0]?.id).toBe("p1");
  });

  it("uses the highest sequence only inside the same issuer scope", () => {
    const remote = {
      ...initialData,
      issuer: {
        ...initialData.issuer,
        environment: "1" as const,
        establishment: "002",
        emissionPoint: "003",
        activeEstablishmentId: "002-003",
        sequential: 25,
        establishments: [{ id: "002-003", name: "Matriz", establishment: "002", emissionPoint: "003", address: "B", sequential: 25, active: true }]
      }
    };
    const local = {
      ...initialData,
      issuer: {
        ...initialData.issuer,
        environment: "1" as const,
        establishment: "002",
        emissionPoint: "003",
        activeEstablishmentId: "002-003",
        sequential: 20,
        establishments: [{ id: "002-003", name: "Matriz", establishment: "002", emissionPoint: "003", address: "B", sequential: 20, active: true }]
      }
    };

    expect(mergeAppDataSnapshots(remote, local).issuer.sequential).toBe(25);
  });

  it("does not copy a remote sequence from another emission point", () => {
    const remote = {
      ...initialData,
      issuer: {
        ...initialData.issuer,
        environment: "1" as const,
        establishment: "001",
        emissionPoint: "001",
        activeEstablishmentId: "001-001",
        sequential: 99,
        establishments: [{ id: "001-001", name: "Matriz", establishment: "001", emissionPoint: "001", address: "A", sequential: 99, active: true }]
      }
    };
    const local = {
      ...initialData,
      issuer: {
        ...initialData.issuer,
        environment: "1" as const,
        establishment: "002",
        emissionPoint: "003",
        activeEstablishmentId: "002-003",
        sequential: 20,
        establishments: [{ id: "002-003", name: "Matriz", establishment: "002", emissionPoint: "003", address: "B", sequential: 20, active: true }]
      }
    };

    expect(mergeAppDataSnapshots(remote, local).issuer.sequential).toBe(20);
  });

  it("keeps the newer establishments list when one device deletes an emission point", () => {
    const remote = {
      ...initialData,
      issuer: {
        ...initialData.issuer,
        establishmentsUpdatedAt: "2026-05-01T00:00:00.000Z",
        establishments: [
          { id: "001-010", name: "Viejo", establishment: "001", emissionPoint: "010", address: "A", sequential: 1, active: true },
          { id: "002-003", name: "Matriz", establishment: "002", emissionPoint: "003", address: "B", sequential: 18, active: true }
        ]
      }
    };
    const local = {
      ...initialData,
      issuer: {
        ...initialData.issuer,
        establishmentsUpdatedAt: "2026-05-02T00:00:00.000Z",
        establishments: [
          { id: "002-003", name: "Matriz", establishment: "002", emissionPoint: "003", address: "B", sequential: 18, active: true }
        ]
      }
    };

    const merged = mergeAppDataSnapshots(remote, local);

    expect(normalizedEstablishments(merged.issuer).map((item) => item.id)).toEqual(["002-003"]);
  });
});
