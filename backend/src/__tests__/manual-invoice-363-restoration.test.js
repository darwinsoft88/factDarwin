const assert = require("node:assert/strict");
const test = require("node:test");
const {
  REQUIRED_CONFIRMATION,
  prepareInvoice363Restoration
} = require("../admin/manual-invoice-363-restoration");

const original = {
  id: "sale-363",
  companyId: "co-test",
  sequence: "000000363",
  status: "ERROR_SRI",
  inventoryState: "REVERSED",
  inventoryOperationId: "inventory-363",
  retryHistory: ["one", "two", "three"],
  sriMessage: "Codigo 39 - FIRMA INVALIDA",
  signedXml: "<factura/>",
  total: 25.35
};

test("363 requiere confirmacion administrativa exacta", () => {
  assert.throws(() => prepareInvoice363Restoration({ sale: original, companyId: "co-test", confirmation: "" }), { code: "RESTORE_363_CONFIRMATION_REQUIRED" });
});

test("restaura solo estado terminal y auditoria, conservando reintentos e inventario", () => {
  const result = prepareInvoice363Restoration({
    sale: original,
    companyId: "co-test",
    confirmation: REQUIRED_CONFIRMATION,
    now: "2026-08-19T12:00:00.000Z",
    auditId: "audit-363"
  });
  assert.equal(result.restoredSale.status, "ANULADA");
  assert.equal(result.restoredSale.inventoryState, "REVERSED");
  assert.equal(result.restoredSale.inventoryOperationId, original.inventoryOperationId);
  assert.deepEqual(result.restoredSale.retryHistory, original.retryHistory);
  assert.equal(result.restoredSale.signedXml, original.signedXml);
  assert.equal(result.restoredSale.total, original.total);
  assert.equal(result.audit.event, "INVOICE_363_TERMINAL_STATUS_RESTORED");
  assert.equal(result.audit.metadata.sriOperation, "NONE");
});

test("la accion 363 rechaza cualquier otra factura e inventario no revertido", () => {
  assert.throws(() => prepareInvoice363Restoration({ sale: { ...original, sequence: "000000364" }, companyId: "co-test", confirmation: REQUIRED_CONFIRMATION }), { code: "RESTORE_363_WRONG_SEQUENCE" });
  assert.throws(() => prepareInvoice363Restoration({ sale: { ...original, inventoryState: "APPLIED" }, companyId: "co-test", confirmation: REQUIRED_CONFIRMATION }), { code: "RESTORE_363_INVENTORY_INVALID" });
});
