const assert = require("node:assert/strict");
const test = require("node:test");
const { applyCanonicalIssuerEnvironment, applySnapshotPatch, environmentVersion } = require("../db-utils");

function snapshot(environment, version) {
  return {
    issuer: { environment, environmentVersion: version, establishment: "001", emissionPoint: "001", sequential: 1 },
    users: [], clients: [], products: [], sales: [], guides: [], receivedRetentions: [], cashClosings: [], inventoryMovements: [], auditLogs: []
  };
}

test("un snapshot viejo no degrada el ambiente canonico", () => {
  const current = snapshot("1", 4);
  const incoming = snapshot("2", 1);
  const merged = applySnapshotPatch(current, { ...incoming, baseData: current, issuer: incoming.issuer });
  assert.equal(merged.issuer.environment, "1");
  assert.equal(merged.issuer.environmentVersion, 4);
});

test("sincronizaciones repetidas preservan exactamente ambiente y version", () => {
  const current = snapshot("2", 8);
  const once = applySnapshotPatch(current, { baseData: current, issuer: { ...current.issuer } });
  const twice = applySnapshotPatch(once, { baseData: once, issuer: { ...current.issuer } });
  assert.deepEqual({ environment: twice.issuer.environment, version: twice.issuer.environmentVersion }, { environment: "2", version: 8 });
});

test("snapshots legacy se inicializan logicamente en version uno", () => {
  const current = snapshot("1", undefined);
  const next = applyCanonicalIssuerEnvironment(current, snapshot("2", 99));
  assert.equal(next.issuer.environment, "1");
  assert.equal(next.issuer.environmentVersion, 1);
  assert.equal(environmentVersion(undefined), 1);
});

test("el aislamiento depende del snapshot empresarial recibido", () => {
  const companyA = applyCanonicalIssuerEnvironment(snapshot("1", 3), snapshot("2", 1));
  const companyB = applyCanonicalIssuerEnvironment(snapshot("2", 7), snapshot("1", 1));
  assert.deepEqual([companyA.issuer.environment, companyA.issuer.environmentVersion], ["1", 3]);
  assert.deepEqual([companyB.issuer.environment, companyB.issuer.environmentVersion], ["2", 7]);
});
