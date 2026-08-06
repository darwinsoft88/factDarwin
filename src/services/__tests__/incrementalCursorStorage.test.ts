const values = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({ getItem: jest.fn(async (key: string) => values.get(key) ?? null), setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }), getAllKeys: jest.fn(async () => [...values.keys()]) }));
import { loadIncrementalCursor, saveIncrementalCursor } from "../incrementalCursorStorage";

beforeEach(() => values.clear());
test("persiste cursor durable aislado por empresa", async () => {
  await saveIncrementalCursor({ companyId: "a", protocolVersion: 1, configVersion: "1", moduleSet: "clients+products", cursor: "cursor-a", snapshotRevision: 2, versions: {}, savedAt: "now" });
  expect((await loadIncrementalCursor("a", "1", "clients+products"))?.cursor).toBe("cursor-a");
  expect(await loadIncrementalCursor("b", "1", "clients+products")).toBeNull();
});
test("ignora estado corrupto o de otra empresa", async () => {
  const key = "factudarwin:incremental-cursor:v1:a:p1:1:clients+products";
  values.set(key, "{");
  expect(await loadIncrementalCursor("a", "1", "clients+products")).toBeNull();
  values.set(key, JSON.stringify({ companyId: "b", protocolVersion: 1, configVersion: "1", moduleSet: "clients+products", cursor: "x", versions: {} }));
  expect(await loadIncrementalCursor("a", "1", "clients+products")).toBeNull();
});
