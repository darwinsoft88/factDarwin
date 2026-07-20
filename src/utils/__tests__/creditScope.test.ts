import { AppData, Sale } from "../../types";
import { scopeCreditData } from "../creditScope";

function sale(id: string, establishment: string, emissionPoint: string): Sale {
  return {
    id,
    establishment,
    emissionPoint,
    establishmentName: `Punto ${establishment}-${emissionPoint}`,
    clientId: "client-1",
    userId: "user-1",
    createdAt: "2026-06-24T10:00:00.000Z",
    sequence: id,
    accessKey: "",
    subtotal: 10,
    tax: 1.5,
    total: 11.5,
    paymentMethod: "20",
    paymentCondition: "credito",
    creditBalance: 11.5,
    creditStatus: "pendiente",
    status: "AUTORIZADA",
    items: []
  };
}

function dataFixture(): AppData {
  return {
    users: [],
    clients: [],
    products: [],
    inventoryMovements: [],
    auditLogs: [],
    sales: [sale("sale-active", "002", "010"), sale("sale-other", "001", "001")],
    creditPayments: [
      {
        id: "pay-active",
        saleId: "sale-active",
        clientId: "client-1",
        userId: "user-1",
        userName: "Admin",
        amount: 5,
        paymentMethod: "01",
        createdAt: "2026-06-24T10:05:00.000Z"
      },
      {
        id: "pay-other",
        saleId: "sale-other",
        clientId: "client-1",
        userId: "user-1",
        userName: "Admin",
        amount: 5,
        paymentMethod: "01",
        createdAt: "2026-06-24T10:06:00.000Z"
      }
    ],
    receivedRetentions: [],
    guides: [],
    cashClosings: [],
    issuer: {
      ruc: "1723772099001",
      businessName: "DARWINSOFT",
      tradeName: "DARWINSOFT",
      logoUrl: "",
      address: "La Concordia",
      establishment: "002",
      emissionPoint: "010",
      sequential: 1,
      environment: "1",
      taxpayerType: "natural",
      accountingRequired: "NO",
      specialTaxpayer: "NO",
      specialTaxpayerResolution: ""
    },
    backendUrl: ""
  };
}

describe("credit scope", () => {
  it("keeps only active establishment sales and payments when scoped", () => {
    const scoped = scopeCreditData(dataFixture(), "active", "002-010");

    expect(scoped.sales.map((item) => item.id)).toEqual(["sale-active"]);
    expect(scoped.creditPayments.map((item) => item.id)).toEqual(["pay-active"]);
  });

  it("keeps all credit data for company scope", () => {
    const source = dataFixture();
    const scoped = scopeCreditData(source, "all", "002-010");

    expect(scoped.sales).toHaveLength(2);
    expect(scoped.creditPayments).toHaveLength(2);
  });
});
