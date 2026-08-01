jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: jest.fn(
    async (_algorithm: string, value: string) => `hash:${value}`,
  ),
}));

import type {
  Client,
  CreditAdjustment,
  CreditPayment,
  Sale,
} from "../../../types";
import {
  CreditLedgerRepository,
} from "../CreditLedgerRepository";
import {
  hashCreditAdjustment,
  hashCreditPayment,
} from "../creditLedgerRecord";
import { creditLedgerReceiptsCoherent } from
  "../creditLedgerMirrorCoordinator";
import type {
  SQLiteBindValue,
  SQLiteConnection,
  SQLiteRunResult,
} from "../types";

type Row = Record<string, SQLiteBindValue>;

const paymentColumns = [
  "tenant_id", "id", "source_index", "operation_id", "batch_id",
  "batch_operation_id", "batch_size", "void_operation_id", "sale_id",
  "client_id", "establishment", "emission_point", "establishment_name",
  "user_id", "user_name", "amount_micros", "payment_method", "note",
  "payment_date", "voided_at", "voided_by_user_id", "voided_by_user_name",
  "void_reason", "compatibility_json", "record_hash",
];

const adjustmentColumns = [
  "tenant_id", "id", "source_index", "operation_id",
  "reverse_operation_id", "adjustment_type", "credit_note_id", "sale_id",
  "client_id", "amount_micros", "status", "applied_at", "reversed_at",
  "user_id", "reason", "compatibility_json", "record_hash",
];

class LedgerDatabase implements SQLiteConnection {
  payments: Row[] = [];
  adjustments: Row[] = [];
  receipts: SQLiteBindValue[][] = [];
  corruptPaymentHash = false;

  async execAsync(): Promise<void> {}

  async runAsync(
    source: string,
    ...params: SQLiteBindValue[]
  ): Promise<SQLiteRunResult> {
    if (source.startsWith("DELETE FROM credit_payments")) {
      const tenant = String(params[0]);
      this.payments = this.payments.filter(({ tenant_id }) =>
        tenant_id !== tenant
      );
    } else if (source.startsWith("DELETE FROM credit_adjustments")) {
      const tenant = String(params[0]);
      this.adjustments = this.adjustments.filter(({ tenant_id }) =>
        tenant_id !== tenant
      );
    } else if (source.includes("INSERT INTO credit_payments")) {
      this.payments.push(Object.fromEntries(
        paymentColumns.map((column, index) => [
          column,
          params[index] ?? null,
        ]),
      ));
    } else if (source.includes("INSERT INTO credit_adjustments")) {
      this.adjustments.push(Object.fromEntries(
        adjustmentColumns.map((column, index) => [
          column,
          params[index] ?? null,
        ]),
      ));
    } else if (source.includes("catalog_validation_receipts")) {
      this.receipts.push(params);
    }
    return { changes: 1, lastInsertRowId: 0 };
  }

  async getFirstAsync<T>(): Promise<T | null> {
    return null;
  }

  async getAllAsync<T>(
    source: string,
    ...params: SQLiteBindValue[]
  ): Promise<T[]> {
    const tenant = String(params[0]);
    const values = source.includes("credit_payments")
      ? this.payments
      : this.adjustments;
    return values
      .filter(({ tenant_id }) => tenant_id === tenant)
      .sort((left, right) =>
        Number(left.source_index) - Number(right.source_index)
      )
      .map((row) => this.corruptPaymentHash &&
          source.includes("credit_payments")
        ? { ...row, record_hash: "corrupt" }
        : { ...row }) as T[];
  }

  async withExclusiveTransactionAsync(
    task: (transaction: SQLiteConnection) => Promise<void>,
  ): Promise<void> {
    const payments = this.payments.map((row) => ({ ...row }));
    const adjustments = this.adjustments.map((row) => ({ ...row }));
    const receipts = this.receipts.map((row) => [...row]);
    try {
      await task(this);
    } catch (error) {
      this.payments = payments;
      this.adjustments = adjustments;
      this.receipts = receipts;
      throw error;
    }
  }

  async closeAsync(): Promise<void> {}
}

const client = {
  id: "client-1",
  identificationType: "05",
  identification: "1723772099",
  name: "Cliente",
  email: "",
  phone: "",
  address: "",
  updatedAt: "",
} as Client;

const creditSale = {
  id: "sale-1",
  documentType: "factura",
  clientId: client.id,
  userId: "user-1",
  createdAt: "2026-07-01T10:00:00.000Z",
  sequence: "1",
  accessKey: "",
  subtotal: 100,
  tax: 0,
  total: 100,
  paymentMethod: "20",
  paymentCondition: "credito",
  payments: [{ id: "initial", paymentMethod: "01", amount: 20 }],
  creditBalance: 40,
  creditStatus: "pendiente",
  status: "AUTORIZADA",
  items: [],
} as Sale;

const creditNote = {
  ...creditSale,
  id: "note-1",
  documentType: "nota_credito",
  sourceSaleId: creditSale.id,
  paymentCondition: "contado",
  payments: [],
  total: 10,
  creditBalance: 0,
} as Sale;

const payment = {
  id: "payment-1",
  operationId: "operation-1",
  saleId: creditSale.id,
  clientId: client.id,
  userId: "user-1",
  userName: "Usuario",
  amount: 30,
  paymentMethod: "01",
  createdAt: "2026-07-02T10:00:00.000Z",
} as CreditPayment;

const adjustment = {
  id: "adjustment-1",
  operationId: "adjustment-operation-1",
  type: "CREDIT_NOTE",
  sourceCreditNoteId: creditNote.id,
  sourceSaleId: creditSale.id,
  clientId: client.id,
  amount: 10,
  state: "APPLIED",
  appliedAt: "2026-07-03T10:00:00.000Z",
  userId: "user-1",
} as CreditAdjustment;

const receipt = {
  snapshotGeneration: "generation-1",
  creditPaymentsHash: "payments-hash",
  creditAdjustmentsHash: "adjustments-hash",
  schemaVersion: 8,
  confirmCanonical: async () => true,
};

describe("CreditLedgerRepository", () => {
  it("rechaza recibos de generaciones diferentes", () => {
    const source = {
      companyId: "tenant-1",
      snapshotGeneration: "generation-2",
      catalogHashes: {
        creditPayments: "payments-hash",
        creditAdjustments: "adjustments-hash",
      },
      creditPayments: [payment],
      creditAdjustments: [adjustment],
    };
    const baseReceipt = {
      tenantId: "tenant-1",
      status: "validated",
      schemaVersion: 8,
      snapshotGeneration: "generation-2",
      rowCount: 1,
      sourceHash: "payments-hash",
    } as const;
    expect(creditLedgerReceiptsCoherent(
      "tenant-1",
      source as never,
      baseReceipt as never,
      {
        ...baseReceipt,
        catalogType: "credit_adjustments",
        sourceHash: "adjustments-hash",
        snapshotGeneration: "generation-1",
      } as never,
    )).toBe(false);
  });

  it("migra pagos y ajustes juntos con importes escalados y saldos iguales", async () => {
    const database = new LedgerDatabase();
    const result = await new CreditLedgerRepository({
      database,
      tenantId: "tenant-1",
    }).migrateMirror(
      [payment], [adjustment], [creditSale, creditNote], [client], receipt,
    );
    expect(result.equal).toBe(true);
    expect(result.paymentMetrics.grossMicros).toBe(30_000_000);
    expect(result.paymentMetrics.validMicros).toBe(30_000_000);
    expect(result.adjustmentMetrics.appliedMicros).toBe(10_000_000);
    expect(result.adjustmentMetrics.effectiveMicros).toBe(10_000_000);
    expect(result.balanceMetrics.inconsistentBalanceCount).toBe(0);
    expect(database.payments[0]?.amount_micros).toBe(30_000_000);
    expect(database.adjustments[0]?.amount_micros).toBe(10_000_000);
    expect(database.receipts).toHaveLength(2);
  });

  it("reconstruye pagos y ajustes sin alterar importes ni campos modelados", async () => {
    const database = new LedgerDatabase();
    const repository = new CreditLedgerRepository({
      database,
      tenantId: "tenant-1",
    });
    await repository.migrateMirror(
      [payment], [adjustment], [creditSale, creditNote], [client], receipt,
    );
    await expect(repository.listPayments()).resolves.toEqual([payment]);
    await expect(repository.listAdjustments()).resolves.toEqual([adjustment]);
  });

  it("cambia hashes al anular un pago o revertir un ajuste", async () => {
    await expect(hashCreditPayment({
      ...payment,
      voidedAt: "2026-07-04T10:00:00.000Z",
      voidOperationId: "void-1",
    })).resolves.not.toBe(await hashCreditPayment(payment));
    await expect(hashCreditAdjustment({
      ...adjustment,
      state: "REVERSED",
      reversedAt: "2026-07-04T10:00:00.000Z",
      reverseOperationId: "reverse-1",
    })).resolves.not.toBe(await hashCreditAdjustment(adjustment));
  });

  it("separa pagos anulados y ajustes revertidos del efecto contable", async () => {
    const database = new LedgerDatabase();
    const voidedPayment = {
      ...payment,
      voidedAt: "2026-07-04T10:00:00.000Z",
      voidOperationId: "void-1",
      voidedByUserId: "user-1",
      voidedByUserName: "Usuario",
      voidReason: "Corrección",
    };
    const reversedAdjustment = {
      ...adjustment,
      state: "REVERSED",
      reversedAt: "2026-07-04T10:00:00.000Z",
      reverseOperationId: "reverse-1",
    } as CreditAdjustment;
    const sale = { ...creditSale, creditBalance: 80 };
    const result = await new CreditLedgerRepository({
      database,
      tenantId: "tenant-1",
    }).migrateMirror(
      [voidedPayment],
      [reversedAdjustment],
      [sale, creditNote],
      [client],
      receipt,
    );
    expect(result.paymentMetrics.validMicros).toBe(0);
    expect(result.paymentMetrics.voidedMicros).toBe(30_000_000);
    expect(result.adjustmentMetrics.reversedMicros).toBe(10_000_000);
    expect(result.adjustmentMetrics.effectiveMicros).toBe(0);
  });

  it("valida un lote completo con miembros y operaciones diferentes", async () => {
    const database = new LedgerDatabase();
    const secondSale = {
      ...creditSale,
      id: "sale-2",
      payments: [],
      total: 50,
      creditBalance: 30,
    };
    const batchPayments = [{
      ...payment,
      batchId: "batch-1",
      batchOperationId: "batch-operation-1",
      batchSize: 2,
    }, {
      ...payment,
      id: "payment-2",
      operationId: "operation-2",
      batchId: "batch-1",
      batchOperationId: "batch-operation-1",
      batchSize: 2,
      saleId: secondSale.id,
      amount: 20,
    }];
    const result = await new CreditLedgerRepository({
      database,
      tenantId: "tenant-1",
    }).migrateMirror(
      batchPayments,
      [adjustment],
      [creditSale, secondSale, creditNote],
      [client],
      receipt,
    );
    expect(result.paymentMetrics.completeBatchCount).toBe(1);
    expect(result.paymentMetrics.partialBatchCount).toBe(0);
  });

  it("conserva legacy sin operationId y clasifica UNKNOWN sin aplicarlo", async () => {
    const database = new LedgerDatabase();
    const legacyPayment = {
      ...payment,
      id: "legacy-payment",
      operationId: undefined,
    };
    const unknownAdjustment = {
      ...adjustment,
      id: "legacy-adjustment",
      operationId: undefined,
      state: "UNKNOWN",
    } as CreditAdjustment;
    const sale = { ...creditSale, creditBalance: 50 };
    const result = await new CreditLedgerRepository({
      database,
      tenantId: "tenant-1",
    }).migrateMirror(
      [legacyPayment], [unknownAdjustment], [sale, creditNote], [client],
      receipt,
    );
    expect(result.paymentMetrics.legacyWithoutOperationCount).toBe(1);
    expect(result.adjustmentMetrics.unknownCount).toBe(1);
    expect(result.adjustmentMetrics.effectiveMicros).toBe(0);
  });

  it("rechaza lotes parciales, duplicados modernos y relaciones ausentes", async () => {
    const repository = new CreditLedgerRepository({
      database: new LedgerDatabase(),
      tenantId: "tenant-1",
    });
    const invalid = {
      ...payment,
      batchId: "batch-1",
      batchOperationId: "batch-operation-1",
      batchSize: 2,
    };
    await expect(repository.migrateMirror(
      [invalid, { ...invalid, id: "payment-2" }],
      [],
      [creditSale],
      [client],
      receipt,
    )).rejects.toThrow("CREDIT_LEDGER_VALIDATION_FAILED");
    await expect(repository.migrateMirror(
      [{ ...payment, saleId: "missing" }],
      [],
      [creditSale],
      [client],
      receipt,
    )).rejects.toThrow("PAYMENT_SALE_MISSING");
    await expect(repository.migrateMirror(
      [payment],
      [{ ...adjustment, sourceCreditNoteId: "missing-note" }],
      [creditSale],
      [client],
      receipt,
    )).rejects.toThrow("ADJUSTMENT_CREDIT_NOTE_MISSING");
    await expect(repository.migrateMirror(
      [payment],
      [adjustment],
      [{ ...creditSale, creditBalance: 99 }, creditNote],
      [client],
      receipt,
    )).rejects.toThrow("CREDIT_BALANCE_MISMATCH");
  });

  it("revierte filas y recibos si falla hash o cambia la generación", async () => {
    const database = new LedgerDatabase();
    database.payments = [{ tenant_id: "tenant-1", id: "previous" }];
    database.adjustments = [{ tenant_id: "tenant-1", id: "previous" }];
    database.receipts = [["previous-receipt"]];
    database.corruptPaymentHash = true;
    const repository = new CreditLedgerRepository({
      database,
      tenantId: "tenant-1",
    });
    await expect(repository.migrateMirror(
      [payment], [adjustment], [creditSale, creditNote], [client], receipt,
    )).rejects.toThrow("PAYMENT_HASH_OR_ORDER_MISMATCH");
    expect(database.payments).toEqual([
      { tenant_id: "tenant-1", id: "previous" },
    ]);
    expect(database.adjustments).toEqual([
      { tenant_id: "tenant-1", id: "previous" },
    ]);
    expect(database.receipts).toEqual([["previous-receipt"]]);
  });

  it("aísla completamente empresas", async () => {
    const database = new LedgerDatabase();
    await new CreditLedgerRepository({
      database,
      tenantId: "tenant-1",
    }).migrateMirror(
      [payment], [adjustment], [creditSale, creditNote], [client], receipt,
    );
    await new CreditLedgerRepository({
      database,
      tenantId: "tenant-2",
    }).migrateMirror(
      [{ ...payment, id: "tenant-2-payment" }],
      [{ ...adjustment, id: "tenant-2-adjustment" }],
      [creditSale, creditNote],
      [client],
      receipt,
    );
    expect(database.payments.filter(({ tenant_id }) =>
      tenant_id === "tenant-1"
    )).toHaveLength(1);
    expect(database.payments.filter(({ tenant_id }) =>
      tenant_id === "tenant-2"
    )).toHaveLength(1);
  });
});
