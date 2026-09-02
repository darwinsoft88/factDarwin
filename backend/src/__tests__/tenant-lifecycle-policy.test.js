const test = require("node:test");
const assert = require("node:assert/strict");
const { tenantDeletionAssessment } = require("../tenant-lifecycle-policy");

test("permite eliminar una cuenta inicial con solo Consumidor Final", () => {
  const result = tenantDeletionAssessment({ users: 1, clients: 1, establishments: 1 });
  assert.equal(result.canDeletePermanently, true);
  assert.equal(result.mustArchive, false);
});

test("protege una empresa que emitio documentos fiscales", () => {
  const result = tenantDeletionAssessment({ clients: 1, sales: 1 });
  assert.equal(result.canDeletePermanently, false);
  assert.equal(result.mustArchive, true);
});

test("no elimina una cuenta con datos operativos o activos", () => {
  const result = tenantDeletionAssessment({ clients: 2, products: 1 }, { certificate: { configured: true } });
  assert.equal(result.canDeletePermanently, false);
  assert.equal(result.mustArchive, false);
  assert.equal(result.hasCertificate, true);
});
