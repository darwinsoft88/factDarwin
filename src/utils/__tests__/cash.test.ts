import { initialData } from "../../database";
import { CreditPayment, Sale } from "../../types";
import { buildCashClosingSummary } from "../cash";

describe("cash closing", () => {
  it("does not count voided credit payments", () => {
    const activePayment: CreditPayment = {
      id: "pay-active",
      saleId: "sale-1",
      clientId: "c-final",
      userId: "u-admin",
      userName: "DARWIN",
      amount: 25,
      paymentMethod: "01",
      createdAt: "2026-06-05T10:00:00.000Z"
    };
    const voidedPayment: CreditPayment = {
      ...activePayment,
      id: "pay-voided",
      amount: 40,
      voidedAt: "2026-06-05T11:00:00.000Z"
    };

    const summary = buildCashClosingSummary({
      ...initialData,
      sales: [sale({ id: "sale-1", status: "ANULADA", total: 0 })],
      creditPayments: [activePayment, voidedPayment]
    }, "2026-06-05");

    expect(summary.total).toBe(0);
    expect(summary.collectedTotal).toBe(25);
    expect(summary.documentCount).toBe(1);
    expect(summary.byPayment["01"]).toBe(25);
  });

  it("separates generated credit from collected cash", () => {
    const creditSale = sale({
      id: "sale-credit",
      total: 100,
      paymentCondition: "credito",
      paymentMethod: "20"
    });
    const cashSale = sale({
      id: "sale-cash",
      total: 30,
      paymentCondition: "contado",
      paymentMethod: "01"
    });
    const creditPayment: CreditPayment = {
      id: "pay-credit",
      saleId: "sale-credit",
      clientId: "c-final",
      userId: "u-admin",
      userName: "DARWIN",
      amount: 40,
      paymentMethod: "01",
      createdAt: "2026-06-05T12:00:00.000Z"
    };

    const summary = buildCashClosingSummary({
      ...initialData,
      sales: [creditSale, cashSale],
      creditPayments: [creditPayment]
    }, "2026-06-05");

    expect(summary.total).toBe(130);
    expect(summary.creditGenerated).toBe(100);
    expect(summary.creditCollected).toBe(40);
    expect(summary.byPayment.CREDITO).toBeUndefined();
    expect(summary.byPayment["01"]).toBe(70);
    expect(summary.cashExpected).toBe(70);
  });

  it("counts credit payments in the establishment where the payment was collected", () => {
    const creditSale = sale({
      id: "sale-origin-001",
      establishment: "001",
      emissionPoint: "001",
      total: 80,
      paymentCondition: "credito",
      paymentMethod: "20"
    });
    const creditPayment: CreditPayment = {
      id: "pay-collected-002",
      saleId: creditSale.id,
      clientId: "c-final",
      establishment: "002",
      emissionPoint: "010",
      establishmentName: "Sucursal 2",
      userId: "u-admin",
      userName: "DARWIN",
      amount: 80,
      paymentMethod: "01",
      createdAt: "2026-06-05T12:00:00.000Z"
    };

    const summary = buildCashClosingSummary({
      ...initialData,
      issuer: {
        ...initialData.issuer,
        establishment: "002",
        emissionPoint: "010",
        activeEstablishmentId: "002-010",
        establishments: [
          { id: "001-001", name: "Matriz", establishment: "001", emissionPoint: "001", address: "A", sequential: 1, active: true },
          { id: "002-010", name: "Sucursal 2", establishment: "002", emissionPoint: "010", address: "B", sequential: 1, active: true }
        ]
      },
      sales: [creditSale],
      creditPayments: [creditPayment]
    }, "2026-06-05");

    expect(summary.total).toBe(0);
    expect(summary.creditGenerated).toBe(0);
    expect(summary.creditCollected).toBe(80);
    expect(summary.collectedTotal).toBe(80);
    expect(summary.byPayment["01"]).toBe(80);
  });
});

function sale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: "sale-1",
    clientId: "c-final",
    userId: "u-admin",
    createdAt: "2026-06-05T09:00:00.000Z",
    sequence: "000000001",
    accessKey: "",
    items: [{ productId: "p-1", code: "P1", name: "Producto", quantity: 1, unitPrice: 1, discount: 0, ivaRate: 0 }],
    subtotal: Number(overrides.total ?? 1),
    tax: 0,
    total: Number(overrides.total ?? 1),
    paymentMethod: "01",
    paymentCondition: "contado",
    status: "AUTORIZADA",
    ...overrides
  };
}
