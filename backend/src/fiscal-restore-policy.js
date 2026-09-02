"use strict";

const AUTHORIZED_STATUS = "AUTORIZADA";
const DEFINITIVE_FIELDS = [
  "accessKey",
  "authorizationNumber",
  "authorizationDate",
  "authorizedXml",
  "sriStatus",
  "sriResponse",
  "sriMessages",
  "authorizationMessages"
];

function restoreConflict(message) {
  const error = new Error(`Restore fiscal rechazado: ${message}`);
  error.statusCode = 409;
  error.code = "TENANT_RESTORE_FISCAL_CONFLICT";
  return error;
}

function text(value) {
  return String(value ?? "").trim();
}

function documentType(document, collection) {
  if (collection === "guides") return "guia_remision";
  return text(document?.documentType) || "factura";
}

function accessKeyScope(accessKey) {
  const value = text(accessKey);
  if (!/^\d{49}$/.test(value)) return {};
  return {
    environment: value.slice(23, 24),
    establishment: value.slice(24, 27),
    emissionPoint: value.slice(27, 30),
    sequence: value.slice(30, 39)
  };
}

function fiscalKey(document, collection) {
  const fromKey = accessKeyScope(document?.accessKey);
  const environment = text(document?.environment) || fromKey.environment;
  const establishment = text(document?.establishment) || fromKey.establishment;
  const emissionPoint = text(document?.emissionPoint) || fromKey.emissionPoint;
  const sequence = text(document?.sequence) || fromKey.sequence;
  if (!environment || !establishment || !emissionPoint || !sequence) return "";
  return `${documentType(document, collection)}|${environment}|${establishment}|${emissionPoint}|${sequence}`;
}

function identityLabel(document, collection) {
  return text(document?.id) || text(document?.accessKey) || fiscalKey(document, collection) || "sin identidad";
}

function assertCompatibleIdentity(current, incoming, collection) {
  const currentId = text(current?.id);
  const incomingId = text(incoming?.id);
  const currentAccessKey = text(current?.accessKey);
  const incomingAccessKey = text(incoming?.accessKey);
  const currentFiscalKey = fiscalKey(current, collection);
  const incomingFiscalKey = fiscalKey(incoming, collection);

  if (currentId && currentId === incomingId && currentAccessKey && incomingAccessKey && currentAccessKey !== incomingAccessKey) {
    throw restoreConflict(`el id ${currentId} posee claves de acceso incompatibles.`);
  }
  if (currentAccessKey && currentAccessKey === incomingAccessKey && currentId && incomingId && currentId !== incomingId) {
    throw restoreConflict(`la clave de acceso ${currentAccessKey} está asociada a ids distintos.`);
  }
  if (currentFiscalKey && currentFiscalKey === incomingFiscalKey && currentAccessKey && incomingAccessKey && currentAccessKey !== incomingAccessKey) {
    throw restoreConflict(`la identidad fiscal ${currentFiscalKey} posee claves de acceso incompatibles.`);
  }
}

function sameIdentity(current, incoming, collection) {
  assertCompatibleIdentity(current, incoming, collection);
  const currentId = text(current?.id);
  const incomingId = text(incoming?.id);
  if (currentId && incomingId && currentId === incomingId) return true;
  const currentAccessKey = text(current?.accessKey);
  const incomingAccessKey = text(incoming?.accessKey);
  if (currentAccessKey && incomingAccessKey && currentAccessKey === incomingAccessKey) return true;
  const currentFiscalKey = fiscalKey(current, collection);
  const incomingFiscalKey = fiscalKey(incoming, collection);
  return Boolean(currentFiscalKey && incomingFiscalKey && currentFiscalKey === incomingFiscalKey);
}

function comparable(value) {
  if (value === undefined || value === null || value === "") return "";
  return typeof value === "string" ? value.trim() : JSON.stringify(value);
}

function reconcileAuthorized(current, incoming, collection) {
  for (const field of DEFINITIVE_FIELDS) {
    const currentValue = comparable(current?.[field]);
    const incomingValue = comparable(incoming?.[field]);
    if (currentValue && incomingValue && currentValue !== incomingValue) {
      throw restoreConflict(`${identityLabel(current, collection)} contiene ${field} incompatible entre el estado actual y el backup.`);
    }
  }
  // El estado actual es la evidencia durable; el backup solo completa campos ausentes.
  const reconciled = { ...incoming, ...current, status: AUTHORIZED_STATUS };
  for (const [field, value] of Object.entries(incoming || {})) {
    if (!comparable(current?.[field]) && comparable(value)) reconciled[field] = value;
  }
  return reconciled;
}

function reconcilePair(current, incoming, collection) {
  const currentAuthorized = current?.status === AUTHORIZED_STATUS;
  const incomingAuthorized = incoming?.status === AUTHORIZED_STATUS;
  if (currentAuthorized && incomingAuthorized) return reconcileAuthorized(current, incoming, collection);
  if (currentAuthorized) return current;
  if (incomingAuthorized) return incoming;
  if (["ANULADA", "CONVERTIDA"].includes(current?.status)) return current;
  return current;
}

function assertNoAmbiguousCollisions(items, collection) {
  for (let left = 0; left < items.length; left += 1) {
    for (let right = left + 1; right < items.length; right += 1) {
      assertCompatibleIdentity(items[left], items[right], collection);
    }
  }
}

function reconcileCollection(currentItems = [], backupItems = [], collection) {
  const current = Array.isArray(currentItems) ? currentItems : [];
  const incoming = Array.isArray(backupItems) ? backupItems : [];
  assertNoAmbiguousCollisions(current, collection);
  assertNoAmbiguousCollisions(incoming, collection);
  const result = [...incoming];

  for (const currentDocument of current) {
    const matches = [];
    for (let index = 0; index < result.length; index += 1) {
      if (sameIdentity(currentDocument, result[index], collection)) matches.push(index);
    }
    if (matches.length > 1) {
      throw restoreConflict(`${identityLabel(currentDocument, collection)} coincide con varios documentos del backup.`);
    }
    if (matches.length === 0) result.push(currentDocument);
    else result[matches[0]] = reconcilePair(currentDocument, result[matches[0]], collection);
  }
  return result;
}

function idSet(value) {
  return new Set((Array.isArray(value) ? value : []).map((id) => text(id)).filter(Boolean));
}

function reconcileDeletedIds(currentData, backupData, reconciled) {
  const currentDeleted = currentData?.deletedIds || {};
  const backupDeleted = backupData?.deletedIds || {};
  const result = { ...backupDeleted };
  for (const collection of ["clients", "products", "users", "inventoryMovements"]) {
    result[collection] = [...new Set([...idSet(backupDeleted[collection]), ...idSet(currentDeleted[collection])])];
  }
  for (const collection of ["sales", "guides"]) {
    const currentDocuments = Array.isArray(currentData?.[collection]) ? currentData[collection] : [];
    const currentExisting = new Set(currentDocuments.map((item) => text(item?.id)).filter(Boolean));
    const currentTombstones = idSet(currentDeleted[collection]);
    for (const document of currentDocuments) {
      if (document?.status === AUTHORIZED_STATUS && currentTombstones.has(text(document.id))) {
        throw restoreConflict(`${collection}/${document.id} está AUTORIZADA y simultáneamente posee tombstone actual.`);
      }
    }
    for (const backupDocument of Array.isArray(backupData?.[collection]) ? backupData[collection] : []) {
      if (backupDocument?.status === AUTHORIZED_STATUS && currentTombstones.has(text(backupDocument.id))) {
        throw restoreConflict(`${collection}/${backupDocument.id} está AUTORIZADA en el backup y posee tombstone actual incompatible.`);
      }
    }
    const finalTombstones = new Set(
      [...idSet(backupDeleted[collection])].filter((id) => !currentExisting.has(id))
    );
    currentTombstones.forEach((id) => finalTombstones.add(id));
    result[collection] = [...finalTombstones];
    reconciled[collection] = (reconciled[collection] || []).filter((item) => !finalTombstones.has(text(item?.id)));
  }
  return result;
}

function mergeAuditLogs(currentItems = [], backupItems = []) {
  const result = [];
  const indexes = new Map();
  for (const item of [...(Array.isArray(backupItems) ? backupItems : []), ...(Array.isArray(currentItems) ? currentItems : [])]) {
    const id = text(item?.id);
    if (!id) {
      result.push(item);
      continue;
    }
    if (indexes.has(id)) result[indexes.get(id)] = item;
    else {
      indexes.set(id, result.length);
      result.push(item);
    }
  }
  return result;
}

function reconcileFiscalDocumentsForRestore(currentData = {}, backupData = {}) {
  const reconciled = {
    ...backupData,
    sales: reconcileCollection(currentData?.sales, backupData?.sales, "sales"),
    guides: reconcileCollection(currentData?.guides, backupData?.guides, "guides"),
    auditLogs: mergeAuditLogs(currentData?.auditLogs, backupData?.auditLogs)
  };
  reconciled.deletedIds = reconcileDeletedIds(currentData, backupData, reconciled);
  return reconciled;
}

module.exports = {
  AUTHORIZED_STATUS,
  reconcileFiscalDocumentsForRestore
};
