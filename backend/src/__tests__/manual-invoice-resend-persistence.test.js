const assert = require("node:assert/strict");
const test = require("node:test");
const { buildAuthorizedRecoverySale, buildPendingRecoverySale } = require("../admin/manual-invoice-resend-persistence");

const current = {
  id: "sale-364",
  status: "ERROR_SRI",
  accessKey: "key-364",
  signedXml: "old-signed",
  inventoryState: "REVERSED",
  inventoryOperationId: "inventory-364",
  retryHistory: ["one", "two", "three"],
  items: [{ id: "line", quantity: 1 }],
  total: 1.4
};
const preflight = { originalFingerprint: "same", resignedFingerprint: "same", originalSigningTime: "future", newSigningTime: "correct" };

test("autorizacion conserva retryHistory y no aplica inventario", () => {
  const result = buildAuthorizedRecoverySale({
    current,
    original: current,
    signedXml: "new-signed",
    authorization: { authorizationNumber: "AUTH", authorizationDate: "date", authorizedXml: "authorized", sriEnvironment: "PRUEBAS", message: "AUTORIZADO" },
    preflight,
    recoveryPath: "RESIGNED_SINGLE_RECEPTION",
    now: "now"
  });
  assert.equal(result.status, "AUTORIZADA");
  assert.equal(result.inventoryState, "RECONCILIATION_PENDING");
  assert.equal(result.inventoryOperationId, current.inventoryOperationId);
  assert.deepEqual(result.retryHistory, current.retryHistory);
  assert.deepEqual(result.items, current.items);
  assert.equal(result.total, current.total);
  assert.equal(result.manualResendHistory.length, 1);
  assert.equal("inventoryMovements" in result, false);
});

test("autorizacion pendiente conserva REVERSED y bloquea otro reenvio mediante historial", () => {
  const result = buildPendingRecoverySale({
    current,
    original: current,
    signedXml: "new-signed",
    authorization: { status: "", message: "" },
    reception: { status: "RECIBIDA" },
    preflight,
    now: "now"
  });
  assert.equal(result.status, "ENVIADA");
  assert.equal(result.inventoryState, "REVERSED");
  assert.deepEqual(result.retryHistory, current.retryHistory);
  assert.equal(result.manualResendHistory[0].sentToReception, true);
});

test("cambio concurrente de estado, inventario, retryHistory, clave o XML bloquea persistencia", () => {
  const build = (changed) => buildAuthorizedRecoverySale({
    current: { ...current, ...changed }, original: current, signedXml: "new", authorization: { authorizationNumber: "AUTH", authorizedXml: "xml" }, preflight, recoveryPath: "RESIGNED_SINGLE_RECEPTION", now: "now"
  });
  for (const changed of [
    { status: "AUTORIZADA" },
    { inventoryState: "APPLIED" },
    { retryHistory: ["changed"] },
    { accessKey: "other" },
    { signedXml: "other" }
  ]) assert.throws(() => build(changed));
});
