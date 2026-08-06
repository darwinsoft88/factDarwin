const assert = require("node:assert/strict");
const test = require("node:test");
const {
  appendSnapshotChanges,
  collectSnapshotChanges,
  hashPayload
} = require("../sync-change-log");

test("detecta altas, cambios y tombstones sin registrar entidades intactas", () => {
  const current = {
    clients: [{ id: "same", name: "Igual" }, { id: "update", name: "Antes" }, { id: "delete", name: "Borrar" }]
  };
  const final = {
    clients: [{ id: "same", name: "Igual" }, { id: "update", name: "Después" }, { id: "create", name: "Nuevo" }]
  };
  const changes = collectSnapshotChanges(current, final);
  assert.deepEqual(changes.map(({ entityId, action }) => ({ entityId, action })), [
    { entityId: "update", action: "UPSERT" },
    { entityId: "create", action: "UPSERT" },
    { entityId: "delete", action: "DELETE" }
  ]);
  assert.equal(changes[2].payload, null);
});

test("elimina credenciales del payload de usuarios", () => {
  const [change] = collectSnapshotChanges(
    { users: [] },
    { users: [{ id: "user-1", email: "u@example.com", passwordHash: "secret", token: "secret" }] }
  );
  assert.equal(change.payload.email, "u@example.com");
  assert.equal(change.payload.passwordHash, undefined);
  assert.equal(change.payload.token, undefined);
});

test("el feature flag apagado no consulta ni escribe", async () => {
  const client = { query: async () => { throw new Error("no debe consultar"); } };
  const result = await appendSnapshotChanges(client, {
    enabled: false,
    companyId: "company-1",
    currentData: {},
    finalData: { clients: [{ id: "client-1" }] }
  });
  assert.deepEqual(result, { enabled: false, reason: "GLOBAL_DISABLED", inserted: 0, transactionId: null });
});

test("registra versiones y metadatos dentro del cliente transaccional recibido", async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes("SELECT EXISTS")) return { rows: [{ exists: true }] };
      if (sql.includes("MAX(record_version)")) return { rows: [{ version: "4" }] };
      return { rows: [], rowCount: 1 };
    }
  };
  const result = await appendSnapshotChanges(client, {
    enabled: true,
    companyId: "company-1",
    currentData: { products: [] },
    finalData: { products: [{ id: "product-1", name: "Producto", operationId: "entity-operation-1" }] },
    requestId: "request-1",
    operationId: "operation-1",
    deviceId: "device-1",
    userId: "user-1",
    occurredAt: "2026-07-31T12:00:00.000Z",
    transactionId: "11111111-1111-4111-8111-111111111111"
  });
  assert.equal(result.inserted, 1);
  assert.equal(calls.length, 3);
  assert.equal(calls[2].params[0], "company-1");
  assert.equal(calls[2].params[5], 4);
  assert.equal(calls[2].params[8], "request-1");
  assert.equal(calls[2].params[9], "entity-operation-1");
  assert.equal(calls[2].params[14], "11111111-1111-4111-8111-111111111111");
});

test("el hash es determinista para propiedades en distinto orden", () => {
  assert.equal(hashPayload({ b: 2, a: { y: null, x: [1, 2] } }), hashPayload({ a: { x: [1, 2], y: null }, b: 2 }));
});

test("la recreacion conserva una version posterior al tombstone", async () => {
  const versions = [];
  const client = { async query(sql, params) {
    if (sql.includes("SELECT EXISTS")) return { rows: [{ exists: true }] };
    if (sql.includes("MAX(record_version)")) return { rows: [{ version: "3" }] };
    if (sql.includes("INSERT INTO sync_change_log")) versions.push(params[5]);
    return { rows: [], rowCount: 1 };
  } };
  await appendSnapshotChanges(client, { enabled: true, companyId: "c", currentData: { clients: [] }, finalData: { clients: [{ id: "x" }] } });
  assert.deepEqual(versions, [3]);
});
