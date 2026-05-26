import { initialData } from "../../storage";
import { syncPatchToBackend } from "../sync";

jest.mock("../../services/backend", () => ({
  mergeBackendData: jest.fn(async () => {
    throw new Error("network down");
  })
}));

jest.mock("../dialogs", () => ({
  showMessage: jest.fn()
}));

jest.mock("../id", () => ({
  generateId: jest.fn(() => "pending-1")
}));

describe("sync", () => {
  it("queues a pending sync item when backend merge fails", async () => {
    const persist = jest.fn<Promise<void>, [typeof initialData]>(async () => undefined);
    const patch = { baseData: initialData, clients: [] };

    await syncPatchToBackend("https://backend.test", "token", patch, "Cliente pendiente", initialData, persist);

    expect(persist).toHaveBeenCalledTimes(1);
    const saved = persist.mock.calls[0]?.[0];
    expect(saved).toMatchObject({
      pendingSync: [
        {
          id: "pending-1",
          attempts: 0,
          title: "Cliente pendiente",
          patch
        }
      ]
    });
  });

  it("keeps at most 100 pending items", async () => {
    const localData = {
      ...initialData,
      pendingSync: Array.from({ length: 100 }, (_, index) => ({
        id: `old-${index}`,
        createdAt: "2026-05-01T00:00:00.000Z",
        attempts: 0,
        title: "Anterior",
        lastError: "offline",
        patch: { baseData: initialData }
      }))
    };
    const persist = jest.fn<Promise<void>, [typeof initialData]>(async () => undefined);

    await syncPatchToBackend("https://backend.test", "token", { baseData: initialData }, "Nuevo pendiente", localData, persist);

    const saved = persist.mock.calls[0]?.[0];
    expect(saved?.pendingSync).toHaveLength(100);
    expect(saved?.pendingSync?.[0]?.id).toBe("pending-1");
  });
});
