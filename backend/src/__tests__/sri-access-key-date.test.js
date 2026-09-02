const assert = require("node:assert/strict");
const test = require("node:test");
const { createAccessKey } = require("../sri/access-key");
const { validateAccessKeyIssueDate } = require("../sri/invoices");

const issuer = {
  ruc: "1723772099001",
  environment: "1",
  establishment: "002",
  emissionPoint: "010"
};

test("creates access keys using Ecuador date at a UTC day boundary", () => {
  const key = createAccessKey(new Date("2026-08-19T02:00:00.000Z"), issuer, "000000365");
  assert.equal(key.slice(0, 8), "18082026");
});

test("blocks an XML whose access-key date differs before contacting SRI", () => {
  const xml = "<factura><infoTributaria><claveAcceso>1908202601172377209900110020100000003651234567813</claveAcceso></infoTributaria><infoFactura><fechaEmision>18/08/2026</fechaEmision></infoFactura></factura>";
  assert.throws(() => validateAccessKeyIssueDate(xml), { code: "ACCESS_KEY_ISSUE_DATE_MISMATCH", statusCode: 400 });
});
