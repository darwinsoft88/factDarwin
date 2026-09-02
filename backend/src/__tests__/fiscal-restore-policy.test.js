"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { reconcileFiscalDocumentsForRestore } = require("../fiscal-restore-policy");

const key = (sequence, suffix = "1") => `3008202601${suffix.padStart(13, "0")}1${"001001"}${String(sequence).padStart(9, "0")}123456781`;
const invoice = (overrides = {}) => ({
  id: "invoice-371",
  documentType: "factura",
  environment: "1",
  establishment: "001",
  emissionPoint: "001",
  sequence: "371",
  accessKey: key(371),
  status: "AUTORIZADA",
  authorizationNumber: "AUTH-371",
  authorizationDate: "2026-08-30T10:00:00Z",
  authorizedXml: "<autorizacion>371</autorizacion>",
  items: [{ id: "item-1", description: "Servicio", quantity: 1 }],
  ...overrides
});

test("A) AUTORIZADA actual prevalece sobre ENVIADA", () => {
  const result = reconcileFiscalDocumentsForRestore({ sales: [invoice()] }, { sales: [invoice({ status: "ENVIADA", authorizationNumber: "", authorizedXml: "" })] });
  assert.equal(result.sales[0].status, "AUTORIZADA");
});

test("B) AUTORIZADA actual prevalece sobre BORRADOR", () => {
  const result = reconcileFiscalDocumentsForRestore({ sales: [invoice()] }, { sales: [invoice({ status: "BORRADOR" })] });
  assert.equal(result.sales[0].status, "AUTORIZADA");
});

test("C) AUTORIZADA actual ausente del backup permanece", () => {
  const result = reconcileFiscalDocumentsForRestore({ sales: [invoice()] }, { sales: [] });
  assert.deepEqual(result.sales, [invoice()]);
});

test("D) AUTORIZADA del backup prevalece sobre actual inferior", () => {
  const result = reconcileFiscalDocumentsForRestore({ sales: [invoice({ status: "ENVIADA", authorizedXml: "" })] }, { sales: [invoice()] });
  assert.equal(result.sales[0].status, "AUTORIZADA");
  assert.equal(result.sales[0].authorizedXml, invoice().authorizedXml);
});

test("E-F) dos AUTORIZADA se complementan sin perder evidencia fiscal", () => {
  const current = invoice({ sriResponse: { estado: "AUTORIZADO" } });
  const backup = invoice({ authorizationDate: "", sriMessages: ["RECIBIDA"] });
  const result = reconcileFiscalDocumentsForRestore({ sales: [current] }, { sales: [backup] }).sales[0];
  assert.equal(result.authorizationNumber, "AUTH-371");
  assert.equal(result.accessKey, current.accessKey);
  assert.equal(result.authorizedXml, current.authorizedXml);
  assert.deepEqual(result.sriMessages, ["RECIBIDA"]);
  assert.deepEqual(result.sriResponse, { estado: "AUTORIZADO" });
});

test("G-H) conserva items y el documento en el snapshot reconciliado", () => {
  const result = reconcileFiscalDocumentsForRestore({ sales: [invoice()] }, { sales: [] });
  assert.equal(result.sales[0].items[0].id, "item-1");
  assert.equal(result.sales[0].status, "AUTORIZADA");
});

test("I) nota de crédito AUTORIZADA no se degrada", () => {
  const current = invoice({ id: "nc-8", documentType: "nota_credito", sequence: "8", accessKey: key(8, "4") });
  const backup = { ...current, status: "ERROR_SRI", authorizedXml: "" };
  const result = reconcileFiscalDocumentsForRestore({ sales: [current] }, { sales: [backup] });
  assert.equal(result.sales[0].status, "AUTORIZADA");
});

test("J) guía AUTORIZADA no se degrada", () => {
  const current = invoice({ id: "guide-9", documentType: undefined, sequence: "9", accessKey: key(9, "6") });
  const backup = { ...current, status: "EN_REVISION_SRI", authorizedXml: "" };
  const result = reconcileFiscalDocumentsForRestore({ guides: [current] }, { guides: [backup] });
  assert.equal(result.guides[0].status, "AUTORIZADA");
});

test("K) la política solo recibe y devuelve el snapshot del tenant restaurado", () => {
  const companyA = invoice({ id: "a" });
  const companyB = invoice({ id: "b", sequence: "999", accessKey: key(999) });
  const result = reconcileFiscalDocumentsForRestore({ sales: [companyA] }, { sales: [] });
  assert.deepEqual(result.sales.map((sale) => sale.id), ["a"]);
  assert.equal(result.sales.some((sale) => sale.id === companyB.id), false);
});

test("L) mismo id con accessKey incompatible aborta", () => {
  assert.throws(
    () => reconcileFiscalDocumentsForRestore(
      { sales: [invoice()] },
      { sales: [invoice({ accessKey: key(372), sequence: "372" })] }
    ),
    (error) => error.code === "TENANT_RESTORE_FISCAL_CONFLICT" && error.statusCode === 409
  );
});

test("dos AUTORIZADA con autorización incompatible abortan", () => {
  assert.throws(
    () => reconcileFiscalDocumentsForRestore({ sales: [invoice()] }, { sales: [invoice({ authorizationNumber: "OTRA" })] }),
    (error) => error.code === "TENANT_RESTORE_FISCAL_CONFLICT"
  );
});

test("M-O) restore reconcilia antes de guardar, normalizar y secuenciar dentro de BEGIN/COMMIT", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "db-postgres.js"), "utf8");
  const start = source.indexOf("async function restoreTenantSnapshot");
  const end = source.indexOf("async function getDomainOperation", start);
  const restore = source.slice(start, end);
  const begin = restore.indexOf('client.query("BEGIN")');
  const reconcile = restore.indexOf("reconcileFiscalDocumentsForRestore");
  const snapshotWrite = restore.indexOf("INSERT INTO saas_snapshots");
  const normalize = restore.indexOf("syncNormalizedTables");
  const sequences = restore.indexOf("reconcileTenantDocumentSequences");
  const commit = restore.indexOf('client.query("COMMIT")');
  const rollback = restore.indexOf('client.query("ROLLBACK")');
  assert.ok(begin < reconcile && reconcile < snapshotWrite);
  assert.ok(snapshotWrite < normalize && normalize < sequences && sequences < commit);
  assert.ok(commit < rollback);
  assert.match(restore, /SELECT data FROM saas_snapshots WHERE company_id = \$1 FOR UPDATE/);
  assert.match(restore, /validateSnapshot\(restoredData\)/);
});

test("restore viejo conserva BORRADOR, ENVIADA y ERROR_SRI actuales ausentes", () => {
  const current = [
    invoice({ id: "draft", status: "BORRADOR", sequence: "401", accessKey: "" }),
    invoice({ id: "sent", status: "ENVIADA", sequence: "402", accessKey: "" }),
    invoice({ id: "error", status: "ERROR_SRI", sequence: "403", accessKey: "", sriMessage: "Error durable" })
  ];
  const result = reconcileFiscalDocumentsForRestore({ sales: current }, { sales: [] });
  assert.deepEqual(result.sales.map((sale) => sale.id), ["draft", "sent", "error"]);
  assert.equal(result.sales.find((sale) => sale.id === "error").sriMessage, "Error durable");
});

test("tombstone actual de guide impide revivir backup viejo", () => {
  const oldGuide = invoice({ id: "guide-deleted", status: "BORRADOR", accessKey: "" });
  const result = reconcileFiscalDocumentsForRestore(
    { guides: [], deletedIds: { guides: [oldGuide.id] } },
    { guides: [oldGuide], deletedIds: {} }
  );
  assert.equal(result.guides.length, 0);
  assert.deepEqual(result.deletedIds.guides, [oldGuide.id]);
});

test("guide actual recreada prevalece sobre tombstone antiguo del backup", () => {
  const recreated = invoice({ id: "guide-recreated", status: "BORRADOR", accessKey: "" });
  const result = reconcileFiscalDocumentsForRestore(
    { guides: [recreated], deletedIds: { guides: [] } },
    { guides: [], deletedIds: { guides: [recreated.id] } }
  );
  assert.equal(result.guides[0].id, recreated.id);
  assert.deepEqual(result.deletedIds.guides, []);
});

test("tombstone incompatible con guide AUTORIZADA aborta", () => {
  const authorized = invoice({ id: "guide-authorized" });
  assert.throws(
    () => reconcileFiscalDocumentsForRestore(
      { guides: [authorized], deletedIds: { guides: [authorized.id] } },
      { guides: [] }
    ),
    (error) => error.code === "TENANT_RESTORE_FISCAL_CONFLICT"
  );
});

test("auditoria actual posterior se conserva y se deduplica por id", () => {
  const result = reconcileFiscalDocumentsForRestore(
    { auditLogs: [{ id: "current", event: "CURRENT" }, { id: "same", event: "NEW" }] },
    { auditLogs: [{ id: "old", event: "OLD" }, { id: "same", event: "OLD_VERSION" }] }
  );
  assert.deepEqual(result.auditLogs.map((log) => `${log.id}:${log.event}`), ["old:OLD", "same:NEW", "current:CURRENT"]);
});

test("restore repetido produce el mismo resultado", () => {
  const current = { sales: [invoice({ id: "later", status: "ENVIADA" })], deletedIds: { guides: ["gone"] }, auditLogs: [{ id: "audit", event: "X" }] };
  const backup = { sales: [], guides: [invoice({ id: "gone", status: "BORRADOR", accessKey: "" })], auditLogs: [] };
  const first = reconcileFiscalDocumentsForRestore(current, backup);
  const second = reconcileFiscalDocumentsForRestore(first, backup);
  assert.deepEqual(second, first);
});
