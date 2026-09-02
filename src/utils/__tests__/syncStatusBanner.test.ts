import { Sale } from "../../types";
import { buildSyncStatusBannerView, countUniqueAttentionDocuments, requiresSyncBannerAttention, runSyncStatusBannerAction } from "../syncStatusBanner";

const base = {
  documentCount: 0,
  hasError: false,
  pendingCount: 0,
  reviewCount: 0,
  retrying: false,
  sriPendingCount: 0,
  staleSriCount: 0,
  syncState: "synced" as const
};

describe("syncStatusBanner", () => {
  const sale = (status: Sale["status"], sriMessage = ""): Sale => ({
    id: `sale-${status}`,
    documentType: "factura",
    clientId: "client-1",
    userId: "user-1",
    createdAt: "2026-08-16T12:00:00.000Z",
    sequence: "001-001-000000001",
    accessKey: "1",
    subtotal: 1,
    tax: 0,
    total: 1,
    paymentMethod: "01",
    status,
    sriMessage,
    items: []
  });

  it("cuenta una sola vez un documento presente en dos categorias", () => {
    expect(countUniqueAttentionDocuments(["sale-326"], ["sale-326"])).toBe(1);
    expect(countUniqueAttentionDocuments(["sale-326"], ["sale-326", "sale-327"])).toBe(2);
  });

  it("stays hidden without incidents", () => {
    expect(buildSyncStatusBannerView(base).visible).toBe(false);
  });

  it("keeps routine synchronization and local changes silent", () => {
    expect(buildSyncStatusBannerView({ ...base, syncState: "syncing" })).toEqual(expect.objectContaining({ visible: false }));
    expect(buildSyncStatusBannerView({ ...base, syncState: "pending", pendingCount: 2 })).toEqual(expect.objectContaining({ visible: false }));
    expect(buildSyncStatusBannerView({ ...base, syncState: "error", hasError: true, pendingCount: 1 })).toEqual(expect.objectContaining({ visible: false }));
  });

  it("keeps normal offline/SRI retry work out of the attention banner", () => {
    const now = new Date("2026-08-16T13:00:00.000Z");
    expect(requiresSyncBannerAttention(sale("FIRMADA"), now)).toBe(false);
    expect(requiresSyncBannerAttention(sale("ENVIADA"), now)).toBe(false);
    expect(requiresSyncBannerAttention(sale("PENDIENTE_SRI"), now)).toBe(false);
    expect(requiresSyncBannerAttention(sale("ERROR_SRI", "Network request failed"), now)).toBe(false);
    expect(buildSyncStatusBannerView({ ...base, sriPendingCount: 1 })).toEqual(expect.objectContaining({ visible: false }));
  });

  it("shows only document states that require human intervention", () => {
    const now = new Date("2026-08-16T13:00:00.000Z");
    expect(requiresSyncBannerAttention(sale("DEVUELTA", "Documento rechazado"), now)).toBe(true);
    expect(requiresSyncBannerAttention(sale("ERROR_SRI", "Cédula inválida"), now)).toBe(true);
    expect(requiresSyncBannerAttention({ ...sale("AUTORIZADA"), inventoryState: "RECONCILIATION_PENDING" }, now)).toBe(true);
    expect(requiresSyncBannerAttention({ ...sale("FIRMADA"), createdAt: "2026-08-15T12:00:00.000Z" }, now)).toBe(true);
  });

  it("keeps a document incident visible while synchronization is running", () => {
    const view = buildSyncStatusBannerView({ ...base, documentCount: 1, reviewCount: 1, syncState: "syncing" });
    expect(view.visible).toBe(true);
    expect(view.title).toBe("1 documento requiere atención");
  });

  it("shows singular quick actions for one document", () => {
    const view = buildSyncStatusBannerView({ ...base, documentCount: 1, reviewCount: 1 });
    expect(view.title).toBe("1 documento requiere atención");
    expect(view.retryLabel).toBe("Reintentar");
    expect(view.viewLabel).toBe("Ver");
  });

  it("shows plural quick actions for several documents", () => {
    const view = buildSyncStatusBannerView({ ...base, documentCount: 3, reviewCount: 3 });
    expect(view.title).toBe("3 documentos requieren atención");
    expect(view.retryLabel).toBe("Reintentar todo");
    expect(view.viewLabel).toBe("Ver lista");
  });

  it("disables retry while synchronization is running", () => {
    const view = buildSyncStatusBannerView({ ...base, documentCount: 1, reviewCount: 1, retrying: true });
    expect(view.retryDisabled).toBe(true);
  });

  it("runs retry once without opening the modal", () => {
    const callbacks = { onOpen: jest.fn(), onRetry: jest.fn(), onView: jest.fn() };
    runSyncStatusBannerAction("retry", callbacks);
    expect(callbacks.onRetry).toHaveBeenCalledTimes(1);
    expect(callbacks.onOpen).not.toHaveBeenCalled();
  });

  it("runs view once without opening the modal", () => {
    const callbacks = { onOpen: jest.fn(), onRetry: jest.fn(), onView: jest.fn() };
    runSyncStatusBannerAction("view", callbacks);
    expect(callbacks.onView).toHaveBeenCalledTimes(1);
    expect(callbacks.onOpen).not.toHaveBeenCalled();
  });

  it("opens the modal only from the main banner action", () => {
    const callbacks = { onOpen: jest.fn(), onRetry: jest.fn(), onView: jest.fn() };
    runSyncStatusBannerAction("open", callbacks);
    expect(callbacks.onOpen).toHaveBeenCalledTimes(1);
    expect(callbacks.onRetry).not.toHaveBeenCalled();
    expect(callbacks.onView).not.toHaveBeenCalled();
  });
});
