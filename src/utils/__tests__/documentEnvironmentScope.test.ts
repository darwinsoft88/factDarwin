import type { AppData, Environment, RemissionGuide, Sale } from "../../types";
import {
  documentEnvironment,
  guideInActiveScope,
  saleInActiveScope,
  scopedReportData,
} from "../documents";

function data(environment: Environment): AppData {
  return {
    issuer: {
      ruc: "1790012345001", businessName: "Empresa", tradeName: "Empresa", logoUrl: "", address: "Quito",
      establishment: "001", emissionPoint: "001", sequential: 1, environment,
      taxpayerType: "juridica", accountingRequired: "NO", specialTaxpayer: "NO", specialTaxpayerResolution: "",
    },
    sales: [], guides: [], cashClosings: [], receivedRetentions: [], creditPayments: [], creditAdjustments: [],
  } as unknown as AppData;
}

function sale(id: string, environment: Environment, establishment = "001"): Sale {
  return {
    id, environment, sriEnvironment: environment, documentType: "factura", establishment, emissionPoint: "001",
    clientId: "client", userId: "user", createdAt: "2026-08-30T12:00:00.000Z", sequence: "000000001",
    accessKey: "", subtotal: 1, tax: 0.15, total: 1.15, paymentMethod: "01", status: "AUTORIZADA", items: [],
  };
}

function guide(id: string, environment: Environment): RemissionGuide {
  return {
    id, environment, sriEnvironment: environment, establishment: "001", emissionPoint: "001", sourceSaleId: "sale",
    clientId: "client", userId: "user", createdAt: "2026-08-30T12:00:00.000Z", sequence: "000000001",
    accessKey: "", status: "AUTORIZADA", transporterName: "T", transporterIdentification: "1712345678",
    transporterIdentificationType: "05", plate: "ABC123", startAddress: "A", endAddress: "B", route: "A-B",
    reason: "Entrega", startDate: "2026-08-30", endDate: "2026-08-30", items: [],
  };
}

describe("aislamiento documental por ambiente SRI", () => {
  it("normaliza metadata y recupera el ambiente desde la clave de acceso", () => {
    expect(documentEnvironment({ sriEnvironment: "PRUEBAS" })).toBe("1");
    expect(documentEnvironment({ sriEnvironment: "PRODUCCIÓN" })).toBe("2");
    const accessKey = `${"0".repeat(23)}2${"0".repeat(25)}`;
    expect(documentEnvironment({ accessKey })).toBe("2");
  });

  it("no oculta registros legacy cuyo ambiente no puede reconstruirse", () => {
    const legacy = { ...sale("legacy", "1"), environment: undefined, sriEnvironment: undefined, accessKey: "" };
    expect(saleInActiveScope(legacy, data("2"))).toBe(true);
  });

  it("muestra ventas y guias solo del ambiente y alcance activos", () => {
    const snapshot = data("1");
    expect(saleInActiveScope(sale("test", "1"), snapshot)).toBe(true);
    expect(saleInActiveScope(sale("production", "2"), snapshot)).toBe(false);
    expect(saleInActiveScope(sale("other-scope", "1", "002"), snapshot)).toBe(false);
    expect(guideInActiveScope(guide("test-guide", "1"), snapshot)).toBe(true);
    expect(guideInActiveScope(guide("production-guide", "2"), snapshot)).toBe(false);
  });

  it("separa reportes aun al consultar todos los establecimientos", () => {
    const snapshot = data("2");
    snapshot.sales = [sale("test", "1"), sale("production", "2"), sale("production-other", "2", "002")];
    expect(scopedReportData(snapshot, "all").sales.map((item) => item.id)).toEqual(["production", "production-other"]);
    expect(scopedReportData(snapshot, "001-001").sales.map((item) => item.id)).toEqual(["production"]);
  });
});
