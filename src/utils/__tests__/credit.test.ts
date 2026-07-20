import { initialData } from "../../database";
import { Sale } from "../../types";
import { creditBalance, creditClientSummaries, registerCreditPayment, registerCreditPayments, voidCreditPayment } from "../credit";

const user = initialData.users[0]!;

const creditSale: Sale = {
  id: "sale-credit",
  clientId: "c-final",
  userId: "u-admin",
  createdAt: "2026-06-04T12:00:00.000Z",
  sequence: "000000001",
  accessKey: "access-key",
  subtotal: 100,
  tax: 15,
  total: 115,
  paymentMethod: "20",
  paymentCondition: "credito",
  creditBalance: 115,
  creditStatus: "pendiente",
  status: "AUTORIZADA",
  documentType: "factura",
  items: []
};

describe("credit payments", () => {
  it("registers a partial payment and reduces credit balance", () => {
    const nextData = registerCreditPayment({
      amount: 40,
      data: { ...initialData, sales: [creditSale], creditPayments: [] },
      paymentMethod: "01",
      saleId: creditSale.id,
      user
    });

    const updatedSale = nextData.sales[0]!;
    expect(nextData.creditPayments).toHaveLength(1);
    expect(creditBalance(updatedSale)).toBe(75);
    expect(updatedSale.creditStatus).toBe("pendiente");
  });

  it("marks credit as paid when balance reaches zero", () => {
    const nextData = registerCreditPayment({
      amount: 115,
      data: { ...initialData, sales: [creditSale], creditPayments: [] },
      paymentMethod: "01",
      saleId: creditSale.id,
      user
    });

    expect(nextData.sales[0]!.creditBalance).toBe(0);
    expect(nextData.sales[0]!.creditStatus).toBe("pagado");
  });

  it("blocks payments greater than pending balance", () => {
    expect(() => registerCreditPayment({
      amount: 116,
      data: { ...initialData, sales: [creditSale], creditPayments: [] },
      paymentMethod: "01",
      saleId: creditSale.id,
      user
    })).toThrow("El abono no puede superar");
  });

  it("groups pending credit by client", () => {
    const secondCredit = {
      ...creditSale,
      id: "sale-credit-2",
      sequence: "000000002",
      creditBalance: 35,
      total: 35,
      creditDueDate: "2026-06-20"
    };

    const summaries = creditClientSummaries({
      ...initialData,
      sales: [creditSale, secondCredit],
      creditPayments: []
    });

    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.pendingCount).toBe(2);
    expect(summaries[0]!.pendingTotal).toBe(150);
  });

  it("registers full payments for multiple selected invoices", () => {
    const secondCredit = {
      ...creditSale,
      id: "sale-credit-2",
      sequence: "000000002",
      creditBalance: 35,
      total: 35
    };

    const { nextData, payments, sales } = registerCreditPayments({
      data: { ...initialData, sales: [creditSale, secondCredit], creditPayments: [] },
      paymentMethod: "01",
      saleIds: [creditSale.id, secondCredit.id],
      user
    });

    expect(payments).toHaveLength(2);
    expect(sales.every((sale) => sale.creditStatus === "pagado")).toBe(true);
    expect(nextData.creditPayments.reduce((sum, payment) => sum + payment.amount, 0)).toBe(150);
  });

  it("distributes a partial bulk payment across selected invoices by due date", () => {
    const firstCredit = {
      ...creditSale,
      id: "sale-credit-old",
      sequence: "000000001",
      creditBalance: 115,
      total: 115,
      creditDueDate: "2026-06-10"
    };
    const secondCredit = {
      ...creditSale,
      id: "sale-credit-new",
      sequence: "000000002",
      creditBalance: 35,
      total: 35,
      creditDueDate: "2026-06-20"
    };

    const { nextData, payments } = registerCreditPayments({
      amount: 130,
      data: { ...initialData, sales: [secondCredit, firstCredit], creditPayments: [] },
      paymentMethod: "01",
      saleIds: [secondCredit.id, firstCredit.id],
      user
    });

    const oldSale = nextData.sales.find((sale) => sale.id === firstCredit.id)!;
    const newSale = nextData.sales.find((sale) => sale.id === secondCredit.id)!;
    expect(payments).toHaveLength(2);
    expect(payments.map((payment) => payment.amount)).toEqual([115, 15]);
    expect(creditBalance(oldSale)).toBe(0);
    expect(creditBalance(newSale)).toBe(20);
    expect(oldSale.creditStatus).toBe("pagado");
    expect(newSale.creditStatus).toBe("pendiente");
  });

  it("voids a payment and restores invoice balance", () => {
    const paidData = registerCreditPayment({
      amount: 40,
      data: { ...initialData, sales: [creditSale], creditPayments: [] },
      paymentMethod: "01",
      saleId: creditSale.id,
      user
    });
    const payment = paidData.creditPayments[0]!;
    const voidedData = voidCreditPayment({
      data: paidData,
      paymentId: payment.id,
      user
    });

    expect(voidedData.creditPayments[0]!.voidedAt).toBeTruthy();
    expect(creditBalance(voidedData.sales[0]!)).toBe(115);
    expect(voidedData.sales[0]!.creditStatus).toBe("pendiente");
  });
});
