import { initialData } from "../../database";
import { AppData, CreditAdjustment, CreditPayment, InventoryMovement, Product, Sale } from "../../types";
import { CreditAdjustmentMergeError, mergeAppDataSnapshots, mergeCreditAdjustments } from "../dataMerge";
import type { IncrementalPatch } from "../sync";
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
    status: "TICKET_OFFLINE",
    items: []
  };
}

function product(stock: number, updatedAt: string): Product {
  return {
    id: "prod-1",
    code: "P001",
    name: "Producto",
    price: 1,
    ivaRate: 0.15,
    stock,
    updatedAt
  };
}

function movement(id: string, quantity: number, createdAt: string): InventoryMovement {
  return {
    id,
    productId: "prod-1",
    productName: "Producto",
    type: "salida",
    quantity,
    stockBefore: 10,
    stockAfter: 10 - quantity,
    reason: "Venta facturada",
    userId: "user-1",
    createdAt
  };
}

function creditPayment(id: string, saleId: string, amount: number, createdAt: string): CreditPayment {
  return {
    id,
    saleId,
    clientId: "client-1",
    userId: "user-1",
    userName: "Vendedor",
    amount,
    paymentMethod: "01",
    note: "",
    createdAt
  };
}

function creditAdjustment(id: string, overrides: Partial<CreditAdjustment> = {}): CreditAdjustment {
  return {
    id,
    operationId: `credit-adjustment-operation:${id}`,
    type: "CREDIT_NOTE",
    sourceCreditNoteId: `note-${id}`,
    sourceSaleId: `sale-${id}`,
    clientId: "client-1",
    amount: 10,
    state: "APPLIED",
    appliedAt: "2026-05-01T00:00:00.000Z",
    userId: "user-1",
    ...overrides
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

  it("keeps the newer active establishment after syncing another device", () => {
    const remote = {
      ...initialData,
      issuer: {
        ...initialData.issuer,
        establishment: "001",
        emissionPoint: "001",
        activeEstablishmentId: "001-001",
        establishmentsUpdatedAt: "2026-05-01T00:00:00.000Z",
        establishments: [
          { id: "001-001", name: "Matriz", establishment: "001", emissionPoint: "001", address: "A", sequential: 2, active: true, updatedAt: "2026-05-01T00:00:00.000Z" },
          { id: "002-010", name: "FacturaCacao", establishment: "002", emissionPoint: "010", address: "B", sequential: 7, active: true, updatedAt: "2026-05-01T00:00:00.000Z" }
        ]
      }
    };
    const local = {
      ...initialData,
      issuer: {
        ...initialData.issuer,
        establishment: "002",
        emissionPoint: "010",
        activeEstablishmentId: "002-010",
        establishmentsUpdatedAt: "2026-05-02T00:00:00.000Z",
        establishments: [
          { id: "001-001", name: "Matriz", establishment: "001", emissionPoint: "001", address: "A", sequential: 2, active: true, updatedAt: "2026-05-01T00:00:00.000Z" },
          { id: "002-010", name: "FacturaCacao", establishment: "002", emissionPoint: "010", address: "B", sequential: 7, active: true, updatedAt: "2026-05-02T00:00:00.000Z" }
        ]
      }
    };

    const merged = mergeAppDataSnapshots(remote, local);

    expect(merged.issuer.activeEstablishmentId).toBe("002-010");
    expect(merged.issuer.establishment).toBe("002");
    expect(merged.issuer.emissionPoint).toBe("010");
  });

  it("rebuilds stock from inventory movements when two devices sell the same product", () => {
    const remote = {
      ...initialData,
      products: [product(9, "2026-05-01T00:00:01.000Z")],
      inventoryMovements: [movement("remote-sale-stock", 1, "2026-05-01T00:00:01.000Z")]
    };
    const local = {
      ...initialData,
      products: [product(9, "2026-05-01T00:00:02.000Z")],
      inventoryMovements: [movement("local-sale-stock", 1, "2026-05-01T00:00:02.000Z")]
    };

    const merged = mergeAppDataSnapshots(remote, local);

    expect(merged.products.find((item) => item.id === "prod-1")?.stock).toBe(8);
    expect(merged.inventoryMovements).toHaveLength(2);
  });

  it("rebuilds credit balance from payments when another device collected money", () => {
    const creditSale = {
      ...sale("sale-credit", "000000010", "2026-05-01T00:00:00.000Z"),
      paymentCondition: "credito" as const,
      total: 100,
      creditBalance: 100,
      creditStatus: "pendiente" as const
    };
    const remote = {
      ...initialData,
      sales: [{ ...creditSale, creditBalance: 50 }],
      creditPayments: [creditPayment("remote-payment", "sale-credit", 50, "2026-05-01T00:00:01.000Z")]
    };
    const local = {
      ...initialData,
      sales: [creditSale],
      creditPayments: []
    };

    const merged = mergeAppDataSnapshots(remote, local);

    expect(merged.sales.find((item) => item.id === "sale-credit")?.creditBalance).toBe(50);
    expect(merged.sales.find((item) => item.id === "sale-credit")?.creditStatus).toBe("pendiente");
  });

  it("drops local credit payments that would exceed the remote sale balance", () => {
    const creditSale = {
      ...sale("sale-credit", "000000164", "2026-05-01T00:00:00.000Z"),
      paymentCondition: "credito" as const,
      total: 100,
      creditBalance: 100,
      creditStatus: "pendiente" as const
    };
    const remote = {
      ...initialData,
      sales: [{ ...creditSale, creditBalance: 0, creditStatus: "pagado" as const }],
      creditPayments: [creditPayment("remote-payment", "sale-credit", 100, "2026-05-01T00:00:01.000Z")]
    };
    const local = {
      ...initialData,
      sales: [creditSale],
      creditPayments: [creditPayment("local-duplicate", "sale-credit", 25, "2026-05-01T00:00:02.000Z")]
    };

    const merged = mergeAppDataSnapshots(remote, local);

    expect(merged.creditPayments.map((payment) => payment.id)).toEqual(["remote-payment"]);
    expect(merged.sales.find((item) => item.id === "sale-credit")?.creditBalance).toBe(0);
    expect(merged.sales.find((item) => item.id === "sale-credit")?.creditStatus).toBe("pagado");
  });

  it("uses the durable server state for a synchronized SRI document", () => {
    const base = sale("sale-stale", "000000327", "2026-08-01T17:02:00.000Z");
    const remote = {
      ...initialData,
      sales: [{ ...base, status: "ANULADA" as const, inventoryState: "REVERSED" as const }]
    };
    const local = {
      ...initialData,
      sales: [{ ...base, status: "ERROR_SRI" as const, inventoryState: "REVERSED" as const }],
      pendingSync: []
    };

    const merged = mergeAppDataSnapshots(remote, local);

    expect(merged.sales).toHaveLength(1);
    expect(merged.sales[0]).toMatchObject({ id: "sale-stale", status: "ANULADA", inventoryState: "REVERSED" });
  });

  it("keeps a local sale while its exact change remains protected by the outbox", () => {
    const base = sale("sale-pending", "000000328", "2026-08-08T10:00:00.000Z");
    const remoteSale = { ...base, status: "ERROR_SRI" as const, sriMessage: "estado remoto anterior" };
    const localSale = { ...base, status: "PENDIENTE_SRI" as const, sriMessage: "cambio local pendiente" };
    const remote = { ...initialData, sales: [remoteSale] };
    const local = {
      ...initialData,
      sales: [localSale],
      pendingSync: [{
        id: "pending-sale",
        title: "Documento pendiente",
        attempts: 1,
        createdAt: "2026-08-08T10:00:01.000Z",
        patch: { requestId: "sync_sale_pending", sales: [localSale] }
      }]
    };

    const merged = mergeAppDataSnapshots(remote, local);

    expect(merged.sales[0]?.sriMessage).toBe("cambio local pendiente");
    expect(merged.pendingSync).toHaveLength(1);
  });

  it("does not regress a locally authorized retry while its durable sync is pending", () => {
    const base = sale("sale-retry", "000000339", "2026-08-09T23:27:58.289Z");
    const remoteSale = { ...base, status: "ENVIADA" as const, sriMessage: "En revision SRI" };
    const localSale = { ...base, status: "AUTORIZADA" as const, authorizationNumber: "authorization-339", authorizedXml: "<autorizado />" };
    const remote = { ...initialData, sales: [remoteSale] };
    const local: AppData = {
      ...initialData,
      sales: [localSale],
      pendingSync: [{
        id: "pending-retry-339",
        title: "Documento pendiente",
        attempts: 0,
        createdAt: "2026-08-09T23:30:00.000Z",
        patch: { requestId: "sync_retry_339", sales: [localSale] }
      }]
    };

    const merged = mergeAppDataSnapshots(remote, local);

    expect(merged.sales[0]).toMatchObject({ status: "AUTORIZADA", authorizationNumber: "authorization-339" });
    expect(merged.pendingSync).toHaveLength(1);
  });

  it("does not revive a sale protected by a durable deletion tombstone", () => {
    const removedSale = sale("sale-removed", "000000025", "2026-07-27T23:56:30.000Z");
    const remote: AppData = {
      ...initialData,
      sales: [],
      deletedIds: { ...(initialData.deletedIds || {}), sales: [removedSale.id] }
    };
    const local: AppData = { ...initialData, sales: [removedSale] };

    const merged = mergeAppDataSnapshots(remote, local);

    expect(merged.sales).toEqual([]);
    expect(merged.deletedIds?.sales).toEqual([removedSale.id]);
  });

  it("keeps a sales tombstone idempotent across repeated syncs without affecting another document", () => {
    const removedSale = sale("sale-removed", "000000025", "2026-07-27T23:56:30.000Z");
    const keptSale = sale("sale-kept", "000000019", "2026-08-08T22:45:50.000Z");
    const remote: AppData = {
      ...initialData,
      sales: [keptSale],
      deletedIds: { ...(initialData.deletedIds || {}), sales: [removedSale.id] }
    };
    const staleLocal: AppData = { ...initialData, sales: [removedSale, keptSale] };

    const firstSync = mergeAppDataSnapshots(remote, staleLocal);
    const secondSync = mergeAppDataSnapshots(remote, firstSync);
    const thirdSync = mergeAppDataSnapshots(remote, secondSync);

    expect(thirdSync.sales.map((item) => item.id)).toEqual([keptSale.id]);
    expect(thirdSync.deletedIds?.sales).toEqual([removedSale.id]);
    expect(thirdSync.pendingSync).toEqual([]);
  });

  it("keeps exclusive remote and local adjustments without deduplicating by note or amount", () => {
    const remote = creditAdjustment("remote", { sourceCreditNoteId: "same-note", amount: 10 });
    const local = creditAdjustment("local", { sourceCreditNoteId: "same-note", amount: 10 });
    expect(mergeCreditAdjustments([remote], [local]).map((item) => item.id)).toEqual(["remote", "local"]);
  });

  it("merges the same id and operation once while preserving unknown fields", () => {
    const remote = creditAdjustment("shared", { operationId: "shared-operation", remoteField: true } as Partial<CreditAdjustment>);
    const local = creditAdjustment("shared", { operationId: "shared-operation", localField: true } as Partial<CreditAdjustment>);
    const [merged] = mergeCreditAdjustments([remote], [local]);
    expect(merged).toMatchObject({ id: "shared", operationId: "shared-operation", remoteField: true, localField: true });
  });

  it("never revives a reversed adjustment with an applied version", () => {
    const reversed = creditAdjustment("shared", {
      state: "REVERSED",
      reverseOperationId: "reverse-operation:shared",
      reversedAt: "2026-05-02T00:00:00.000Z"
    });
    const applied = creditAdjustment("shared");
    expect(mergeCreditAdjustments([reversed], [applied])[0]).toMatchObject({
      state: "REVERSED",
      reverseOperationId: "reverse-operation:shared",
      reversedAt: "2026-05-02T00:00:00.000Z"
    });
    expect(mergeCreditAdjustments([applied], [reversed])[0]?.state).toBe("REVERSED");
  });

  it.each([
    ["operation conflict", [creditAdjustment("shared", { operationId: "operation-1" })], [creditAdjustment("shared", { operationId: "operation-2" })], "CREDIT_ADJUSTMENT_OPERATION_CONFLICT"],
    ["operation identity conflict", [creditAdjustment("one", { operationId: "same-operation" })], [creditAdjustment("two", { operationId: "same-operation" })], "CREDIT_ADJUSTMENT_IDENTITY_CONFLICT"],
    ["reverse conflict", [creditAdjustment("shared", { reverseOperationId: "reverse-1" })], [creditAdjustment("shared", { reverseOperationId: "reverse-2" })], "CREDIT_ADJUSTMENT_REVERSE_OPERATION_CONFLICT"],
    ["reverse identity conflict", [creditAdjustment("one", { reverseOperationId: "same-reverse" })], [creditAdjustment("two", { reverseOperationId: "same-reverse" })], "CREDIT_ADJUSTMENT_IDENTITY_CONFLICT"]
  ])("rejects %s", (_label, remote, local, code) => {
    expect(() => mergeCreditAdjustments(remote as CreditAdjustment[], local as CreditAdjustment[])).toThrow(expect.objectContaining({ code }));
  });

  it.each([
    ["invalid operation", { operationId: " invalid" }],
    ["invalid reverse operation", { reverseOperationId: "" }],
    ["overlong operation", { operationId: "x".repeat(201) }]
  ])("rejects %s without normalizing identities", (_label, overrides) => {
    expect(() => mergeCreditAdjustments([creditAdjustment("invalid", overrides)], [])).toThrow(CreditAdjustmentMergeError);
    try {
      mergeCreditAdjustments([creditAdjustment("invalid", overrides)], []);
    } catch (error) {
      expect(error).toMatchObject({ code: "INVALID_CREDIT_ADJUSTMENT_SNAPSHOT" });
    }
  });

  it("keeps legacy and modern adjustments together in deterministic order", () => {
    const legacy = creditAdjustment("legacy", { createdAt: "2026-05-02T00:00:00.000Z" } as Partial<CreditAdjustment>);
    delete legacy.operationId;
    const modern = creditAdjustment("modern", { createdAt: "2026-05-01T00:00:00.000Z" } as Partial<CreditAdjustment>);
    expect(mergeCreditAdjustments([legacy], [modern]).map((item) => item.id)).toEqual(["modern", "legacy"]);
  });

  it("preserves adjustments through complete reconstruction and incremental patch typing", () => {
    const remoteAdjustment = creditAdjustment("remote");
    const localAdjustment = creditAdjustment("local");
    const remote: AppData = { ...initialData, creditAdjustments: [remoteAdjustment] };
    const local: AppData = { ...initialData, creditAdjustments: [localAdjustment] };
    const merged = mergeAppDataSnapshots(remote, local);
    const patch: IncrementalPatch = { baseData: merged, creditAdjustments: merged.creditAdjustments };
    expect(merged.creditAdjustments?.map((item) => item.id)).toEqual(["remote", "local"]);
    expect(patch.creditAdjustments).toEqual(merged.creditAdjustments);
  });
});
