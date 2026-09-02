function buildAuthorizedRecoverySale({ current, original, signedXml, authorization, preflight, recoveryPath, now }) {
  assertStillEligibleForPersistence(current, original);
  if (!authorization.authorizationNumber || !authorization.authorizedXml) throw persistenceError("MANUAL_RESEND_AUTHORIZATION_INCOMPLETE", "La autorizacion SRI esta incompleta y no se persistira.");
  return {
    ...current,
    status: "AUTORIZADA",
    accessKey: original.accessKey,
    authorizationNumber: authorization.authorizationNumber,
    authorizationDate: authorization.authorizationDate,
    sriEnvironment: authorization.sriEnvironment || current.sriEnvironment,
    sriMessage: authorization.message || `AUTORIZADA mediante recuperacion manual controlada (${recoveryPath}).`,
    signedXml,
    authorizedXml: authorization.authorizedXml,
    inventoryState: "RECONCILIATION_PENDING",
    inventoryOperationId: current.inventoryOperationId,
    retryHistory: Array.isArray(current.retryHistory) ? [...current.retryHistory] : [],
    manualResendHistory: recoveryHistory(current, { now, recoveryPath, preflight, sentToReception: recoveryPath === "RESIGNED_SINGLE_RECEPTION", result: "AUTORIZADA" }),
    updatedAt: now
  };
}

function buildPendingRecoverySale({ current, original, signedXml, authorization, reception, preflight, now }) {
  assertStillEligibleForPersistence(current, original);
  const status = authorization?.status === "NO AUTORIZADO" ? "ERROR_SRI" : "ENVIADA";
  return {
    ...current,
    status,
    signedXml,
    sriMessage: authorization?.message || reception?.message || "Recepcion aceptada; autorizacion pendiente. No reenviar nuevamente.",
    inventoryState: "REVERSED",
    inventoryOperationId: current.inventoryOperationId,
    retryHistory: Array.isArray(current.retryHistory) ? [...current.retryHistory] : [],
    manualResendHistory: recoveryHistory(current, { now, recoveryPath: "RESIGNED_SINGLE_RECEPTION", preflight, sentToReception: true, result: status }),
    updatedAt: now
  };
}

function assertStillEligibleForPersistence(current, original) {
  if (current.status === "AUTORIZADA") throw persistenceError("MANUAL_RESEND_ALREADY_AUTHORIZED", "La factura ya fue autorizada concurrentemente.");
  if (current.status !== "ERROR_SRI" || current.inventoryState !== "REVERSED") throw persistenceError("MANUAL_RESEND_STATE_CHANGED", "Estado o inventario cambiaron durante la recuperacion; no se persistira.");
  if (JSON.stringify(current.retryHistory || []) !== JSON.stringify(original.retryHistory || [])) throw persistenceError("MANUAL_RESEND_RETRY_HISTORY_CHANGED", "retryHistory cambio durante la recuperacion; no se persistira.");
  if (current.accessKey !== original.accessKey || current.signedXml !== original.signedXml) throw persistenceError("MANUAL_RESEND_DOCUMENT_CHANGED", "La clave o signedXml original cambiaron durante la recuperacion.");
}

function recoveryHistory(current, entry) {
  return [...(Array.isArray(current.manualResendHistory) ? current.manualResendHistory : []), {
    attemptedAt: entry.now,
    recoveryPath: entry.recoveryPath,
    originalFingerprint: entry.preflight.originalFingerprint,
    resignedFingerprint: entry.preflight.resignedFingerprint,
    originalSigningTime: entry.preflight.originalSigningTime,
    newSigningTime: entry.preflight.newSigningTime,
    sentToReception: entry.sentToReception,
    result: entry.result
  }];
}

function persistenceError(code, message) { const error = new Error(message); error.code = code; return error; }

module.exports = { assertStillEligibleForPersistence, buildAuthorizedRecoverySale, buildPendingRecoverySale };
