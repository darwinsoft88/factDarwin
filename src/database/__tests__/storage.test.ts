const store = new Map<string, string>();

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async (key: string) => store.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    store.delete(key);
  })
}));

import { initialData, loadData, PRODUCTION_BACKEND_URL, resolveStoredBackendUrl, saveData } from "../storage";
import { PendingSyncItem, Sale } from "../../types";

const storageKey = "factura-sri-mobile:v1";

describe("storage pending outbox", () => {
  beforeEach(() => {
    store.clear();
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
});
