import { initialData } from "../../database";
import { PendingSyncItem } from "../../types";
import {
  appendPendingSync,
  buildPendingSyncItem,
  identifyIncrementalPatch,
  InvalidSyncRequestIdError,
  LocalSyncRequestIdConflictError,
  MAX_SYNC_REQUEST_ID_LENGTH,
  PendingSyncCapacityError
} from "../pendingSync";

const identified = (requestId: string, value: unknown = 1) => buildPendingSyncItem(
  { baseData: initialData, requestId, clients: [{ id: "client", value } as never] },
  "Pendiente",
  "offline"
);

describe("pendingSync identity", () => {
  it("identifies a new patch without mutating it", () => {
    const patch = { baseData: initialData, clients: [] };
    const result = identifyIncrementalPatch(patch);
    expect(result).not.toBe(patch);
    expect(result.requestId).toMatch(/^sync_/);
    expect(result.requestId.length).toBeLessThanOrEqual(MAX_SYNC_REQUEST_ID_LENGTH);
    expect(Object.prototype.hasOwnProperty.call(patch, "requestId")).toBe(false);
  });

  it("preserves a valid identity and creates different identities for new patches", () => {
    expect(identifyIncrementalPatch({ baseData: initialData, requestId: "sync_existing" }).requestId).toBe("sync_existing");
    expect(identifyIncrementalPatch({ baseData: initialData }).requestId)
      .not.toBe(identifyIncrementalPatch({ baseData: initialData }).requestId);
  });

  it.each([
    [undefined], [null], [""], ["   "], [" sync_outer_space "], [123], ["x".repeat(201)]
  ])("rejects an explicitly invalid requestId %#", (requestId) => {
    expect(() => identifyIncrementalPatch({ baseData: initialData, requestId } as never)).toThrow(InvalidSyncRequestIdError);
    try {
      identifyIncrementalPatch({ baseData: initialData, requestId } as never);
    } catch (error) {
      expect((error as InvalidSyncRequestIdError).code).toBe("INVALID_SYNC_REQUEST_ID");
    }
  });

  it("uses getRandomValues when randomUUID is unavailable", () => {
    const cryptoApi = globalThis.crypto;
    const original = cryptoApi.randomUUID;
    Object.defineProperty(cryptoApi, "randomUUID", { configurable: true, value: undefined });
    const randomSpy = jest.spyOn(cryptoApi, "getRandomValues").mockImplementation((array) => {
      (array as Uint8Array).fill(7);
      return array;
    });
    try {
      expect(identifyIncrementalPatch({ baseData: initialData }).requestId).toMatch(/^sync_[0-9a-f-]{36}$/);
      expect(randomSpy).toHaveBeenCalled();
    } finally {
      randomSpy.mockRestore();
      Object.defineProperty(cryptoApi, "randomUUID", { configurable: true, value: original });
    }
  });

  it("deduplicates canonically equal payloads with the same identity", () => {
    const first = identified("sync_same");
    const reordered = { ...identified("sync_same"), patch: { clients: [{ value: 1, id: "client" }], requestId: "sync_same" } };
    const once = appendPendingSync(initialData, first);
    const twice = appendPendingSync(once, reordered);
    expect(twice.pendingSync).toEqual(once.pendingSync);
    expect(twice.pendingSync?.[0]).toBe(first);
  });

  it("rejects different payloads with the same identity without overwriting", () => {
    const first = identified("sync_conflict", 1);
    const snapshot = appendPendingSync(initialData, first);
    expect(() => appendPendingSync(snapshot, identified("sync_conflict", 2))).toThrow(LocalSyncRequestIdConflictError);
    try {
      appendPendingSync(snapshot, identified("sync_conflict", 2));
    } catch (error) {
      expect((error as LocalSyncRequestIdConflictError).code).toBe("LOCAL_SYNC_REQUEST_ID_CONFLICT");
    }
    expect(snapshot.pendingSync).toEqual([first]);
  });

  it("treats reordered arrays as a material conflict", () => {
    const first = { ...identified("sync_arrays"), patch: { requestId: "sync_arrays", clients: [{ id: "1" }, { id: "2" }] } };
    const second = { ...identified("sync_arrays"), patch: { requestId: "sync_arrays", clients: [{ id: "2" }, { id: "1" }] } };
    expect(() => appendPendingSync(appendPendingSync(initialData, first), second)).toThrow(LocalSyncRequestIdConflictError);
  });

  it("rejects a new item when the durable queue is full instead of truncating", () => {
    const existing = Array.from({ length: 100 }, (_, index) => ({
      id: `old-${index}`, createdAt: "2026-01-01T00:00:00.000Z", attempts: 0, title: "Viejo", patch: { requestId: `sync_old_${index}` }
    })) as PendingSyncItem[];
    expect(() => appendPendingSync({ ...initialData, pendingSync: existing }, identified("sync_new"))).toThrow(PendingSyncCapacityError);
    expect(existing).toHaveLength(100);
  });
});
