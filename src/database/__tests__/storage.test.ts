const store = new Map<string, string>();
let mockNativeToken = "";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async (key: string) => store.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    store.delete(key);
  })
}));

jest.mock("../mainSnapshotStorage", () => ({
  confirmMainSnapshotMigration: jest.fn(async () => undefined),
  readMainSnapshot: jest.fn(async (key: string) => store.get(key) ?? null),
  writeMainSnapshot: jest.fn(async (key: string, value: string) => {
    store.set(key, value);
  })
}));

jest.mock("../../services/nativeSessionTokenStorage", () => ({
  usesNativeSecureSessionToken: jest.fn(() => true),
  loadNativeSessionToken: jest.fn(async () => mockNativeToken),
  saveNativeSessionToken: jest.fn(async (token: string) => { mockNativeToken = token; }),
  clearNativeSessionToken: jest.fn(async () => { mockNativeToken = ""; })
}));

import { initialData, loadData, loadSession, migrateStoredPendingSyncRequestIds, PRODUCTION_BACKEND_URL, resolveStoredBackendUrl, saveData, saveSession, updateStoredData } from "../storage";
import { CreditAdjustment, PendingSyncItem, Sale } from "../../types";

const storageKey = "factura-sri-mobile:v1";
const outboxKey = "factura-sri-mobile:pending-outbox:v1";

function pending(id: string, patch: unknown): PendingSyncItem {
  return { id, createdAt: "2026-06-29T10:00:00.000Z", attempts: 0, title: "Pendiente", patch };
}

function adjustment(overrides: Partial<CreditAdjustment> = {}): CreditAdjustment {
  return {
    id: "adjustment-1",
    operationId: "credit-adjustment-operation:1",
    type: "CREDIT_NOTE",
    sourceCreditNoteId: "note-1",
    sourceSaleId: "sale-1",
    clientId: "c-final",
    amount: 10,
    state: "APPLIED",
    appliedAt: "2026-06-29T10:00:00.000Z",
    userId: "u-admin",
    ...overrides
  };
}

describe("storage pending outbox", () => {
  beforeEach(() => {
    store.clear();
    mockNativeToken = "";
  });

  it("replaces private network backend URLs with the public production API", () => {
    expect(resolveStoredBackendUrl("http://localhost:4000")).toBe(PRODUCTION_BACKEND_URL);
    expect(resolveStoredBackendUrl("http://127.0.0.1:4000")).toBe(PRODUCTION_BACKEND_URL);
    expect(resolveStoredBackendUrl("http://192.168.1.25:4000")).toBe(PRODUCTION_BACKEND_URL);
    expect(resolveStoredBackendUrl("http://10.0.0.8:4000")).toBe(PRODUCTION_BACKEND_URL);
    expect(resolveStoredBackendUrl("http://172.20.1.8:4000")).toBe(PRODUCTION_BACKEND_URL);
    expect(resolveStoredBackendUrl("http://factudarwin.local:4000")).toBe(PRODUCTION_BACKEND_URL);
  });

  it("recovers pending sync from the independent outbox when the main snapshot is unavailable", async () => {
    const sale: Sale = {
      id: "sale-183",
      documentType: "factura",
      clientId: "c-final",
      userId: "u-admin",
      createdAt: "2026-06-29T10:00:00.000Z",
      sequence: "000000183",
      accessKey: "290620260117237720990011002010000000183123456781",
      authorizationNumber: "290620260117237720990011002010000000183123456781",
      subtotal: 10,
      tax: 1.5,
      total: 11.5,
      paymentMethod: "01",
      status: "AUTORIZADA",
      items: [{ productId: "p-servicio", code: "SERV-001", name: "Servicio", quantity: 1, unitPrice: 10, discount: 0, ivaRate: 0.15 }]
    };
    const pending: PendingSyncItem = {
      id: "pending-sale-183",
      createdAt: "2026-06-29T10:00:00.000Z",
      attempts: 0,
      title: "Documento pendiente de sincronizar",
      lastError: "sin conexion",
      patch: { sales: [sale] }
    };

    await saveData({ ...initialData, pendingSync: [pending] });
    store.delete(storageKey);

    const recovered = await loadData();

    expect(recovered.pendingSync).toHaveLength(1);
    expect(recovered.pendingSync?.[0]?.id).toBe("pending-sale-183");
    expect(recovered.sales.some((item) => item.id === "sale-183" && item.status === "AUTORIZADA")).toBe(true);
    expect(recovered.autoBackupLastError).toContain("pendiente");
  });

  it("clears the independent outbox after pending sync is empty", async () => {
    const pending: PendingSyncItem = {
      id: "pending-client",
      createdAt: "2026-06-29T10:00:00.000Z",
      attempts: 0,
      title: "Cliente pendiente",
      patch: { clients: [{ id: "client-1" }] }
    };

    await saveData({ ...initialData, pendingSync: [pending] });
    await saveData({ ...initialData, pendingSync: [] });
    store.delete(storageKey);

    const recovered = await loadData();

    expect(recovered.pendingSync).toEqual([]);
  });

  it("never persists password material inside the active session and cleans legacy sessions", async () => {
    const user = {
      id: "user-secure-session",
      companyId: "company-secure-session",
      name: "Usuario seguro",
      email: "secure@example.invalid",
      role: "admin" as const,
      password: "plain-never-store",
      passwordHash: "hash-never-store"
    };
    await saveSession(user, "short-lived-access", "legacy-parameter-hash", "1799999999001");
    expect(store.get("factura-sri-mobile:session:v1")).not.toContain("short-lived-access");
    expect(mockNativeToken).toBe("short-lived-access");
    expect(store.get("factura-sri-mobile:session:v1")).not.toContain("plain-never-store");
    expect(store.get("factura-sri-mobile:session:v1")).not.toContain("hash-never-store");
    expect(store.get("factura-sri-mobile:session:v1")).not.toContain("legacy-parameter-hash");

    store.set("factura-sri-mobile:session:v1", JSON.stringify({ user, token: "short-lived-access", passwordHash: "legacy-root-hash", savedAt: "2026-08-16T00:00:00.000Z" }));
    const migrated = await loadSession();
    expect(migrated?.token).toBe("short-lived-access");
    expect(migrated?.passwordHash).toBeUndefined();
    expect(migrated?.user.password).toBeUndefined();
    expect(migrated?.user.passwordHash).toBeUndefined();
    expect(store.get("factura-sri-mobile:session:v1")).not.toContain("legacy-root-hash");
    expect(store.get("factura-sri-mobile:session:v1")).not.toContain("plain-never-store");
  });

  it("does not persist a regression from AUTORIZADA to a pending SRI state", async () => {
    const authorized: Sale = {
      id: "sale-authorized-344",
      documentType: "factura",
      clientId: "c-final",
      userId: "u-admin",
      createdAt: "2026-08-11T10:00:00.000Z",
      sequence: "000000344",
      accessKey: "110820260117237720990011002010000000344123456781",
      authorizationNumber: "110820260117237720990011002010000000344123456781",
      authorizationDate: "2026-08-11T10:01:00.000Z",
      status: "AUTORIZADA",
      subtotal: 1,
      tax: 0.15,
      total: 1.15,
      paymentMethod: "01",
      items: [],
      authorizedXml: "<estado>AUTORIZADO</estado>"
    };
    await saveData({ ...initialData, sales: [authorized] });

    const persisted = await updateStoredData((current) => ({
      ...current,
      sales: current.sales.map((sale) => sale.id === authorized.id
        ? { ...sale, status: "PENDIENTE_SRI", sriMessage: "En revision SRI", authorizedXml: "" }
        : sale)
    }));

    expect(persisted.sales[0]).toMatchObject({
      status: "AUTORIZADA",
      authorizationNumber: authorized.authorizationNumber,
      authorizedXml: authorized.authorizedXml
    });
  });

  it("migrates a legacy pending immediately and preserves its identity across two restarts", async () => {
    store.set(outboxKey, JSON.stringify([pending("legacy", { clients: [] })]));
    const first = await loadData();
    const firstId = (first.pendingSync?.[0]?.patch as { requestId: string }).requestId;
    expect(firstId).toMatch(/^sync_/);
    expect(JSON.parse(store.get(outboxKey) || "[]")[0].patch.requestId).toBe(firstId);

    const second = await loadData();
    const third = await loadData();
    expect((second.pendingSync?.[0]?.patch as { requestId: string }).requestId).toBe(firstId);
    expect((third.pendingSync?.[0]?.patch as { requestId: string }).requestId).toBe(firstId);
  });

  it("preserves a valid requestId through JSON round trips", async () => {
    await saveData({ ...initialData, pendingSync: [pending("valid", { requestId: "sync_valid", clients: [] })] });
    store.delete(storageKey);
    const restored = await loadData();
    expect((restored.pendingSync?.[0]?.patch as { requestId: string }).requestId).toBe("sync_valid");
  });

  it.each([
    ["invalid-null", { requestId: null }],
    ["invalid-empty", { requestId: "" }],
    ["invalid-non-string", { requestId: 42 }]
  ])("propagates migration error and preserves invalid outbox: %s", async (pendingId, patch) => {
    const original = JSON.stringify([pending(pendingId, patch)]);
    store.set(outboxKey, original);
    await expect(loadData()).rejects.toMatchObject({
      name: "PendingSyncRequestIdMigrationError",
      code: "PENDING_SYNC_REQUEST_ID_INVALID",
      pendingId
    });
    expect(store.get(outboxKey)).toBe(original);
  });

  it("migrateStoredPendingSyncRequestIds is idempotent", async () => {
    store.set(outboxKey, JSON.stringify([pending("migrate", { clients: [] })]));
    const loaded = await loadData();
    const requestId = (loaded.pendingSync?.[0]?.patch as { requestId: string }).requestId;
    const first = await migrateStoredPendingSyncRequestIds();
    const second = await migrateStoredPendingSyncRequestIds();
    expect((first.pendingSync?.[0]?.patch as { requestId: string }).requestId).toBe(requestId);
    expect((second.pendingSync?.[0]?.patch as { requestId: string }).requestId).toBe(requestId);
  });

  it("merges snapshot and outbox by pending id without losing durable identity", async () => {
    const snapshotPending = pending("shared", { clients: [] });
    const outboxPending = pending("shared", { requestId: "sync_outbox", clients: [] });
    store.set(storageKey, JSON.stringify({ ...initialData, pendingSync: [snapshotPending] }));
    store.set(outboxKey, JSON.stringify([outboxPending]));
    const loaded = await loadData();
    expect(loaded.pendingSync).toHaveLength(1);
    expect((loaded.pendingSync?.[0]?.patch as { requestId: string }).requestId).toBe("sync_outbox");
  });

  it("initializes and loads legacy snapshots without credit adjustments", async () => {
    expect(initialData.creditAdjustments).toEqual([]);
    const legacy = { ...initialData };
    delete legacy.creditAdjustments;
    store.set(storageKey, JSON.stringify(legacy));
    expect((await loadData()).creditAdjustments).toEqual([]);
  });

  it("preserves legacy and modern adjustment identities through JSON round trips", async () => {
    const legacy = adjustment({ id: "legacy-adjustment" });
    delete legacy.operationId;
    const modern = adjustment({
      id: "modern-adjustment",
      reverseOperationId: "credit-adjustment-reverse:1",
      state: "REVERSED",
      reversedAt: "2026-06-29T11:00:00.000Z"
    });
    await saveData({ ...initialData, creditAdjustments: [legacy, modern] });
    const loaded = await loadData();
    expect(loaded.creditAdjustments).toEqual([legacy, modern]);
    expect(loaded.creditAdjustments?.[0]?.operationId).toBeUndefined();
    expect(loaded.creditAdjustments?.[1]?.reverseOperationId).toBe("credit-adjustment-reverse:1");
  });

  it("preserves a sales tombstone across restart and never restores its stale document", async () => {
    const removedSale: Sale = {
      id: "sale-removed",
      documentType: "factura",
      clientId: "c-final",
      userId: "u-admin",
      createdAt: "2026-07-27T23:56:30.000Z",
      sequence: "000000025",
      accessKey: "test-access-key",
      subtotal: 1,
      tax: 0,
      total: 1,
      paymentMethod: "01",
      status: "AUTORIZADA",
      items: []
    };
    const keptSale = { ...removedSale, id: "sale-kept", sequence: "000000019", accessKey: "production-access-key" };

    await saveData({
      ...initialData,
      sales: [keptSale, removedSale],
      deletedIds: { ...(initialData.deletedIds || {}), sales: [removedSale.id] }
    });
    const firstOpen = await loadData();
    const secondOpen = await loadData();

    expect(firstOpen.sales.map((sale) => sale.id)).toEqual([keptSale.id]);
    expect(secondOpen.sales.map((sale) => sale.id)).toEqual([keptSale.id]);
    expect(secondOpen.deletedIds?.sales).toEqual([removedSale.id]);
    expect(secondOpen.pendingSync).toEqual([]);
  });

  it("materializes an adjustment that exists only in the durable outbox", async () => {
    const pendingAdjustment = adjustment({ id: "outbox-adjustment" });
    store.set(outboxKey, JSON.stringify([pending("adjustment-only", { requestId: "sync_adjustment", creditAdjustments: [pendingAdjustment] })]));
    const loaded = await loadData();
    expect(loaded.creditAdjustments).toEqual([pendingAdjustment]);
  });

  it("uses the complete outbox adjustment for the same material id", async () => {
    const applied = adjustment();
    const reversed = adjustment({
      state: "REVERSED",
      reverseOperationId: "credit-adjustment-reverse:1",
      reversedAt: "2026-06-29T11:00:00.000Z",
      reason: "Reverso durable",
      extraField: "preserved"
    } as Partial<CreditAdjustment>);
    store.set(storageKey, JSON.stringify({ ...initialData, creditAdjustments: [applied] }));
    store.set(outboxKey, JSON.stringify([pending("adjustment-reverse", { requestId: "sync_reverse", creditAdjustments: [reversed] })]));
    const loaded = await loadData();
    expect(loaded.creditAdjustments).toHaveLength(1);
    expect(loaded.creditAdjustments?.[0]).toEqual(reversed);
  });
});
