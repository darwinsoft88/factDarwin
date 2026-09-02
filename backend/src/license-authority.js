function preserveAuthoritativeLicense(incomingData, currentData) {
  if (!currentData?.license) return incomingData;
  return { ...incomingData, license: currentData.license };
}

function removeClientLicensePatch(incomingPatch) {
  if (!incomingPatch || typeof incomingPatch !== "object" || Array.isArray(incomingPatch)) {
    return { patch: incomingPatch, attempted: false };
  }
  const attempted = Object.prototype.hasOwnProperty.call(incomingPatch, "license");
  if (!attempted) return { patch: incomingPatch, attempted: false };
  const { license: _ignoredLicense, ...patch } = incomingPatch;
  return { patch, attempted: true };
}

module.exports = { preserveAuthoritativeLicense, removeClientLicensePatch };

