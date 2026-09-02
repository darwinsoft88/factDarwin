const PROTECTED_FISCAL_KEYS = ["sales", "guides", "creditPayments", "creditAdjustments", "receivedRetentions", "cashClosings"];
const USER_DATA_KEYS = ["products", "inventoryMovements", "pendingSync"];

function tenantDeletionAssessment(summary = {}, assets = {}) {
  const fiscalRecords = sum(summary, PROTECTED_FISCAL_KEYS);
  const userDataRecords = sum(summary, USER_DATA_KEYS) + Math.max(0, Number(summary.clients || 0) - 1);
  const hasCertificate = Boolean(assets.certificate?.configured || assets.certificate?.needsUpload);
  const hasLogo = Boolean(assets.logo?.configured);
  const reasons = [];
  if (fiscalRecords > 0) reasons.push("La empresa tiene documentos o movimientos que deben conservarse.");
  if (userDataRecords > 0) reasons.push("La empresa contiene catalogos o cambios operativos.");
  if (hasCertificate) reasons.push("La empresa tiene un certificado electronico almacenado.");
  if (hasLogo) reasons.push("La empresa tiene un logotipo almacenado.");
  return {
    canDeletePermanently: reasons.length === 0,
    mustArchive: fiscalRecords > 0,
    fiscalRecords,
    userDataRecords,
    hasCertificate,
    hasLogo,
    reasons
  };
}

function sum(summary, keys) {
  return keys.reduce((total, key) => total + Math.max(0, Number(summary[key] || 0)), 0);
}

module.exports = { tenantDeletionAssessment };
