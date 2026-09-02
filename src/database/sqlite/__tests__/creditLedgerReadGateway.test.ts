import type {
  Client,
  CreditAdjustment,
  CreditPayment,
  Sale,
} from "../../../types";
import {
  invalidateCreditLedgerReadContext,
  readCreditLedgerControlled,
  type CreditLedgerFallbackReason,
} from "../creditLedgerReadGateway";
import {
  calculateCreditLedgerMetrics,
  type CreditAdjustmentQuery,
  type CreditPaymentQuery,
} from "../CreditLedgerRepository";
import { sqliteCreditLedgerReadsEnabled } from "../creditLedgerReadFeature";
import type { CatalogValidationReceipt } from
  "../CatalogValidationReceiptRepository";
import type { SQLiteConnection } from "../types";

const client = { id: "client-1", name: "Cliente" } as Client;
const sale = {
  id: "sale-1",
  clientId: "client-1",
  documentType: "factura",
  paymentCondition: "credito",
  total: 100,
  payments: [],
  creditBalance: 70,
} as unknown as Sale;
const creditNote = {
  id: "note-1",
  clientId: "client-1",
  documentType: "nota_credito",
  total: 10,
  payments: [],
} as unknown as Sale;
const payment: CreditPayment = {
  id: "payment-1",
  operationId: "operation-1",
  batchId: "batch-1",
  batchOperationId: "batch-operation-1",
  batchSize: 1,
  saleId: "sale-1",
  clientId: "client-1",
  userId: "user-1",
  userName: "Usuario",
  amount: 20,
  paymentMethod: "01",
  createdAt: "2026-07-28T10:00:00.000Z",
};
const voidedPayment: CreditPayment = {
  ...payment,
  id: "payment-2",
  operationId: "operation-2",
  batchId: undefined,
  batchOperationId: undefined,
  batchSize: undefined,
  amount: 5,
  paymentMethod: "20",
  createdAt: "2026-07-29T10:00:00.000Z",
  voidedAt: "2026-07-29T11:00:00.000Z",
};
const adjustment: CreditAdjustment = {
  id: "adjustment-1",
  operationId: "adjustment-operation-1",
  type: "CREDIT_NOTE",
  sourceCreditNoteId: "note-1",
  sourceSaleId: "sale-1",
  clientId: "client-1",
  amount: 10,
  state: "APPLIED",
  appliedAt: "2026-07-28T11:00:00.000Z",
  userId: "user-1",
};
const reversedAdjustment: CreditAdjustment = {
  ...adjustment,
  id: "adjustment-2",
  operationId: "adjustment-operation-2",
  state: "REVERSED",
  reversedAt: "2026-07-29T11:00:00.000Z",
};
const unknownAdjustment: CreditAdjustment = {
  ...adjustment,
  id: "adjustment-3",
  operationId: "adjustment-operation-3",
  state: "UNKNOWN",
  appliedAt: undefined,
};

const payments = [payment, voidedPayment];
const adjustments = [
  adjustment,
  reversedAdjustment,
  unknownAdjustment,
];
const sales = [sale, creditNote];
const clients = [client];
const metrics = calculateCreditLedgerMetrics(
  payments, adjustments, sales, clients,
);

type ReceiptOverride = Partial<CatalogValidationReceipt> & {
  missing?: boolean;
};
type ReceiptOverrides = Partial<Record<
  "credit_payments" | "credit_adjustments",
  ReceiptOverride
>>;

function receipt(
  catalog: "credit_payments" | "credit_adjustments",
  overrides: ReceiptOverrides = {},
) {
  const paymentCatalog = catalog === "credit_payments";
  const override = overrides[catalog] || {};
  return {
    tenant_id: "tenant-1",
    catalog_type: catalog,
    snapshot_generation: "generation-1",
    source_hash: paymentCatalog ? "payments-hash" : "adjustments-hash",
    row_count: paymentCatalog ? payments.length : adjustments.length,
    status: "validated",
    schema_version: 12,
    validated_at: "2026-07-28T10:00:00.000Z",
    updated_at: "2026-07-28T10:00:00.000Z",
    last_error_code: null,
    last_error_detail: null,
    validation_details_json: JSON.stringify({
      ...(paymentCatalog ? metrics.payments : metrics.adjustments),
      balanceValidation: metrics.balances,
      pairedCatalog: paymentCatalog
        ? "credit_adjustments"
        : "credit_payments",
    }),
    ...(override.tenantId !== undefined
      ? { tenant_id: override.tenantId } : {}),
    ...(override.snapshotGeneration !== undefined
      ? { snapshot_generation: override.snapshotGeneration } : {}),
    ...(override.sourceHash !== undefined
      ? { source_hash: override.sourceHash } : {}),
    ...(override.rowCount !== undefined
      ? { row_count: override.rowCount } : {}),
    ...(override.status !== undefined ? { status: override.status } : {}),
    ...(override.schemaVersion !== undefined
      ? { schema_version: override.schemaVersion } : {}),
    ...(override.lastErrorCode !== undefined
      ? { last_error_code: override.lastErrorCode } : {}),
    ...(override.validationDetails !== undefined
      ? {
        validation_details_json: override.validationDetails
          ? JSON.stringify(override.validationDetails)
          : null,
      }
      : {}),
  };
}

function database(overrides: ReceiptOverrides = {}) {
  return {
    getAllAsync: jest.fn(async (sql: string) =>
      sql.includes("app_metadata")
        ? [
          { key: "tenant_id", value_json: JSON.stringify("tenant-1") },
          { key: "schema_version", value_json: JSON.stringify(12) },
          {
            key: "migration_state",
            value_json: JSON.stringify("products_validated"),
          },
          { key: "snapshot_hash", value_json: JSON.stringify("payload") },
        ]
        : []),
    getFirstAsync: jest.fn(async (_sql: string, ...args: unknown[]) => {
      const catalog = args[1] as "credit_payments" | "credit_adjustments";
      const catalogOverride = overrides[catalog];
      if (catalogOverride?.missing) {
        return null;
      }
      return receipt(catalog, overrides);
    }),
    runAsync: jest.fn(async () => ({ changes: 1, lastInsertRowId: 0 })),
  } as unknown as SQLiteConnection;
}

function descriptor(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 6,
    companyId: "tenant-1",
    issuerRuc: "1723772099001",
    snapshotGeneration: "generation-1",
    payloadHash: "payload",
    catalogHashes: {
      clients: "clients-hash",
      products: "products-hash",
      sales: "sales-hash",
      inventoryMovements: "inventory-hash",
      creditPayments: "payments-hash",
      creditAdjustments: "adjustments-hash",
    },
    createdAt: "2026-07-28T10:00:00.000Z",
    ...overrides,
  };
}

function repository(options: {
  payments?: CreditPayment[];
  adjustments?: CreditAdjustment[];
  paymentError?: Error;
  adjustmentError?: Error;
} = {}) {
  return {
    listPayments: jest.fn(async (_query?: CreditPaymentQuery) => {
      if (options.paymentError) throw options.paymentError;
      return options.payments ?? payments;
    }),
    listAdjustments: jest.fn(async (_query?: CreditAdjustmentQuery) => {
      if (options.adjustmentError) throw options.adjustmentError;
      return options.adjustments ?? adjustments;
    }),
  };
}

async function execute(options: {
  enabled?: boolean;
  platform?: string;
  tenantId?: string;
  descriptorOverride?: Record<string, unknown>;
  receiptOverrides?: ReceiptOverrides;
  reader?: ReturnType<typeof repository>;
  query?: { payments?: CreditPaymentQuery; adjustments?: CreditAdjustmentQuery };
  openError?: Error;
} = {}) {
  const db = database(options.receiptOverrides);
  const reader = options.reader ?? repository();
  const result = await readCreditLedgerControlled(
    options.tenantId ?? "tenant-1",
    payments,
    adjustments,
    sales,
    clients,
    options.query,
    {
      enabled: options.enabled ?? true,
      dependencies: {
        platform: options.platform ?? "android",
        openDatabase: async () => {
          if (options.openError) throw options.openError;
          return db;
        },
        readDescriptor: async () => descriptor(options.descriptorOverride),
        createRepository: () => reader,
      },
    },
  );
  return { result, db, reader };
}

describe("readCreditLedgerControlled", () => {
  it("activa el feature flag únicamente con el valor exacto 1", () => {
    const previous = process.env.EXPO_PUBLIC_SQLITE_CREDIT_LEDGER_READS;
    process.env.EXPO_PUBLIC_SQLITE_CREDIT_LEDGER_READS = "true";
    expect(sqliteCreditLedgerReadsEnabled()).toBe(false);
    process.env.EXPO_PUBLIC_SQLITE_CREDIT_LEDGER_READS = "1";
    expect(sqliteCreditLedgerReadsEnabled()).toBe(true);
    if (previous === undefined) {
      delete process.env.EXPO_PUBLIC_SQLITE_CREDIT_LEDGER_READS;
    } else {
      process.env.EXPO_PUBLIC_SQLITE_CREDIT_LEDGER_READS = previous;
    }
  });

  it("mantiene PWA en archivo incluso con el flag activo", async () => {
    const { result } = await execute({ platform: "web" });
    expect(result.source).toBe("file");
    expect(result.diagnostic.reason).toBe("WEB_USES_FILE");
  });

  it("mantiene el archivo cuando el flag está apagado", async () => {
    const { result } = await execute({ enabled: false });
    expect(result.source).toBe("file");
    expect(result.diagnostic.reason).toBe("FEATURE_DISABLED");
  });

  it("usa ambos catálogos SQLite después de validar toda la compuerta", async () => {
    const { result, reader } = await execute();
    expect(result.source).toBe("sqlite");
    expect(result.payments).toEqual(payments);
    expect(result.adjustments).toEqual(adjustments);
    expect(reader.listPayments).toHaveBeenCalledTimes(1);
    expect(reader.listAdjustments).toHaveBeenCalledTimes(1);
  });

  it("aplica filtros equivalentes y conserva el orden canónico", async () => {
    const { result } = await execute({
      query: {
        payments: {
          saleId: "sale-1",
          clientId: "client-1",
          operationId: "operation-1",
          batchId: "batch-1",
          batchOperationId: "batch-operation-1",
          createdFrom: "2026-07-28T00:00:00.000Z",
          createdTo: "2026-07-28T23:59:59.999Z",
          paymentMethod: "01",
          voided: false,
        },
        adjustments: {
          saleId: "sale-1",
          clientId: "client-1",
          creditNoteId: "note-1",
          operationId: "adjustment-operation-1",
          status: "APPLIED",
        },
      },
    });
    expect(result.payments.map(({ id }) => id)).toEqual(["payment-1"]);
    expect(result.adjustments.map(({ id }) => id)).toEqual(["adjustment-1"]);
  });

  it("el fallback aplica los mismos filtros sin mezclar fuentes", async () => {
    const reader = repository({ paymentError: new Error("CORRUPT") });
    const { result } = await execute({
      reader,
      query: {
        payments: { voided: true },
        adjustments: { status: "REVERSED" },
      },
    });
    expect(result.source).toBe("file");
    expect(result.payments).toEqual([voidedPayment]);
    expect(result.adjustments).toEqual([reversedAdjustment]);
    expect(result.diagnostic.reason).toBe("SQLITE_PAYMENT_READ_FAILED");
  });

  it.each([
    ["TENANT_MISSING", { tenantId: "" }],
    ["TENANT_MISMATCH", {
      descriptorOverride: { companyId: "tenant-2" },
    }],
    ["SNAPSHOT_GENERATION_MISMATCH", {
      descriptorOverride: { snapshotGeneration: "generation-2" },
    }],
    ["PAYMENT_SOURCE_HASH_MISMATCH", {
      descriptorOverride: {
        catalogHashes: {
          ...descriptor().catalogHashes,
          creditPayments: "different",
        },
      },
    }],
    ["ADJUSTMENT_SOURCE_HASH_MISMATCH", {
      descriptorOverride: {
        catalogHashes: {
          ...descriptor().catalogHashes,
          creditAdjustments: "different",
        },
      },
    }],
    ["PAYMENT_MIRROR_DIRTY", {
      receiptOverrides: { credit_payments: { status: "dirty" } },
    }],
    ["ADJUSTMENT_MIRROR_DIRTY", {
      receiptOverrides: { credit_adjustments: { status: "dirty" } },
    }],
    ["RECEIPT_GENERATION_MISMATCH", {
      receiptOverrides: {
        credit_adjustments: { snapshotGeneration: "generation-2" },
      },
    }],
  ] as Array<[CreditLedgerFallbackReason, Parameters<typeof execute>[0]]>)(
    "hace fallback seguro por %s",
    async (reason, options) => {
      const { result } = await execute(options);
      expect(result.source).toBe("file");
      expect(result.diagnostic.reason).toBe(reason);
    },
  );

  it("distingue recibos ausentes", async () => {
    const paymentMissing = await execute({
      receiptOverrides: {
        credit_payments: { missing: true },
      },
    });
    expect(paymentMissing.result.diagnostic.reason)
      .toBe("PAYMENT_RECEIPT_MISSING");
    const adjustmentMissing = await execute({
      receiptOverrides: {
        credit_adjustments: { missing: true },
      },
    });
    expect(adjustmentMissing.result.diagnostic.reason)
      .toBe("ADJUSTMENT_RECEIPT_MISSING");
  });

  it("distingue recibos no validados", async () => {
    const paymentResult = await execute({
      receiptOverrides: {
        credit_payments: { status: "other" as "validated" },
      },
    });
    expect(paymentResult.result.diagnostic.reason)
      .toBe("PAYMENT_RECEIPT_NOT_VALIDATED");
    const adjustmentResult = await execute({
      receiptOverrides: {
        credit_adjustments: { status: "other" as "validated" },
      },
    });
    expect(adjustmentResult.result.diagnostic.reason)
      .toBe("ADJUSTMENT_RECEIPT_NOT_VALIDATED");
  });

  it("marca dirty ante conteos diferentes y conserva el archivo", async () => {
    const { result, db } = await execute({
      receiptOverrides: {
        credit_payments: { rowCount: 99 },
      },
    });
    expect(result.diagnostic.reason).toBe("PAYMENT_ROW_COUNT_MISMATCH");
    await Promise.resolve();
    expect(db.runAsync).toHaveBeenCalled();
    expect(result.payments).toEqual(payments);

    const adjustmentResult = await execute({
      receiptOverrides: {
        credit_adjustments: { rowCount: 99 },
      },
    });
    expect(adjustmentResult.result.diagnostic.reason)
      .toBe("ADJUSTMENT_ROW_COUNT_MISMATCH");
  });

  it("rechaza un recibo de esquema anterior sin tocar los datos", async () => {
    const { result } = await execute({
      receiptOverrides: {
        credit_payments: { schemaVersion: 7 },
      },
    });
    expect(result.source).toBe("file");
    expect(result.diagnostic.reason).toBe("SCHEMA_NOT_READY");
    expect(result.payments).toEqual(payments);
  });

  it("rechaza agregados de pagos, ajustes y saldos diferentes", async () => {
    const paymentAggregate = await execute({
      reader: repository({
        payments: [{ ...payment, amount: 21 }, voidedPayment],
      }),
    });
    expect(paymentAggregate.result.diagnostic.reason)
      .toBe("PAYMENT_AGGREGATE_MISMATCH");

    const adjustmentAggregate = await execute({
      reader: repository({
        adjustments: [
          { ...adjustment, amount: 11 },
          reversedAdjustment,
          unknownAdjustment,
        ],
      }),
    });
    expect(adjustmentAggregate.result.diagnostic.reason)
      .toBe("ADJUSTMENT_AGGREGATE_MISMATCH");

    const balanceReceipt = await execute({
      receiptOverrides: {
        credit_payments: {
          validationDetails: {
            ...metrics.payments,
            balanceValidation: {
              ...metrics.balances,
              pendingCount: 99,
            },
          },
        },
      },
    });
    expect(balanceReceipt.result.diagnostic.reason)
      .toBe("CREDIT_BALANCE_MISMATCH");
  });

  it("distingue fallo de apertura, pagos y ajustes", async () => {
    const open = await execute({ openError: new Error("OPEN_FAILED") });
    expect(open.result.diagnostic.reason).toBe("SQLITE_OPEN_FAILED");
    const paymentRead = await execute({
      reader: repository({ paymentError: new Error("PAYMENT_FAILED") }),
    });
    expect(paymentRead.result.diagnostic.reason)
      .toBe("SQLITE_PAYMENT_READ_FAILED");
    const adjustmentRead = await execute({
      reader: repository({ adjustmentError: new Error("ADJUSTMENT_FAILED") }),
    });
    expect(adjustmentRead.result.diagnostic.reason)
      .toBe("SQLITE_ADJUSTMENT_READ_FAILED");
  });

  it("preserva pagos anulados y estados APPLIED, REVERSED y UNKNOWN", async () => {
    const { result } = await execute();
    expect(result.payments.find(({ id }) => id === "payment-2")?.voidedAt)
      .toBeTruthy();
    expect(result.adjustments.map(({ state }) => state))
      .toEqual(["APPLIED", "REVERSED", "UNKNOWN"]);
    expect(sale.creditBalance).toBe(70);
  });

  it("no contamina tenants al cambiar y regresar", async () => {
    const other = await execute({ tenantId: "tenant-2" });
    expect(other.result.source).toBe("file");
    expect(other.result.diagnostic.reason).toBe("TENANT_MISMATCH");
    const original = await execute();
    expect(original.result.source).toBe("sqlite");
    expect(original.result.payments.every(({ clientId }) =>
      clientId === "client-1"
    )).toBe(true);
  });

  it("reabre offline sin depender de red y permite invalidar el contexto", async () => {
    const first = await execute();
    invalidateCreditLedgerReadContext("tenant-1");
    const reopened = await execute();
    expect(first.result.source).toBe("sqlite");
    expect(reopened.result.source).toBe("sqlite");
    expect(reopened.result.payments).toEqual(first.result.payments);
    expect(reopened.result.adjustments).toEqual(first.result.adjustments);
  });
});
