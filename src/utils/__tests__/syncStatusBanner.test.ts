import { buildSyncStatusBannerView, runSyncStatusBannerAction } from "../syncStatusBanner";

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
  it("stays hidden without incidents", () => {
    expect(buildSyncStatusBannerView(base).visible).toBe(false);
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
