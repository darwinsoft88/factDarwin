const test = require("node:test");
const assert = require("node:assert/strict");
const { renderMasterPanel } = require("../master-panel");

test("el panel maestro organiza las operaciones existentes en vistas laterales", () => {
  const html = renderMasterPanel();
  for (const view of ["overview", "companies", "license", "payments", "lifecycle", "backups"]) {
    assert.match(html, new RegExp(`id="view-${view}"`));
    assert.match(html, new RegExp(`data-view="${view}"`));
  }
  for (const requiredId of ["status", "output", "tenants", "licenseTitle", "lifecycleAssessment", "tenantBackupJson", "companySearch", "companyStatusFilter", "companyPrevious", "companyNext"]) {
    assert.equal((html.match(new RegExp(`id="${requiredId}"`, "g")) || []).length, 1);
  }
  for (const feature of ["Documents", "Clients", "Products", "Cash", "Credits", "Guides", "Users"]) {
    assert.match(html, new RegExp(`id="feature${feature}"`));
  }
  assert.match(html, /<details><summary>Ver diagnostico tecnico/);
  for (const paymentId of ["paymentAmount", "paymentPaidAt", "paymentMethod", "paymentStatus", "paymentsList", "paymentStatusModal", "paymentNewStatus", "paymentStatusReason", "paymentRenewalModal", "paymentRenewalPlan", "paymentReversalModal", "paymentReversalReason"]) {
    assert.match(html, new RegExp(`id="${paymentId}"`));
  }
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1] || "";
  assert.doesNotThrow(() => new Function(script));
});
