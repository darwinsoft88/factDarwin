const test = require("node:test");
const assert = require("node:assert/strict");
const { certificateValidity } = require("../tenant-assets");

function certificate(notBefore, notAfter) {
  return { validity: { notBefore: new Date(notBefore), notAfter: new Date(notAfter) } };
}

const NOW = new Date("2026-08-21T12:00:00.000Z");

test("clasifica la vigencia de la firma con alertas a 30 y 7 dias", () => {
  assert.equal(certificateValidity(certificate("2026-01-01", "2026-10-01"), NOW).expirationStatus, "valid");
  assert.equal(certificateValidity(certificate("2026-01-01", "2026-09-10"), NOW).expirationStatus, "warning");
  assert.equal(certificateValidity(certificate("2026-01-01", "2026-08-25"), NOW).expirationStatus, "critical");
});

test("marca una firma vencida o que aun no entra en vigencia", () => {
  assert.equal(certificateValidity(certificate("2026-01-01", "2026-08-20"), NOW).expirationStatus, "expired");
  assert.equal(certificateValidity(certificate("2026-09-01", "2027-09-01"), NOW).expirationStatus, "not_yet_valid");
});

