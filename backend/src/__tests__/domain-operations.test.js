const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "factudarwin-domain-"));
process.env.DB_PATH = path.join(temporaryDirectory, "domain.db");
process.env.FACTUDARWIN_SKIP_DOTENV = "true";
delete process.env.DATABASE_URL;

const { createCompanyAccount, getDomainOperation, getSnapshot, mergeSnapshotPatch, registerOrReplayDomainOperation, saveSnapshot } = require("../db");
const { hashSyncPayload } = require("../db-utils");

function sale(overrides = {}) {
  return {
    id: "sale-1", clientId: "client-1", userId: "user-1", createdAt: "2026-07-01T00:00:00.000Z",
    sequence: "000000001", accessKey: "access-sale-1", subtotal: 100, tax: 0, total: 100,
    paymentMethod: "20", paymentCondition: "credito", creditBalance: 100, creditStatus: "pendiente",
    status: "AUTORIZADA", documentType: "factura", items: [], ...overrides
  };
}

function creditNote(overrides = {}) {
  return sale({ id: "note-1", sequence: "000000002", accessKey: "access-note-1", documentType: "nota_credito", paymentCondition: undefined, sourceSaleId: "sale-1", total: 10, ...overrides });
}

function data(overrides = {}) {
  return {
    users: [], clients: [], products: [], sales: [sale(), creditNote()], creditPayments: [], creditAdjustments: [],
    inventoryMovements: [], auditLogs: [], guides: [], cashClosings: [], receivedRetentions: [],
    issuer: { environment: "1", establishment: "001", emissionPoint: "001", sequential: 1, establishments: [] },
    ...overrides
  };
}

function payment(id, operationId, amount = 10, overrides = {}) {
  return {
    id, operationId, saleId: "sale-1", clientId: "client-1", userId: "user-1", userName: "User",
    amount, paymentMethod: "01", createdAt: "2026-07-02T00:00:00.000Z", ...overrides
  };
}

function adjustment(id, operationId, overrides = {}) {
  const value = {
    id, operationId, type: "CREDIT_NOTE", sourceCreditNoteId: "note-1", sourceSaleId: "sale-1",
    clientId: "client-1", amount: 10, state: "APPLIED", appliedAt: "2026-07-02T00:00:00.000Z",
    userId: "user-1", ...overrides
  };
  if (operationId === undefined) delete value.operationId;
  return value;
}

function request(requestId, patch) {
  return { requestId, payloadHash: hashSyncPayload(patch), operationType: "SYNC_MERGE", operationId: null };
}

test("modern payment is NEW, transport replay is exact, and another request is domain REPLAY", async () => {
  await saveSnapshot(data());
  const patch = { creditPayments: [payment("payment-1", "operation-1")] };
  const first = await mergeSnapshotPatch(patch, "", request("domain-r1", patch));
  assert.deepEqual(first.domainOperations.new.map((item) => item.operationId), ["operation-1"]);
  const transportReplay = await mergeSnapshotPatch(patch, "", request("domain-r1", patch));
  assert.deepEqual(transportReplay, first);
  const domainReplay = await mergeSnapshotPatch(patch, "", request("domain-r2", patch));
  assert.deepEqual(domainReplay.domainOperations.replayed.map((item) => item.operationId), ["operation-1"]);
  assert.equal((await getSnapshot()).data.creditPayments.length, 1);
});

test("rejects payload mismatch and another operation for the same entity", async () => {
  const mismatch = { creditPayments: [payment("payment-1", "operation-1", 11)] };
  await assert.rejects(mergeSnapshotPatch(mismatch, "", request("domain-r3", mismatch)), (error) => error.code === "DOMAIN_OPERATION_MISMATCH");
  const entityConflict = { creditPayments: [payment("payment-1", "operation-other")] };
  await assert.rejects(mergeSnapshotPatch(entityConflict, "", request("domain-r4", entityConflict)), (error) => error.code === "DOMAIN_ENTITY_OPERATION_CONFLICT");
});

test("accepts different payments on one sale and mixed replay plus NEW", async () => {
  const second = payment("payment-2", "operation-2", 15);
  const patch = { creditPayments: [payment("payment-1", "operation-1"), second] };
  const result = await mergeSnapshotPatch(patch, "", request("domain-r5", patch));
  assert.deepEqual(result.domainOperations.replayed.map((item) => item.operationId), ["operation-1"]);
  assert.deepEqual(result.domainOperations.new.map((item) => item.operationId), ["operation-2"]);
  assert.equal((await getSnapshot()).data.creditPayments.length, 2);
});

test("keeps legacy and modern payments in the same patch", async () => {
  const legacy = payment("payment-legacy", undefined, 5);
  delete legacy.operationId;
  const modern = payment("payment-3", "operation-3", 5);
  const patch = { creditPayments: [legacy, modern] };
  const result = await mergeSnapshotPatch(patch, "", request("domain-r6", patch));
  assert.deepEqual(result.domainOperations.new.map((item) => item.operationId), ["operation-3"]);
  assert.equal((await getSnapshot()).data.creditPayments.length, 4);
});

test("rolls back earlier domain claims when a later operation conflicts", async () => {
  const candidate = payment("payment-rollback", "operation-rollback", 5);
  const conflict = payment("payment-1", "operation-conflict", 10);
  const patch = { creditPayments: [candidate, conflict] };
  await assert.rejects(mergeSnapshotPatch(patch, "", request("domain-r7", patch)), (error) => error.code === "DOMAIN_ENTITY_OPERATION_CONFLICT");
  const retryPatch = { creditPayments: [candidate] };
  const retry = await mergeSnapshotPatch(retryPatch, "", request("domain-r8", retryPatch));
  assert.deepEqual(retry.domainOperations.new.map((item) => item.operationId), ["operation-rollback"]);
});

test("rolls back a domain claim when snapshot validation fails afterwards", async () => {
  const candidate = payment("payment-failed-merge", "operation-failed-merge", 5);
  const invalidLegacyAdjustment = adjustment("invalid-adjustment", undefined, { sourceSaleId: "missing-sale" });
  const patch = { creditPayments: [candidate], creditAdjustments: [invalidLegacyAdjustment] };
  await assert.rejects(mergeSnapshotPatch(patch, "", request("domain-r9", patch)));
  assert.equal(await getDomainOperation("", "CREDIT_PAYMENT_CREATE", "operation-failed-merge"), null);
});

test("stores an immutable result and keeps operation types independent", async () => {
  const stored = await getDomainOperation("", "CREDIT_PAYMENT_CREATE", "operation-1");
  assert.deepEqual(stored.resultJson, { status: "APPLIED", entityId: "payment-1", operationType: "CREDIT_PAYMENT_CREATE" });
  const typed = registerOrReplayDomainOperation("", {
    operationType: "CREDIT_PAYMENT_VOID", operationId: "operation-1", entityId: "payment-type-independent",
    payload: { paymentId: "payment-type-independent", voidedAt: "2026-07-03T00:00:00.000Z" }
  });
  assert.equal(typed.status, "NEW");
});

test("applies modern payment void and credit-adjustment reverse only once", async () => {
  const voidedPayment = payment("payment-1", "operation-1", 10, {
    voidOperationId: "void-operation-1",
    voidedAt: "2026-07-03T00:00:00.000Z",
    voidedByUserId: "user-1",
    voidedByUserName: "User",
    voidReason: "Correction"
  });
  const voidPatch = { creditPayments: [voidedPayment] };
  const voidResult = await mergeSnapshotPatch(voidPatch, "", request("domain-void-r1", voidPatch));
  assert.deepEqual(voidResult.domainOperations.new.map((item) => item.operationId), ["void-operation-1"]);
  assert.deepEqual(voidResult.domainOperations.replayed.map((item) => item.operationId), ["operation-1"]);

  const appliedAdjustment = adjustment("adjustment-reversible", "adjustment-operation-reversible", { amount: 1 });
  const applyPatch = { creditAdjustments: [appliedAdjustment] };
  await mergeSnapshotPatch(applyPatch, "", request("domain-adjustment-r1", applyPatch));
  const reversedAdjustment = { ...appliedAdjustment, state: "REVERSED", reversedAt: "2026-07-04T00:00:00.000Z", reverseOperationId: "adjustment-reverse-operation" };
  const reversePatch = { creditAdjustments: [reversedAdjustment] };
  const reverseResult = await mergeSnapshotPatch(reversePatch, "", request("domain-adjustment-r2", reversePatch));
  assert.deepEqual(reverseResult.domainOperations.new.map((item) => item.operationId), ["adjustment-reverse-operation"]);
  assert.deepEqual(reverseResult.domainOperations.replayed.map((item) => item.operationId), ["adjustment-operation-reversible"]);

  const replay = await mergeSnapshotPatch(reversePatch, "", request("domain-adjustment-r3", reversePatch));
  assert.equal(replay.domainOperations.new.length, 0);
  assert.deepEqual(replay.domainOperations.replayed.map((item) => item.operationId), ["adjustment-operation-reversible", "adjustment-reverse-operation"]);
  const snapshot = (await getSnapshot()).data;
  assert.equal(snapshot.creditPayments.find((item) => item.id === "payment-1").voidOperationId, "void-operation-1");
  assert.equal(snapshot.creditAdjustments.find((item) => item.id === "adjustment-reversible").state, "REVERSED");
});

test("isolates the same operation identity by company", async () => {
  const firstCompany = await createCompanyAccount({ company: { ruc: "1790000011001", businessName: "Domain One" }, admin: { name: "Admin", email: "domain-one@example.com" }, passwordHash: "hash", device: {} });
  const secondCompany = await createCompanyAccount({ company: { ruc: "1790000012001", businessName: "Domain Two" }, admin: { name: "Admin", email: "domain-two@example.com" }, passwordHash: "hash", device: {} });
  const descriptor = { operationType: "CREDIT_PAYMENT_CREATE", operationId: "shared-company-operation", entityId: "shared-payment", payload: { amount: 1 } };
  assert.equal(registerOrReplayDomainOperation(firstCompany.company.id, descriptor).status, "NEW");
  assert.equal(registerOrReplayDomainOperation(secondCompany.company.id, descriptor).status, "NEW");
});

test("rejects invalid operation and batch identities without generating replacements", async () => {
  const invalidId = { creditPayments: [payment("payment-invalid-id", " bad ")] };
  await assert.rejects(mergeSnapshotPatch(invalidId, "", request("domain-r10", invalidId)), (error) => error.code === "INVALID_DOMAIN_OPERATION_ID");
  const invalidBatch = { creditPayments: [payment("payment-invalid-batch", "operation-invalid-batch", 5, { batchOperationId: " bad " })] };
  await assert.rejects(mergeSnapshotPatch(invalidBatch, "", request("domain-r11", invalidBatch)), (error) => error.code === "INVALID_BATCH_OPERATION_ID");
  assert.throws(() => registerOrReplayDomainOperation("", { operationType: "ARBITRARY", operationId: "operation", entityId: "entity", payload: {} }), (error) => error.code === "INVALID_DOMAIN_OPERATION_TYPE");
});

test("rejects incompatible duplicates inside one patch before applying either", async () => {
  const patch = { creditPayments: [payment("duplicate-a", "duplicate-operation", 5), payment("duplicate-b", "duplicate-operation", 6)] };
  await assert.rejects(mergeSnapshotPatch(patch, "", request("domain-r12", patch)), (error) => error.code === "DOMAIN_OPERATION_MISMATCH");
  assert.equal(await getDomainOperation("", "CREDIT_PAYMENT_CREATE", "duplicate-operation"), null);
});

test("keeps legacy adjustments and protects modern adjustments", async () => {
  const legacy = adjustment("adjustment-legacy", undefined, { amount: 2 });
  const modern = adjustment("adjustment-modern", "adjustment-operation-modern", { amount: 3 });
  const patch = { creditAdjustments: [legacy, modern] };
  const first = await mergeSnapshotPatch(patch, "", request("domain-r13", patch));
  assert.deepEqual(first.domainOperations.new.map((item) => item.operationId), ["adjustment-operation-modern"]);
  const replay = await mergeSnapshotPatch(patch, "", request("domain-r14", patch));
  assert.deepEqual(replay.domainOperations.replayed.map((item) => item.operationId), ["adjustment-operation-modern"]);
  const storedIds = (await getSnapshot()).data.creditAdjustments.map((item) => item.id);
  assert.equal(storedIds.filter((id) => id === "adjustment-legacy").length, 1);
  assert.equal(storedIds.filter((id) => id === "adjustment-modern").length, 1);
});
