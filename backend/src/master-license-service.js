function createMasterLicenseService({ getSnapshot, saveSnapshot, normalizeLicense, licenseStatus, logTechnical }) {
  async function getLegacyLicense() {
    const snapshot = await getSnapshot();
    return responseFromSnapshot(snapshot);
  }

  async function updateLegacyLicense(payload) {
    const snapshot = await getSnapshot();
    if (!snapshot?.data) throw httpError(409, "Primero suba una copia desde la app para crear la base inicial del cliente.");
    const license = normalizeLicense(payload);
    const result = await saveSnapshot({ ...snapshot.data, license });
    const status = licenseStatus({ license });
    logTechnical("info", "master_license_updated", { license: status, summary: result.summary });
    return { ok: true, license: status, updatedAt: result.updatedAt, summary: result.summary };
  }

  async function getTenantLicense(companyId) {
    const snapshot = await requiredTenantSnapshot(companyId);
    return { ok: true, companyId, ...responseFromSnapshot(snapshot) };
  }

  async function updateTenantLicense(companyId, payload, actor = {}) {
    const snapshot = await requiredTenantSnapshot(companyId);
    const license = normalizeLicense(payload);
    const result = await saveSnapshot({ ...snapshot.data, license }, companyId, {
      origin: "admin_operation",
      userId: actor.userId || null
    });
    const status = licenseStatus({ license });
    logTechnical("info", "tenant_license_updated", { companyId, license: status, summary: result.summary });
    return { ok: true, companyId, license: status, updatedAt: result.updatedAt, summary: result.summary };
  }

  async function requiredTenantSnapshot(companyId) {
    const snapshot = await getSnapshot(companyId);
    if (!snapshot?.data) throw httpError(404, "Empresa no encontrada.");
    return snapshot;
  }

  function responseFromSnapshot(snapshot) {
    return {
      license: licenseStatus(snapshot?.data || {}),
      summary: snapshot?.summary || null,
      updatedAt: snapshot?.updatedAt || ""
    };
  }

  return { getLegacyLicense, getTenantLicense, updateLegacyLicense, updateTenantLicense };
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = { createMasterLicenseService };

