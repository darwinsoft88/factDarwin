jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: jest.fn(
    async (_algorithm: string, value: string) => `hash:${value}`,
  ),
}));

import type { Sale } from "../../../types";
import { SalesRepository } from "../SalesRepository";
import type {
  SQLiteBindValue,
  SQLiteConnection,
  SQLiteRunResult,
} from "../types";

type Row = Record<string, SQLiteBindValue>;

const saleColumns = [
  "tenant_id", "id", "source_index", "document_type", "establishment", "emission_point",
  "establishment_name", "client_id", "user_id", "created_at", "sequence",
  "access_key", "authorization_number", "authorization_date",
  "sri_environment", "sri_message", "source_sale_id", "inventory_state",
  "inventory_operation_id", "credit_note_inventory_state",
  "credit_note_inventory_operation_id", "auto_invoice_on_sync",
  "auto_invoice_attempted_at", "auto_invoice_last_error", "converted_at",
  "converted_to_sale_id", "converted_to_sequence", "support_document_type",
  "support_document_number", "support_authorization_number",
  "support_issue_date", "credit_reason", "void_reason", "voided_at",
  "subtotal_micros", "tax_micros", "total_micros", "payment_method",
  "payment_condition", "credit_due_date", "credit_balance_micros",
  "credit_status", "status", "payments_present", "additional_info_present",
  "retry_history_present", "email_history_present", "compatibility_json",
  "record_hash",
];

const childColumns: Record<string, string[]> = {
  sale_xml_documents: [
    "tenant_id", "sale_id", "signed_xml", "authorized_xml",
  ],
  sale_items: [
    "tenant_id", "sale_id", "line_index", "product_id", "item_type",
    "code", "name", "quantity_micros", "unit_price_micros", "cost_micros",
    "discount_micros", "iva_rate_micros", "source_line_key",
    "compatibility_json",
  ],
  sale_payment_splits: [
    "tenant_id", "sale_id", "payment_index", "payment_id",
    "payment_method", "amount_micros", "bank", "reference",
    "compatibility_json",
  ],
  sale_additional_info: [
    "tenant_id", "sale_id", "field_index", "field_id", "name", "value",
    "compatibility_json",
  ],
  sale_retry_history: [
    "tenant_id", "sale_id", "retry_index", "attempted_at",
  ],
  sale_email_history: [
    "tenant_id", "sale_id", "history_index", "recipient", "sent_at",
    "status", "error", "compatibility_json",
  ],
};

class SalesDatabase implements SQLiteConnection {
  tables = new Map<string, Row[]>();
  corruptTotal = false;
  receiptParams: SQLiteBindValue[] | null = null;

  constructor() {
    this.tables.set("sales", []);
    for (const table of Object.keys(childColumns)) {
      this.tables.set(table, []);
    }
  }

  async execAsync(): Promise<void> {}

  async runAsync(
    source: string,
    ...params: SQLiteBindValue[]
  ): Promise<SQLiteRunResult> {
    if (source.startsWith("DELETE FROM sales")) {
      const tenantId = String(params[0]);
      const deletedIds = new Set(
        (this.tables.get("sales") ?? [])
          .filter((row) => row.tenant_id === tenantId)
          .map((row) => String(row.id)),
      );
      this.tables.set(
        "sales",
        (this.tables.get("sales") ?? [])
          .filter((row) => row.tenant_id !== tenantId),
      );
      for (const table of Object.keys(childColumns)) {
        this.tables.set(
          table,
          (this.tables.get(table) ?? []).filter((row) =>
            row.tenant_id !== tenantId || !deletedIds.has(String(row.sale_id))
          ),
        );
      }
      return { changes: deletedIds.size, lastInsertRowId: 0 };
    }
    const match = source.match(/^INSERT INTO\s+(\w+)/);
    const table = match?.[1];
    if (table === "catalog_validation_receipts") {
      this.receiptParams = params;
      return { changes: 1, lastInsertRowId: 0 };
    }
    if (!table) {
      return { changes: 1, lastInsertRowId: 0 };
    }
    const columns = table === "sales" ? saleColumns : childColumns[table];
    if (!columns) throw new Error(`Tabla inesperada: ${table}`);
    const row = Object.fromEntries(
      columns.map((column, index) => [column, params[index] ?? null]),
    );
    this.tables.set(table, [...(this.tables.get(table) ?? []), row]);
    return { changes: 1, lastInsertRowId: 0 };
  }

  async getFirstAsync<T>(): Promise<T | null> {
    return null;
  }

  async getAllAsync<T>(
    source: string,
    ...params: SQLiteBindValue[]
  ): Promise<T[]> {
    const match = source.match(/FROM\s+(\w+)/);
    const table = match?.[1] ?? "";
    const tenantId = String(params[0]);
    return (this.tables.get(table) ?? [])
      .filter((row) => row.tenant_id === tenantId)
      .map((row) => table === "sales" && this.corruptTotal
        ? { ...row, total_micros: Number(row.total_micros) + 1 }
        : { ...row }) as T[];
  }

  async withExclusiveTransactionAsync(
    task: (transaction: SQLiteConnection) => Promise<void>,
  ): Promise<void> {
    const backup = new Map(
      [...this.tables].map(([table, rows]) => [
        table,
        rows.map((row) => ({ ...row })),
      ]),
    );
    try {
      await task(this);
    } catch (error) {
      this.tables = backup;
      throw error;
    }
  }

  async closeAsync(): Promise<void> {}
}

const sales: Sale[] = [{
  id: "sale-1",
  documentType: "factura",
  establishment: "001",
  emissionPoint: "001",
  establishmentName: "Matriz",
  clientId: "client-1",
  userId: "user-1",
  createdAt: "2026-07-28T12:00:00.000Z",
  sequence: "000000001",
  accessKey: "access-key",
  authorizationNumber: "authorization",
  authorizationDate: "2026-07-28T12:01:00.000Z",
  sriEnvironment: "2",
  signedXml: "<signed/>",
  authorizedXml: "<authorized/>",
  retryHistory: ["2026-07-28T12:00:30.000Z"],
  emailHistory: [{
    to: "cliente@example.com",
    sentAt: "2026-07-28T12:02:00.000Z",
    status: "sent",
  }],
  subtotal: 15.555555,
  tax: 2.333333,
  total: 17.888888,
  paymentMethod: "20",
  paymentCondition: "credito",
  creditDueDate: "2026-08-28",
  creditBalance: 7.888888,
  creditStatus: "pendiente",
  status: "AUTORIZADA",
  items: [{
    productId: "product-1",
    itemType: "product",
    code: "P-1",
    name: "Producto",
    quantity: 1.5,
    unitPrice: 10.37037,
    cost: 5.125,
    discount: 0.25,
    ivaRate: 0.15,
  }, {
    productId: "service-1",
    itemType: "service",
    code: "S-1",
    name: "Servicio",
    quantity: 1,
    unitPrice: 0.25,
    discount: 0,
    ivaRate: 0,
  }],
  payments: [{
    id: "split-1",
    paymentMethod: "20",
    amount: 10,
    bank: "Banco",
    reference: "ABC",
  }],
  additionalInfo: [{
    id: "info-1",
    name: "Observación",
    value: "Prueba",
  }],
}, {
  id: "legacy-sale",
  clientId: "client-old",
  userId: "user-old",
  createdAt: "2025-01-01T00:00:00.000Z",
  sequence: "000000002",
  accessKey: "",
  subtotal: 1,
  tax: 0,
  total: 1,
  paymentMethod: "01",
  status: "TICKET_OFFLINE",
  items: [{
    productId: "legacy-product",
    code: "OLD",
    name: "Antiguo",
    quantity: 1,
    unitPrice: 1,
    discount: 0,
    ivaRate: 0,
  }],
}];

function receipt() {
  return {
    snapshotGeneration: "generation-1",
    sourceHash: "sales-hash",
    schemaVersion: 6,
    confirmCanonical: async () => true,
  };
}

describe("SalesRepository", () => {
  it("migra cabecera, XML y colecciones con paridad financiera", async () => {
    const database = new SalesDatabase();
    const repository = new SalesRepository({
      database,
      tenantId: "company-1",
    });

    const result = await repository.migrateMirror(sales, receipt());

    expect(result).toMatchObject({
      equal: true,
      jsonCount: 2,
      sqliteCount: 2,
      comparedHashes: 2,
      metrics: {
        subtotalMicros: 16_555_555,
        taxMicros: 2_333_333,
        totalMicros: 18_888_888,
        creditBalanceMicros: 7_888_888,
        lineCount: 3,
        paymentCount: 1,
      },
    });
    expect(database.tables.get("sale_xml_documents")).toEqual([
      expect.objectContaining({
        sale_id: "sale-1",
        signed_xml: "<signed/>",
        authorized_xml: "<authorized/>",
      }),
    ]);
    expect(database.tables.get("sales")?.[0]).not.toHaveProperty("signed_xml");
    await expect(repository.listAll()).resolves.toEqual(sales);
    expect(JSON.parse(String(database.receiptParams?.[8]))).toMatchObject({
      subtotalMicros: 16_555_555,
      taxMicros: 2_333_333,
      discountMicros: 250_000,
      totalMicros: 18_888_888,
      creditBalanceMicros: 7_888_888,
      lineCount: 3,
      paymentCount: 1,
      signedXmlCount: 1,
      authorizedXmlCount: 1,
    });
  });

  it("detecta diferencias explícitas de total y hace rollback completo", async () => {
    const database = new SalesDatabase();
    database.tables.set("sales", [{
      tenant_id: "company-1",
      id: "previous",
    }]);
    database.corruptTotal = true;
    const repository = new SalesRepository({
      database,
      tenantId: "company-1",
    });

    await expect(repository.migrateMirror(sales, receipt()))
      .rejects.toThrow("FINANCIAL_MISMATCH:totalMicros");
    expect(database.tables.get("sales")).toEqual([{
      tenant_id: "company-1",
      id: "previous",
    }]);
  });

  it("revierte si la generación del snapshot cambió", async () => {
    const database = new SalesDatabase();
    const repository = new SalesRepository({
      database,
      tenantId: "company-1",
    });

    await expect(repository.migrateMirror(sales, {
      ...receipt(),
      confirmCanonical: async () => false,
    })).rejects.toThrow("STALE_SNAPSHOT_GENERATION");
    expect(database.tables.get("sales")).toHaveLength(0);
  });

  it("mantiene aislamiento obligatorio por tenant", async () => {
    const database = new SalesDatabase();
    await new SalesRepository({
      database,
      tenantId: "company-1",
    }).migrateMirror(sales, receipt());
    await new SalesRepository({
      database,
      tenantId: "company-2",
    }).migrateMirror([{ ...sales[1]!, id: "other-sale" }], {
      ...receipt(),
      sourceHash: "other-hash",
    });

    await expect(new SalesRepository({
      database,
      tenantId: "company-1",
    }).compareWithFileSales(sales)).resolves.toMatchObject({ equal: true });
    expect(database.tables.get("sales")?.filter(
      (row) => row.tenant_id === "company-2",
    )).toHaveLength(1);
  });
});
