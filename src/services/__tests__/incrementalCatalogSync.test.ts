import crypto from "crypto";
import { initialData } from "../../database/storage";
import type { IncrementalChange } from "../backendApi/incrementalSync";
import { hashIncrementalPayload, incrementalPilotEnabledForPlatform, prepareIncrementalBatch } from "../incrementalCatalogSync";
import type { IncrementalCursorState } from "../incrementalCursorStorage";

jest.mock("expo-crypto", () => ({ CryptoDigestAlgorithm: { SHA256: "SHA-256" }, digestStringAsync: async (_algorithm: string, value: string) => crypto.createHash("sha256").update(value).digest("hex") }));
jest.mock("react-native", () => ({ Platform: { OS: "android" } }));

const state = (): IncrementalCursorState => ({ companyId: "company", protocolVersion: 1, configVersion: "1", moduleSet: "clients+products", cursor: "cursor", snapshotRevision: 1, versions: {}, savedAt: "2026-08-01T00:00:00.000Z" });
const stateV2 = (): IncrementalCursorState => ({ ...state(), protocolVersion: 2, moduleSet: "clients+products+guides" });
async function change(overrides: Partial<IncrementalChange> = {}): Promise<IncrementalChange> { const payload = overrides.payload === undefined ? { id: "c-new", name: "Nuevo", identification: "1", identificationType: "05", email: "", phone: "", address: "Ecuador" } : overrides.payload; return { sequence: 1, module: "clients", entityType: "client", entityId: "c-new", action: "UPSERT", recordVersion: 1, payloadHash: await hashIncrementalPayload(payload), payload, isTombstone: false, origin: "incremental_merge", occurredAt: "2026-08-01T00:00:00.000Z", ...overrides }; }

test("PWA exige un flag piloto independiente y explÃ­cito", () => {
  expect(incrementalPilotEnabledForPlatform("android", { pilot: "1" })).toBe(true);
  expect(incrementalPilotEnabledForPlatform("web", { pilot: "1" })).toBe(false);
  expect(incrementalPilotEnabledForPlatform("web", { pilot: "1", webPilot: "1" })).toBe(true);
  expect(incrementalPilotEnabledForPlatform("ios", { pilot: "1", webPilot: "1" })).toBe(false);
  expect(incrementalPilotEnabledForPlatform("web", { pilot: "0", webPilot: "1" })).toBe(false);
});

test("aplica UPSERT y su repeticion es idempotente", async () => {
  const firstChange = await change();
  const first = await prepareIncrementalBatch(initialData, state(), [firstChange], "cursor", "cursor", 1);
  expect(first.data.clients.some((client) => client.id === "c-new")).toBe(true);
  const repeated = await prepareIncrementalBatch(first.data, first.state, [firstChange], "cursor", "cursor", 1);
  expect(repeated.changesApplied).toBe(0);
});

test("conserva metadata versionada de imagen al sincronizar un producto", async () => {
  const product = {
    ...initialData.products[0],
    id: "product-with-image",
    imageKey: "product-with-image/image.webp",
    imageVersion: "0123456789abcdef",
    imageUpdatedAt: "2026-09-02T15:30:00.000Z",
    imageMimeType: "image/webp" as const,
    updatedAt: "2026-09-02T15:30:00.000Z"
  };
  const upsert = await change({ entityType: "product", module: "products", entityId: product.id, payload: product, payloadHash: await hashIncrementalPayload(product) });
  const result = await prepareIncrementalBatch(initialData, state(), [upsert], "cursor", "cursor", 1);
  expect(result.data.products.find((item) => item.id === product.id)).toMatchObject({
    imageKey: product.imageKey,
    imageVersion: product.imageVersion,
    imageUpdatedAt: product.imageUpdatedAt,
    imageMimeType: "image/webp"
  });
});

test("aplica tombstone y evita resurreccion antigua", async () => {
  const baseState = state(); baseState.versions["product:p-servicio"] = { recordVersion: 1, payloadHash: "old", action: "UPSERT" };
  const deletion = await change({ entityType: "product", module: "products", entityId: "p-servicio", action: "DELETE", recordVersion: 2, payload: null, payloadHash: await hashIncrementalPayload(null), isTombstone: true });
  const removed = await prepareIncrementalBatch(initialData, baseState, [deletion], "cursor", "cursor", 1);
  expect(removed.data.products.some((product) => product.id === "p-servicio")).toBe(false);
  const old = await change({ entityType: "product", module: "products", entityId: "p-servicio", recordVersion: 1, payload: initialData.products[0], payloadHash: await hashIncrementalPayload(initialData.products[0]) });
  const ignored = await prepareIncrementalBatch(removed.data, removed.state, [old], "cursor", "cursor", 1);
  expect(ignored.data.products.some((product) => product.id === "p-servicio")).toBe(false);
});

test("rechaza hash, salto, mismo numero distinto y orden incorrecto sin aplicar parcialmente", async () => {
  await expect(prepareIncrementalBatch(initialData, state(), [{ ...(await change()), payloadHash: "bad" }], "cursor", "cursor", 1)).rejects.toMatchObject({ code: "SYNC_INCREMENTAL_HASH_MISMATCH" });
  await expect(prepareIncrementalBatch(initialData, state(), [await change({ recordVersion: 2 })], "cursor", "cursor", 1)).rejects.toMatchObject({ code: "SYNC_INCREMENTAL_VERSION_GAP" });
  const conflictState = state(); conflictState.versions["client:c-new"] = { recordVersion: 1, payloadHash: "other", action: "UPSERT" };
  await expect(prepareIncrementalBatch(initialData, conflictState, [await change()], "cursor", "cursor", 1)).rejects.toMatchObject({ code: "SYNC_INCREMENTAL_CONFLICT" });
  await expect(prepareIncrementalBatch(initialData, state(), [await change({ sequence: 2 }), await change({ sequence: 1, entityId: "c-other", payload: { ...(await change()).payload as object, id: "c-other" } })], "cursor", "cursor", 1)).rejects.toMatchObject({ code: "SYNC_BATCH_ORDER_INVALID" });
});

test("bloquea entidad con operacion local pendiente", async () => {
  const pendingPayload = (await change()).payload as Record<string, unknown>;
  const data = { ...initialData, pendingSync: [{ id: "p", title: "", description: "", createdAt: "", attempts: 0, patch: { clients: [{ ...pendingPayload } as never] } }] };
  await expect(prepareIncrementalBatch(data, state(), [await change()], "cursor", "cursor", 1)).rejects.toMatchObject({ code: "SYNC_INCREMENTAL_CONFLICT" });
});

test("V2 aplica UPSERT y DELETE de remission_guide de forma idempotente", async () => {
  const guide = { id: "g-1", sourceSaleId: "", clientId: "c-consumidor-final", userId: "u-admin", createdAt: "2026-08-30T00:00:00.000Z", sequence: "1", accessKey: "", status: "BORRADOR", transporterName: "T", transporterIdentification: "1", transporterIdentificationType: "05", plate: "ABC", startAddress: "A", endAddress: "B", route: "A-B", reason: "Venta", startDate: "2026-08-30", endDate: "2026-08-30", items: [] };
  const upsert = await change({ entityType: "remission_guide", module: "guides", entityId: guide.id, payload: guide, payloadHash: await hashIncrementalPayload(guide) });
  const inserted = await prepareIncrementalBatch(initialData, stateV2(), [upsert], "cursor", "cursor", 2);
  expect(inserted.data.guides.some((item) => item.id === guide.id)).toBe(true);
  const replay = await prepareIncrementalBatch(inserted.data, inserted.state, [upsert], "cursor", "cursor", 2);
  expect(replay.changesApplied).toBe(0);
  const deletion = await change({ entityType: "remission_guide", module: "guides", entityId: guide.id, action: "DELETE", recordVersion: 2, payload: null, payloadHash: await hashIncrementalPayload(null), isTombstone: true });
  const removed = await prepareIncrementalBatch(inserted.data, inserted.state, [deletion], "cursor", "cursor", 2);
  expect(removed.data.guides.some((item) => item.id === guide.id)).toBe(false);
  expect(removed.data.deletedIds?.guides).toContain(guide.id);
  const oldReplay = await prepareIncrementalBatch(removed.data, removed.state, [upsert], "cursor", "cursor", 2);
  expect(oldReplay.data.guides.some((item) => item.id === guide.id)).toBe(false);
});

test("V2 rechaza tombstone contra guide AUTORIZADA", async () => {
  const guide = { id: "g-auth", sourceSaleId: "", clientId: "c", userId: "u", createdAt: "2026-08-30", sequence: "1", accessKey: "1", status: "AUTORIZADA", transporterName: "T", transporterIdentification: "1", transporterIdentificationType: "05", plate: "A", startAddress: "A", endAddress: "B", route: "R", reason: "R", startDate: "2026-08-30", endDate: "2026-08-30", items: [] } as const;
  const data = { ...initialData, guides: [guide as never] };
  const deletion = await change({ entityType: "remission_guide", module: "guides", entityId: guide.id, action: "DELETE", payload: null, payloadHash: await hashIncrementalPayload(null), isTombstone: true });
  await expect(prepareIncrementalBatch(data, stateV2(), [deletion], "cursor", "cursor", 2)).rejects.toMatchObject({ code: "SYNC_AUTHORIZED_GUIDE_DELETE_CONFLICT" });
});
