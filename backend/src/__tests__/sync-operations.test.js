const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "factudarwin-sync-"));
process.env.DB_PATH = path.join(temporaryDirectory, "sync.db");
process.env.FACTUDARWIN_SKIP_DOTENV = "true";
delete process.env.DATABASE_URL;

const { createCompanyAccount, mergeSnapshotPatch, saveSnapshot } = require("../db");
const {
  MAX_SYNC_REQUEST_ID_LENGTH,
  hashSyncPayload,
  normalizeSyncRequestId,
  resolveSyncRequestId,
  stripSyncTransportFields
} = require("../db-utils");

function data(overrides = {}) {
  return {
    users: [], clients: [], products: [], sales: [], creditPayments: [], creditAdjustments: [],
    inventoryMovements: [], auditLogs: [], guides: [], cashClosings: [], receivedRetentions: [],
    issuer: { environment: "1", establishment: "001", emissionPoint: "001", sequential: 1, establishments: [] },
    ...overrides
  };
}

function operation(requestId, patch) {
  return { requestId, payloadHash: hashSyncPayload(patch), operationType: "SYNC_MERGE", operationId: null };
}

test("requestId se recorta, conserva mayusculas y valida longitud", () => {
  assert.equal(normalizeSyncRequestId("  Request-A  "), "Request-A");
  assert.equal(normalizeSyncRequestId("request-a"), "request-a");
  assert.equal(normalizeSyncRequestId(" "), null);
  assert.equal(normalizeSyncRequestId(123), null);
  assert.equal(normalizeSyncRequestId("x".repeat(MAX_SYNC_REQUEST_ID_LENGTH + 1)), null);
});

test("requestId admite header, body y ambos cuando coinciden", () => {
  assert.equal(resolveSyncRequestId(" header-id ", undefined, false), "header-id");
  assert.equal(resolveSyncRequestId(undefined, " body-id ", true), "body-id");
  assert.equal(resolveSyncRequestId("same-id", "same-id", true), "same-id");
  assert.equal(resolveSyncRequestId(undefined, undefined, false), null);
});

test("requestId distinto entre header y body produce conflicto 400", () => {
  assert.throws(
    () => resolveSyncRequestId("header-id", "body-id", true),
    (error) => error.code === "SYNC_REQUEST_ID_CONFLICT" && error.statusCode === 400
  );
});

test("hash canonico ignora requestId y orden de propiedades", () => {
  const first = { requestId: "one", sales: [{ id: "1", total: 2 }], issuer: { b: 2, a: 1 } };
  const second = { issuer: { a: 1, b: 2 }, sales: [{ total: 2, id: "1" }], requestId: "two" };
  assert.equal(hashSyncPayload(first), hashSyncPayload(second));
  assert.deepEqual(stripSyncTransportFields(first), { sales: first.sales, issuer: first.issuer });
});

test("hash canonico conserva el orden de arrays", () => {
  assert.notEqual(hashSyncPayload({ sales: [{ id: "1" }, { id: "2" }] }), hashSyncPayload({ sales: [{ id: "2" }, { id: "1" }] }));
});

test("flujo legacy sigue aplicando cada merge", async () => {
  await saveSnapshot(data());
  const first = await mergeSnapshotPatch({ clients: [{ id: "c1", identification: "1", name: "Uno" }] });
  const second = await mergeSnapshotPatch({ clients: [{ id: "c2", identification: "2", name: "Dos" }] });
  assert.equal(first.ok, true);
  assert.equal(second.summary.clients, 2);
});

test("replay con mismo requestId y hash devuelve exactamente el resultado almacenado", async () => {
  const patch = { clients: [{ id: "c3", identification: "3", name: "Tres" }] };
  const first = await mergeSnapshotPatch(patch, "", operation("request-replay", patch));
  const replay = await mergeSnapshotPatch(patch, "", operation("request-replay", patch));
  assert.deepEqual(replay, first);
});

test("dos envios concurrentes aplican una sola operación lógica", async () => {
  const patch = { clients: [{ id: "concurrent", identification: "30", name: "Concurrente" }] };
  const syncOperation = operation("request-concurrent", patch);
  const [first, second] = await Promise.all([
    mergeSnapshotPatch(patch, "", syncOperation),
    mergeSnapshotPatch(patch, "", syncOperation)
  ]);
  assert.deepEqual(second, first);
});

test("mismo requestId con otro hash produce conflicto estable", async () => {
  const firstPatch = { clients: [{ id: "c4", identification: "4", name: "Cuatro" }] };
  const secondPatch = { clients: [{ id: "c5", identification: "5", name: "Cinco" }] };
  await mergeSnapshotPatch(firstPatch, "", operation("request-mismatch", firstPatch));
  await assert.rejects(
    mergeSnapshotPatch(secondPatch, "", operation("request-mismatch", secondPatch)),
    (error) => error.code === "SYNC_OPERATION_MISMATCH" && error.statusCode === 409
  );
});

test("un merge fallido revierte también el registro de operación", async () => {
  const invalidPatch = { creditPayments: [{ id: "bad", amount: -1 }] };
  const requestId = "request-rollback";
  await assert.rejects(mergeSnapshotPatch(invalidPatch, "", operation(requestId, invalidPatch)));
  const validPatch = { clients: [{ id: "c6", identification: "6", name: "Seis" }] };
  const result = await mergeSnapshotPatch(validPatch, "", operation(requestId, validPatch));
  assert.equal(result.ok, true);
});

test("requestId no forma parte del snapshot semántico", async () => {
  const rawPatch = { requestId: "transport-only", clients: [{ id: "c7", identification: "7", name: "Siete" }] };
  const patch = stripSyncTransportFields(rawPatch);
  const result = await mergeSnapshotPatch(patch, "", operation(rawPatch.requestId, patch));
  assert.equal(result.summary.clients >= 1, true);
  assert.equal(Object.prototype.hasOwnProperty.call(patch, "requestId"), false);
});

test("el mismo requestId queda aislado por empresa", async () => {
  const companyOne = await createCompanyAccount({
    company: { ruc: "1790000001001", businessName: "Empresa Uno" },
    admin: { name: "Admin Uno", email: "one@example.com" },
    passwordHash: "hash-one",
    device: {}
  });
  const companyTwo = await createCompanyAccount({
    company: { ruc: "1790000002001", businessName: "Empresa Dos" },
    admin: { name: "Admin Dos", email: "two@example.com" },
    passwordHash: "hash-two",
    device: {}
  });
  const requestId = "shared-company-request";
  const firstPatch = { clients: [{ id: "tenant-c1", identification: "101", name: "Cliente Uno" }] };
  const secondPatch = { clients: [{ id: "tenant-c2", identification: "102", name: "Cliente Dos" }] };
  const first = await mergeSnapshotPatch(firstPatch, companyOne.company.id, operation(requestId, firstPatch));
  const second = await mergeSnapshotPatch(secondPatch, companyTwo.company.id, operation(requestId, secondPatch));
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
});
