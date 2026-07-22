import { initialData } from "../../database";
import { AppData } from "../../types";
import { mergeBackendData as mergeBackendDataHttp } from "../../services/backendApi/data";
import { mergeBackendData, SyncOperationMismatchError } from "../../services/backend";
import { syncPatchToBackend } from "../sync";

jest.mock("../../services/backend", () => {
  class MockSyncOperationMismatchError extends Error {
    status = 409;
    code = "SYNC_OPERATION_MISMATCH";
    requestId: string;
    constructor(message: string, requestId: string) {
      super(message);
      this.requestId = requestId;
    }
  }
  return { mergeBackendData: jest.fn(), SyncOperationMismatchError: MockSyncOperationMismatchError };
});

jest.mock("../dialogs", () => ({ showMessage: jest.fn() }));
jest.mock("../id", () => ({ generateId: jest.fn(() => "pending-test") }));

const mergeMock = mergeBackendData as jest.MockedFunction<typeof mergeBackendData>;

function durableWriter(initial: AppData = initialData, events?: string[]) {
  let current = initial;
  const writer = jest.fn(async (mutation: (data: AppData) => AppData | Promise<AppData>) => {
    const next = await mutation(current);
    events?.push((next.pendingSync || []).length > (current.pendingSync || []).length ? "persist" : "remove");
    current = next;
    return current;
  });
  return { writer, current: () => current };
}

describe("durable incremental sync", () => {
  beforeEach(() => mergeMock.mockReset());

  it("persists before POST, sends the durable patch, then removes it", async () => {
    const events: string[] = [];
    const durable = durableWriter(initialData, events);
    mergeMock.mockImplementation(async (_url, patch) => {
      events.push("post");
      expect(patch).toBe((durable.current().pendingSync?.[0]?.patch));
      return { ok: true };
    });
    const result = await syncPatchToBackend("https://backend.test", "token", { baseData: initialData, requestId: "sync_success", clients: [] }, { persistMutation: durable.writer });
    expect(result).toBe(true);
    expect(events).toEqual(["persist", "post", "remove"]);
    expect(durable.current().pendingSync).toEqual([]);
  });

  it("keeps one pending with the same identity after timeout and reuses it", async () => {
    const durable = durableWriter();
    mergeMock.mockRejectedValueOnce(new Error("timeout"));
    await expect(syncPatchToBackend("https://backend.test", "token", { baseData: initialData, requestId: "sync_timeout", clients: [] }, { persistMutation: durable.writer })).resolves.toBe(false);
    const pendingPatch = durable.current().pendingSync?.[0]?.patch as Record<string, unknown>;
    expect(durable.current().pendingSync).toHaveLength(1);
    expect(pendingPatch.requestId).toBe("sync_timeout");

    mergeMock.mockResolvedValueOnce({ ok: true });
    await syncPatchToBackend("https://backend.test", "token", { baseData: initialData, ...pendingPatch } as never, { persistMutation: durable.writer });
    expect((mergeMock.mock.calls[1]?.[1] as { requestId: string }).requestId).toBe("sync_timeout");
    expect(durable.current().pendingSync).toEqual([]);
  });

  it("supports a lost response followed by a successful backend replay", async () => {
    const durable = durableWriter();
    mergeMock.mockRejectedValueOnce(new Error("response lost")).mockResolvedValueOnce({ ok: true });
    await syncPatchToBackend("url", "token", { baseData: initialData, requestId: "sync_replay", sales: [] }, { persistMutation: durable.writer });
    const patch = durable.current().pendingSync?.[0]?.patch as Record<string, unknown>;
    await syncPatchToBackend("url", "token", { baseData: initialData, ...patch } as never, { persistMutation: durable.writer });
    expect(mergeMock.mock.calls.map((call) => (call[1] as { requestId: string }).requestId)).toEqual(["sync_replay", "sync_replay"]);
    expect(durable.current().pendingSync).toEqual([]);
  });

  it("preserves and propagates a backend mismatch without regenerating identity", async () => {
    const durable = durableWriter();
    mergeMock.mockRejectedValue(new SyncOperationMismatchError("mismatch", "sync_conflict"));
    await expect(syncPatchToBackend("url", "token", { baseData: initialData, requestId: "sync_conflict" }, { persistMutation: durable.writer }))
      .rejects.toMatchObject({ status: 409, code: "SYNC_OPERATION_MISMATCH", requestId: "sync_conflict" });
    expect((durable.current().pendingSync?.[0]?.patch as { requestId: string }).requestId).toBe("sync_conflict");
    expect(mergeMock).toHaveBeenCalledTimes(1);
  });

  it("does not POST when the initial durable write fails", async () => {
    const writer = jest.fn(async () => { throw new Error("disk full"); });
    await expect(syncPatchToBackend("url", "token", { baseData: initialData, requestId: "sync_disk" }, { persistMutation: writer })).rejects.toThrow("disk full");
    expect(mergeMock).not.toHaveBeenCalled();
  });

  it("keeps the pending when removal fails and retries with the same identity", async () => {
    let current = initialData;
    let failRemoval = true;
    const writer = jest.fn(async (mutation: (data: AppData) => AppData | Promise<AppData>) => {
      const next = await mutation(current);
      if (failRemoval && (current.pendingSync || []).length === 1 && (next.pendingSync || []).length === 0) {
        failRemoval = false;
        throw new Error("remove failed");
      }
      current = next;
      return current;
    });
    mergeMock.mockResolvedValue({ ok: true });
    await expect(syncPatchToBackend("url", "token", { baseData: initialData, requestId: "sync_remove" }, { persistMutation: writer })).resolves.toBe(false);
    const patch = current.pendingSync?.[0]?.patch as Record<string, unknown>;
    await syncPatchToBackend("url", "token", { baseData: initialData, ...patch } as never, { persistMutation: writer });
    expect(mergeMock.mock.calls.map((call) => (call[1] as { requestId: string }).requestId)).toEqual(["sync_remove", "sync_remove"]);
    expect(current.pendingSync).toEqual([]);
  });
});

describe("sync HTTP identity", () => {
  it("sends matching non-empty header and body requestId", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }));
    try {
      await mergeBackendDataHttp("https://backend.test", { requestId: "sync_http", clients: [] }, "token");
      const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
      expect((options.headers as Record<string, string>)["Idempotency-Key"]).toBe("sync_http");
      expect(JSON.parse(String(options.body)).requestId).toBe("sync_http");
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("rejects a missing identity before fetch", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch");
    await expect(mergeBackendDataHttp("https://backend.test", { clients: [] }, "token")).rejects.toThrow("requestId valido");
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});
