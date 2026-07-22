import { initialData } from "../../database";
import { AppData, CreditPayment, Sale } from "../../types";
import {
  CreditPaymentOperationError,
  createCreditOperationId,
  creditBalance,
  creditClientSummaries,
  reconcileCreditBalances,
  registerCreditPayment,
  registerCreditPayments,
  voidCreditPayment
} from "../credit";

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

function dataWith(sales: Sale[] = [creditSale], creditPayments: CreditPayment[] = []): AppData {
  return { ...initialData, sales, creditPayments, creditAdjustments: [], auditLogs: [] };
}

function individual(data = dataWith(), overrides: Partial<Parameters<typeof registerCreditPayment>[0]> = {}) {
  return registerCreditPayment({
    amount: 40,
    data,
    operationId: "payment-operation-1",
    paymentMethod: "01",
    saleId: creditSale.id,
    user,
    ...overrides
  });
}

function secondSale(overrides: Partial<Sale> = {}): Sale {
  return {
    ...creditSale,
    id: "sale-credit-2",
    sequence: "000000002",
    total: 35,
    creditBalance: 35,
    creditDueDate: "2026-06-20",
    ...overrides
  };
}

describe("credit payments", () => {
  it("registers a payment with a deterministic id and reconciles the balance", () => {
    const nextData = individual();

    expect(nextData.creditPayments[0]).toMatchObject({
      id: "credit-payment:payment-operation-1",
      operationId: "payment-operation-1",
      amount: 40
    });
    expect(creditBalance(nextData.sales[0]!)).toBe(75);
    expect(nextData.sales[0]!.creditStatus).toBe("pendiente");
  });

  it("repeats the same individual operation as a no-op", () => {
    const first = individual();
    const repeated = individual(first, { note: "   " });

    expect(repeated.creditPayments).toHaveLength(1);
    expect(repeated.auditLogs).toHaveLength(first.auditLogs.length);
    expect(repeated.sales[0]!.creditBalance).toBe(75);
  });

  it("rejects the same individual operation with a different amount", () => {
    const first = individual();
    expect(() => individual(first, { amount: 41 })).toThrow(expect.objectContaining({
      code: "CREDIT_PAYMENT_OPERATION_MISMATCH"
    }));
  });

  it("rejects the same individual operation for another sale", () => {
    const another = secondSale();
    const first = individual(dataWith([creditSale, another]));
    expect(() => individual(first, { saleId: another.id })).toThrow(expect.objectContaining({
      code: "CREDIT_PAYMENT_OPERATION_MISMATCH"
    }));
  });

  it("rejects the same individual operation from another user", () => {
    const first = individual();
    expect(() => individual(first, { user: { ...user, id: "another-user", name: "Otro usuario" } })).toThrow(expect.objectContaining({
      code: "CREDIT_PAYMENT_OPERATION_MISMATCH"
    }));
  });

  it("accepts the same amount with a different operation id", () => {
    const first = individual();
    const second = individual(first, { operationId: "payment-operation-2" });
    expect(second.creditPayments).toHaveLength(2);
    expect(second.sales[0]!.creditBalance).toBe(35);
  });

  it("recognizes a replay after the operation left the balance at zero", () => {
    const paid = individual(dataWith(), { amount: 115 });
    const repeated = individual(paid, { amount: 115 });
    expect(repeated.creditPayments).toHaveLength(1);
    expect(repeated.sales[0]!.creditBalance).toBe(0);
  });

  it("blocks payments greater than the pending balance", () => {
    expect(() => individual(dataWith(), { amount: 116 })).toThrow("El abono no puede superar");
  });

  it("groups pending credit by client", () => {
    const summaries = creditClientSummaries(dataWith([creditSale, secondSale()]));
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ pendingCount: 2, pendingTotal: 150 });
  });

  it("distributes a batch by due date and uses deterministic ids", () => {
    const older = { ...creditSale, id: "sale-old", creditDueDate: "2026-06-10" };
    const newer = secondSale();
    const result = registerCreditPayments({
      amount: 130,
      batchId: "batch-1",
      batchOperationId: "batch-operation-1",
      data: dataWith([newer, older]),
      paymentMethod: "01",
      saleIds: [newer.id, older.id],
      user
    });

    expect(result.payments.map((payment) => payment.amount)).toEqual([115, 15]);
    expect(result.payments.map((payment) => payment.id)).toEqual([
      "credit-payment:batch-operation-1:sale-old",
      "credit-payment:batch-operation-1:sale-credit-2"
    ]);
    expect(result.payments.every((payment) => payment.batchSize === 2)).toBe(true);
    expect(result.nextData.sales.find((sale) => sale.id === older.id)!.creditBalance).toBe(0);
    expect(result.nextData.sales.find((sale) => sale.id === newer.id)!.creditBalance).toBe(20);
  });

  it("repeats a complete batch as a no-op", () => {
    const sales = [creditSale, secondSale()];
    const args = {
      batchId: "batch-1",
      batchOperationId: "batch-operation-1",
      paymentMethod: "01" as const,
      saleIds: sales.map((sale) => sale.id),
      user
    };
    const first = registerCreditPayments({ ...args, data: dataWith(sales) });
    const repeated = registerCreditPayments({ ...args, data: first.nextData });
    expect(repeated.nextData.creditPayments).toHaveLength(2);
    expect(repeated.nextData.auditLogs).toHaveLength(first.nextData.auditLogs.length);
  });

  it("rejects a batch id reused for different sales", () => {
    const sales = [creditSale, secondSale()];
    const first = registerCreditPayments({
      batchId: "batch-1",
      batchOperationId: "batch-operation-1",
      data: dataWith(sales),
      paymentMethod: "01",
      saleIds: [creditSale.id],
      user
    });
    expect(() => registerCreditPayments({
      batchId: "batch-1",
      batchOperationId: "batch-operation-2",
      data: first.nextData,
      paymentMethod: "01",
      saleIds: [sales[1]!.id],
      user
    })).toThrow(expect.objectContaining({ code: "CREDIT_PAYMENT_BATCH_MISMATCH" }));
  });

  it("rejects a repeated batch with a different total", () => {
    const first = registerCreditPayments({
      amount: 40,
      batchId: "batch-1",
      batchOperationId: "batch-operation-1",
      data: dataWith(),
      paymentMethod: "01",
      saleIds: [creditSale.id],
      user
    });
    expect(() => registerCreditPayments({
      amount: 41,
      batchId: "batch-1",
      batchOperationId: "batch-operation-1",
      data: first.nextData,
      paymentMethod: "01",
      saleIds: [creditSale.id],
      user
    })).toThrow(expect.objectContaining({ code: "CREDIT_PAYMENT_BATCH_MISMATCH" }));
  });

  it("blocks a partially persisted batch", () => {
    const partial: CreditPayment = {
      id: "credit-payment:batch-operation-1:sale-credit",
      operationId: "batch-operation-1:sale-credit",
      batchId: "batch-1",
      batchOperationId: "batch-operation-1",
      batchSize: 2,
      saleId: creditSale.id,
      clientId: creditSale.clientId,
      userId: user.id,
      userName: user.name,
      amount: 40,
      paymentMethod: "01",
      createdAt: "2026-06-05T00:00:00.000Z"
    };
    expect(() => registerCreditPayments({
      batchId: "batch-1",
      batchOperationId: "batch-operation-1",
      data: dataWith([creditSale, secondSale()], [partial]),
      paymentMethod: "01",
      saleIds: [creditSale.id, "sale-credit-2"],
      user
    })).toThrow(expect.objectContaining({ code: "CREDIT_PAYMENT_BATCH_PARTIAL" }));
  });

  it("voids once and treats a second void as a no-op", () => {
    const paid = individual();
    const payment = paid.creditPayments[0]!;
    const voidOperationId = "payment-void-operation:void-1";
    const first = voidCreditPayment({ data: paid, paymentId: payment.id, user, voidOperationId });
    const repeated = voidCreditPayment({ data: first, paymentId: payment.id, user, voidOperationId });

    expect(first.creditPayments[0]!.voidOperationId).toBe(voidOperationId);
    expect(repeated.creditPayments[0]!.voidedAt).toBe(first.creditPayments[0]!.voidedAt);
    expect(repeated.auditLogs).toHaveLength(first.auditLogs.length);
    expect(repeated.sales[0]!.creditBalance).toBe(115);
  });

  it("reconciles a void without exceeding original credit after initial payments", () => {
    const sale = {
      ...creditSale,
      payments: [{ id: "initial", paymentMethod: "01" as const, amount: 20 }]
    };
    const paid = individual(dataWith([sale]));
    const voided = voidCreditPayment({ data: paid, paymentId: paid.creditPayments[0]!.id, user, voidOperationId: "payment-void-operation:initial-payment" });
    expect(voided.sales[0]!.creditBalance).toBe(95);
  });

  it("reconciles payments together with an applied credit-note adjustment", () => {
    const data: AppData = {
      ...dataWith(),
      creditAdjustments: [{
        id: "credit-adjustment:note-1",
        operationId: "credit-note-account-adjustment:note-1",
        type: "CREDIT_NOTE",
        sourceCreditNoteId: "note-1",
        sourceSaleId: creditSale.id,
        clientId: creditSale.clientId,
        amount: 25,
        state: "APPLIED",
        appliedAt: "2026-06-05T00:00:00.000Z",
        userId: user.id
      }]
    };
    const paid = individual(data);
    expect(paid.sales[0]!.creditBalance).toBe(50);
  });

  it("keeps legacy payments without inventing operation identifiers", () => {
    const legacy: CreditPayment = {
      id: "legacy-payment",
      saleId: creditSale.id,
      clientId: creditSale.clientId,
      userId: user.id,
      userName: user.name,
      amount: 15,
      paymentMethod: "01",
      createdAt: "2026-06-05T00:00:00.000Z"
    };
    const reconciled = reconcileCreditBalances(dataWith([creditSale], [legacy]));
    expect(reconciled.sales[0]!.creditBalance).toBe(100);
    expect(reconciled.creditPayments[0]!.operationId).toBeUndefined();
  });

  it("loads and voids a legacy payment without new fields", () => {
    const legacy: CreditPayment = {
      id: "legacy-payment",
      saleId: creditSale.id,
      clientId: creditSale.clientId,
      userId: user.id,
      userName: user.name,
      amount: 15,
      paymentMethod: "01",
      createdAt: "2026-06-05T00:00:00.000Z"
    };
    const voided = voidCreditPayment({
      data: dataWith([creditSale], [legacy]),
      paymentId: legacy.id,
      user,
      voidOperationId: "payment-void-operation:legacy-payment"
    });
    expect(voided.creditPayments[0]!.voidOperationId).toBe("payment-void-operation:legacy-payment");
    expect(voided.creditPayments[0]!.operationId).toBeUndefined();
    expect(voided.sales[0]!.creditBalance).toBe(115);
  });

  it("keeps the reconciled balance non-negative", () => {
    const legacy: CreditPayment = {
      id: "legacy-overpayment",
      saleId: creditSale.id,
      clientId: creditSale.clientId,
      userId: user.id,
      userName: user.name,
      amount: 200,
      paymentMethod: "01",
      createdAt: "2026-06-05T00:00:00.000Z"
    };
    expect(reconcileCreditBalances(dataWith([creditSale], [legacy])).sales[0]!.creditBalance).toBe(0);
  });

  it("exposes typed operation context", () => {
    try {
      individual(dataWith(), { operationId: " " });
      throw new Error("Expected operation validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(CreditPaymentOperationError);
      expect(error).toMatchObject({ code: "CREDIT_PAYMENT_INVALID_OPERATION_ID", operationId: " " });
    }
  });

  it("rejects invalid operation identities without trimming them", () => {
    expect(() => individual(dataWith(), { operationId: " payment-operation-1" })).toThrow(expect.objectContaining({
      code: "CREDIT_PAYMENT_INVALID_OPERATION_ID"
    }));
    expect(() => individual(dataWith(), { operationId: "x".repeat(201) })).toThrow(expect.objectContaining({
      code: "CREDIT_PAYMENT_INVALID_OPERATION_ID"
    }));
  });

  it("creates prefixed operation identities no longer than 200 characters", () => {
    for (const kind of ["payment", "void", "batch"] as const) {
      const operationId = createCreditOperationId(kind);
      expect(operationId.length).toBeLessThanOrEqual(200);
      expect(operationId).toBe(operationId.trim());
    }
  });

  it("rejects a repeated void with different material data", () => {
    const paid = individual();
    const payment = paid.creditPayments[0]!;
    const voidOperationId = "payment-void-operation:void-conflict";
    const first = voidCreditPayment({ data: paid, paymentId: payment.id, reason: "Motivo original", user, voidOperationId });
    expect(() => voidCreditPayment({
      data: first,
      paymentId: payment.id,
      reason: "Motivo diferente",
      user,
      voidOperationId
    })).toThrow(expect.objectContaining({ code: "CREDIT_PAYMENT_VOID_OPERATION_MISMATCH" }));
  });

  it("requires a durable void operation identity", () => {
    const paid = individual();
    expect(() => voidCreditPayment({
      data: paid,
      paymentId: paid.creditPayments[0]!.id,
      user,
      voidOperationId: " "
    })).toThrow(expect.objectContaining({ code: "CREDIT_PAYMENT_INVALID_VOID_OPERATION_ID" }));
  });
});
