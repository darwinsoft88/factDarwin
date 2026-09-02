const assert = require("node:assert/strict");
const test = require("node:test");
const { resolveCertificateCredentials } = require("../sri/signXml");

test("uses the tenant certificate for an authenticated company", () => {
  const tenant = { p12Buffer: Buffer.from("tenant"), password: "secret" };
  const result = resolveCertificateCredentials("co-123", (companyId) => {
    assert.equal(companyId, "co-123");
    return tenant;
  });

  assert.equal(result.source, "tenant");
  assert.equal(result.p12Buffer, tenant.p12Buffer);
  assert.equal(result.password, "secret");
});

test("does not fall back to the global certificate when a tenant certificate is missing", () => {
  assert.throws(
    () => resolveCertificateCredentials("co-missing", () => null),
    (error) => {
      assert.equal(error.code, "TENANT_CERTIFICATE_NOT_FOUND");
      assert.equal(error.statusCode, 400);
      return true;
    }
  );
});
