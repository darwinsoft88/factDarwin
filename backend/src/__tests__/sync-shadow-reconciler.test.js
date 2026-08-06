const assert = require("node:assert/strict");
const test = require("node:test");
const { hashPayload } = require("../sync-change-log");
const { reconcileSyncShadow } = require("../sync-shadow-reconciler");

function mockClient({ snapshot, rows, normalizedCount = 0 }) {
  return { async query(sql) {
    if (sql.includes("FROM saas_snapshots")) return { rows: [{ data: snapshot, updated_at: new Date(0) }] };
    if (sql.includes("FROM sync_change_log")) return { rows };
    if (sql.includes("information_schema.columns")) return { rows: [{ available: true }] };
    if (sql.includes("COUNT(*)")) return { rows: [{ count: String(sql.includes("FROM clients") ? normalizedCount : 0) }] };
    throw new Error(`Consulta inesperada: ${sql}`);
  } };
}

function row(overrides = {}) {
  const payload = overrides.payload ?? { id: "c1", name: "Cliente" };
  return {
    change_seq: "1", module: "clients", entity_type: "client", entity_id: "c1",
    action: "UPSERT", record_version: "1", payload, payload_hash: hashPayload(payload),
    is_tombstone: false, origin: "shadow_baseline", ...overrides
  };
}

test("reconcilia snapshot y log equivalentes", async () => {
  const result = await reconcileSyncShadow(mockClient({ snapshot: { clients: [{ id: "c1", name: "Cliente" }] }, rows: [row()], normalizedCount: 1 }), "company");
  assert.equal(result.status, "consistent");
  assert.deepEqual(result.issues, []);
});

test("detecta cambio faltante, huerfano, hash alterado y salto de version", async () => {
  const result = await reconcileSyncShadow(mockClient({
    snapshot: { clients: [{ id: "expected", name: "Esperado" }] },
    rows: [row({ entity_id: "orphan", record_version: "2", payload_hash: "bad" })],
    normalizedCount: 1
  }), "company");
  const codes = result.issues.map((item) => item.code);
  for (const expected of ["MISSING_CHANGE", "ORPHAN_CHANGE", "PAYLOAD_HASH_MISMATCH", "RECORD_VERSION_GAP"]) assert.ok(codes.includes(expected));
});

test("detecta tombstone inconsistente sin reparar datos", async () => {
  const result = await reconcileSyncShadow(mockClient({
    snapshot: { clients: [{ id: "c1", name: "Cliente" }] },
    rows: [row({ action: "DELETE", payload: null, payload_hash: hashPayload(null), is_tombstone: true })],
    normalizedCount: 1
  }), "company");
  assert.ok(result.issues.some((item) => item.code === "LIVE_ENTITY_HAS_TOMBSTONE"));
});
