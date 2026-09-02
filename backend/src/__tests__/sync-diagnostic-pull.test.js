const assert = require("node:assert/strict");
const test = require("node:test");
const { buildPullDiagnosticConfig, evaluatePullDiagnosticAccess } = require("../sync-pull-config");
const { decodeCursor, diagnosticPull, encodeCursor, initialCursor, parseLimit } = require("../sync-diagnostic-pull");

function config(overrides = {}) {
  return { ...buildPullDiagnosticConfig({
    NODE_ENV: "test", INCREMENTAL_SYNC_PULL_DIAGNOSTIC_ENABLED: "true", INCREMENTAL_SYNC_PULL_MODE: "diagnostic",
    INCREMENTAL_SYNC_PULL_CONFIG_VERSION: "1", INCREMENTAL_SYNC_PULL_COMPANY_IDS: "company", INCREMENTAL_SYNC_PULL_CURSOR_SECRET: "x".repeat(32)
  }, "jwt"), ...overrides };
}

function rows(count) {
  return Array.from({ length: count }, (_, index) => ({ changeSeq: index + 1, module: "clients", entityType: "client", entityId: `c${index}`, action: "UPSERT", recordVersion: 1, payloadHash: "a".repeat(64), payload: { id: `c${index}` }, origin: "incremental_merge", occurredAt: new Date(0), isTombstone: false }));
}

test("configuracion queda apagada y exige allowlist", () => {
  assert.equal(buildPullDiagnosticConfig({}, "jwt").enabled, false);
  assert.equal(evaluatePullDiagnosticAccess(config(), "company").enabled, true);
  assert.equal(evaluatePullDiagnosticAccess(config(), "other").reason, "COMPANY_REJECTED");
});

test("cursor firmado valida empresa, protocolo, futuro, expiracion y manipulacion", () => {
  const c = config();
  const value = encodeCursor(initialCursor("company", 10, c), c.cursorSecret);
  assert.equal(decodeCursor(value, { companyId: "company", config: c, maximumSeq: 10 }).watermark, 10);
  assert.throws(() => decodeCursor(`${value}x`, { companyId: "company", config: c, maximumSeq: 10 }), { code: "SYNC_CURSOR_INVALID" });
  assert.throws(() => decodeCursor(value, { companyId: "other", config: c, maximumSeq: 10 }), { code: "SYNC_CURSOR_COMPANY_MISMATCH" });
  const wrongProtocol = encodeCursor({ ...initialCursor("company", 10, c), protocolVersion: 2 }, c.cursorSecret);
  assert.throws(() => decodeCursor(wrongProtocol, { companyId: "company", config: c, maximumSeq: 10 }), { code: "SYNC_CURSOR_PROTOCOL_UNSUPPORTED" });
  assert.throws(() => decodeCursor(value, { companyId: "company", config: c, maximumSeq: 9 }), { code: "SYNC_CURSOR_FUTURE" });
  assert.throws(() => decodeCursor(value, { companyId: "company", config: { ...c, minimumAvailableSequence: 1 }, maximumSeq: 10 }), { code: "SYNC_CURSOR_EXPIRED" });
});

test("limites invalidos se rechazan", () => {
  assert.equal(parseLimit(undefined, config()), 100);
  assert.throws(() => parseLimit("501", config()), { code: "SYNC_PULL_INVALID_LIMIT" });
  assert.throws(() => parseLimit("x", config()), { code: "SYNC_PULL_INVALID_LIMIT" });
});

test("pagina, repeticion, hasMore, lote vacio y tombstone son estables", async () => {
  const all = rows(3);
  all[2] = { ...all[2], action: "DELETE", payload: null, isTombstone: true };
  const repository = {
    maximumSequence: async () => 3,
    listChanges: async ({ after, watermark, limit }) => all.filter((row) => row.changeSeq > after && row.changeSeq <= watermark).slice(0, limit)
  };
  const first = await diagnosticPull(repository, { config: config(), companyId: "company", limit: "2" });
  assert.deepEqual(first.changes.map((item) => item.sequence), [1, 2]);
  assert.equal(first.hasMore, true);
  const repeated = await diagnosticPull(repository, { config: config(), companyId: "company", limit: "2", cursor: first.fromCursor });
  assert.deepEqual(repeated.changes, first.changes);
  assert.equal(repeated.nextCursor, first.nextCursor);
  const second = await diagnosticPull(repository, { config: config(), companyId: "company", limit: "2", cursor: first.nextCursor });
  assert.equal(second.changes[0].payload, null);
  assert.equal(second.changes[0].isTombstone, true);
  const empty = await diagnosticPull(repository, { config: config(), companyId: "company", cursor: second.nextCursor });
  assert.equal(empty.changeCount, 0);
});

test("rechaza filtro modular y sanitiza usuarios", async () => {
  const repository = { maximumSequence: async () => 1, listChanges: async () => [{ ...rows(1)[0], entityType: "user", payload: { id: "u", email: "a@b.c", passwordHash: "secret", token: "secret" } }] };
  await assert.rejects(diagnosticPull(repository, { config: config(), companyId: "company", modules: "clients" }), { code: "SYNC_MODULE_FILTER_UNSUPPORTED" });
  const result = await diagnosticPull(repository, { config: config(), companyId: "company" });
  assert.equal(result.changes[0].payload.passwordHash, undefined);
  assert.equal(result.changes[0].payload.token, undefined);
});

test("respeta maximo de bytes sin adelantar cursor", async () => {
  const all = rows(2).map((row) => ({ ...row, payload: { id: row.entityId, text: "x".repeat(100) } }));
  const repository = { maximumSequence: async () => 2, listChanges: async () => all };
  const limitedConfig = config({ maxResponseBytes: 1200 });
  const result = await diagnosticPull(repository, { config: limitedConfig, companyId: "company" });
  assert.equal(result.changeCount, 1);
  assert.equal(decodeCursor(result.nextCursor, { companyId: "company", config: limitedConfig, maximumSeq: 2 }).lastChangeSeq, 1);
});

test("modo piloto renueva watermark y avanza sobre modulos fuera de alcance", async () => {
  const c = config();
  const old = encodeCursor({ ...initialCursor("company", 1, c), lastChangeSeq: 1 }, c.cursorSecret);
  const all = [{ ...rows(1)[0], changeSeq: 2, entityType: "sale", module: "sales" }, { ...rows(1)[0], changeSeq: 3, entityId: "new" }];
  const repository = { maximumSequence: async () => 3, listChanges: async ({ after, watermark, entityTypes }) => all.filter((row) => row.changeSeq > after && row.changeSeq <= watermark && (!entityTypes || entityTypes.includes(row.entityType))) };
  const result = await diagnosticPull(repository, { config: c, companyId: "company", cursor: old, accessGranted: true, mode: "pilot", entityTypes: ["client", "product"], rollingWatermark: true, advanceToWatermarkWhenExhausted: true });
  assert.deepEqual(result.changes.map((item) => item.sequence), [3]);
  assert.equal(result.fromCursor, old);
  assert.equal(decodeCursor(result.nextCursor, { companyId: "company", config: c, maximumSeq: 3 }).lastChangeSeq, 3);
});

test("V1 atraviesa paginas de guides sin entregarlas y V2 si las consume", async () => {
  const c = config();
  const all = [
    { ...rows(1)[0], changeSeq: 1, entityType: "client" },
    { ...rows(1)[0], changeSeq: 2, entityType: "remission_guide", module: "guides" },
    { ...rows(1)[0], changeSeq: 3, entityType: "product" },
    { ...rows(1)[0], changeSeq: 4, entityType: "remission_guide", module: "guides" },
    { ...rows(1)[0], changeSeq: 5, entityType: "client" }
  ];
  const repository = {
    maximumSequence: async () => 5,
    listChanges: async ({ after, watermark, limit, entityTypes }) => all.filter((row) => row.changeSeq > after && row.changeSeq <= watermark && (!entityTypes || entityTypes.includes(row.entityType))).slice(0, limit)
  };
  const v1 = await diagnosticPull(repository, { config: c, companyId: "company", accessGranted: true, entityTypes: ["client", "product"], protocolVersion: 1, advanceToWatermarkWhenExhausted: true });
  assert.deepEqual(v1.changes.map((item) => item.sequence), [1, 3, 5]);
  assert.equal(decodeCursor(v1.nextCursor, { companyId: "company", config: c, maximumSeq: 5, protocolVersion: 1 }).lastChangeSeq, 5);
  const v2 = await diagnosticPull(repository, { config: c, companyId: "company", accessGranted: true, entityTypes: ["client", "product", "remission_guide"], protocolVersion: 2 });
  assert.deepEqual(v2.changes.map((item) => item.sequence), [1, 2, 3, 4, 5]);
  assert.equal(v2.protocolVersion, 2);
});

test("V1 avanza al watermark cuando el intervalo contiene exclusivamente guides", async () => {
  const c = config();
  const repository = { maximumSequence: async () => 2, listChanges: async () => [] };
  const result = await diagnosticPull(repository, { config: c, companyId: "company", accessGranted: true, entityTypes: ["client", "product"], protocolVersion: 1, advanceToWatermarkWhenExhausted: true });
  assert.equal(result.changeCount, 0);
  assert.equal(result.hasMore, false);
  assert.equal(decodeCursor(result.nextCursor, { companyId: "company", config: c, maximumSeq: 2, protocolVersion: 1 }).lastChangeSeq, 2);
});
