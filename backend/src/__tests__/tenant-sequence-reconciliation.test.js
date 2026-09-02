const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { reconcileTenantDocumentSequences } = require("../tenant-sequence-reconciliation");

function clientFixture({ current = [], documents = [] } = {}) {
  const writes = [];
  const calls = [];
  return {
    writes,
    calls,
    client: {
      async query(sql, params) {
        calls.push({ sql, params });
        if (sql.includes('FROM document_sequences WHERE company_id')) return { rows: current };
        if (sql.includes('FROM sales') && sql.includes('UNION ALL')) return { rows: documents };
        if (sql.includes('INSERT INTO document_sequences')) {
          writes.push({
            companyId: params[1], documentType: params[2], establishment: params[3], emissionPoint: params[4],
            environment: params[5], currentValue: params[6]
          });
          return { rows: [] };
        }
        throw new Error(`SQL inesperado: ${sql}`);
      }
    }
  };
}

function scope(documentType, currentValue, overrides = {}) {
  return { documentType, environment: "1", establishment: "001", emissionPoint: "001", currentValue, ...overrides };
}

async function reconcile(options = {}) {
  const fixture = clientFixture(options);
  await reconcileTenantDocumentSequences(fixture.client, {
    companyId: options.companyId || "company-a",
    snapshotData: options.snapshotData || {},
    backupSequences: options.backupSequences || [],
    updatedAt: "2026-08-30T00:00:00.000Z"
  });
  return fixture;
}

test("actual 500 y backup 400 nunca retrocede", async () => {
  const result = await reconcile({ current: [scope("factura", 500)], backupSequences: [scope("factura", 400)] });
  assert.equal(result.writes[0].currentValue, 500);
});

test("backup 500 supera actual 400", async () => {
  const result = await reconcile({ current: [scope("factura", 400)], backupSequences: [scope("factura", 500)] });
  assert.equal(result.writes[0].currentValue, 500);
});

test("documentos restaurados 520 superan actual 400 y backup 450", async () => {
  const result = await reconcile({ current: [scope("factura", 400)], backupSequences: [scope("factura", 450)], documents: [scope("factura", 520)] });
  assert.equal(result.writes[0].currentValue, 520);
});

test("conserva un secuencial reservado mayor que los documentos", async () => {
  const result = await reconcile({ current: [scope("factura", 550)], documents: [scope("factura", 540)], backupSequences: [scope("factura", 500)] });
  assert.equal(result.writes[0].currentValue, 550);
});

test("backup V1 sin secuenciales conserva actual y compara snapshot", async () => {
  const result = await reconcile({
    current: [scope("factura", 500)],
    snapshotData: { issuer: { environment: "1", establishment: "001", emissionPoint: "001", sequential: 401 } }
  });
  assert.equal(result.writes.find((item) => item.documentType === "factura").currentValue, 500);
});

test("aísla empresas aunque compartan establecimiento y punto", async () => {
  const result = await reconcile({ companyId: "company-a", current: [scope("factura", 500)] });
  assert(result.calls.every((call) => !call.params || !call.params.includes("company-b")));
  assert(result.writes.every((item) => item.companyId === "company-a"));
});

test("mantiene ambientes, establecimientos, puntos y tipos independientes", async () => {
  const current = [
    scope("factura", 101),
    scope("factura", 202, { environment: "2" }),
    scope("factura", 303, { establishment: "002", emissionPoint: "003" }),
    scope("nota_credito", 404),
    scope("guia_remision", 505)
  ];
  const result = await reconcile({ current });
  assert.equal(result.writes.length, 5);
  assert.deepEqual(new Set(result.writes.map((item) => `${item.documentType}:${item.environment}:${item.establishment}:${item.emissionPoint}`)).size, 5);
  assert.deepEqual(result.writes.map((item) => item.currentValue).sort((a, b) => a - b), [101, 202, 303, 404, 505]);
});

test("restore ejecuta reconciliacion dentro de BEGIN y antes de COMMIT", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "db-postgres.js"), "utf8");
  const restoreStart = source.indexOf("async function restoreTenantSnapshot");
  const restoreEnd = source.indexOf("async function", restoreStart + 30);
  const restore = source.slice(restoreStart, restoreEnd);
  assert(restore.indexOf('client.query("BEGIN")') < restore.indexOf("reconcileTenantDocumentSequences"));
  assert(restore.indexOf("reconcileTenantDocumentSequences") < restore.indexOf('client.query("COMMIT")'));
  assert.doesNotMatch(source, /DELETE FROM document_sequences WHERE company_id = \$1/);
});
