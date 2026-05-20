function validateSnapshot(data) {
  if (!data || typeof data !== "object") {
    throwBadSnapshot("Debe enviar data como objeto.");
  }
  for (const field of ["users", "clients", "products", "sales"]) {
    if (!Array.isArray(data[field])) {
      throwBadSnapshot(`Respaldo invalido: falta la lista ${field}.`);
    }
  }
  if (!data.issuer || typeof data.issuer !== "object") {
    throwBadSnapshot("Respaldo invalido: falta configuracion del emisor.");
  }

  assertNoDuplicateValues(data.clients, "identification", "cliente", normalizeClientIdentification);
  assertNoDuplicateValues(data.products, "code", "producto", normalizeProductCode);
  assertNoDuplicateValues(data.users, "email", "usuario", normalizeUserEmail);
  assertEmissionPointLimit(data);
}

function assertNoDuplicateValues(items, field, label, normalize) {
  if (!Array.isArray(items)) return;

  const seen = new Map();
  for (const item of items) {
    const value = normalize(String(item?.[field] || ""));
    if (!value) continue;

    if (seen.has(value)) {
      throwBadSnapshot(`Duplicado en ${label}: ${value}.`);
    }
    seen.set(value, item);
  }
}

function normalizeClientIdentification(value) {
  return value.trim().replace(/\s+/g, "");
}

function normalizeProductCode(value) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

function normalizeUserEmail(value) {
  return value.trim().toLowerCase();
}

function normalizeTenantKey(value) {
  return String(value || "").replace(/\D/g, "");
}

function throwBadSnapshot(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

function summarizeSnapshot(data) {
  const scopeCounts = summarizeDocumentScopes(data);
  return {
    users: data.users?.length || 0,
    clients: data.clients?.length || 0,
    products: data.products?.length || 0,
    sales: data.sales?.length || 0,
    guides: data.guides?.length || 0,
    establishments: data.issuer?.establishments?.length || 0,
    documentScopes: scopeCounts,
    receivedRetentions: data.receivedRetentions?.length || 0,
    inventoryMovements: data.inventoryMovements?.length || 0,
    auditLogs: data.auditLogs?.length || 0,
    cashClosings: data.cashClosings?.length || 0,
    pendingSync: data.pendingSync?.length || 0
  };
}

function compactSnapshotForStorage(data, options = {}) {
  if (!data || typeof data !== "object") return data;

  const now = Date.now();
  const salesDays = Math.max(30, Number(options.salesDays || process.env.SNAPSHOT_RECENT_SALES_DAYS || 395));
  const salesLimit = Math.max(100, Number(options.salesLimit || process.env.SNAPSHOT_RECENT_SALES_LIMIT || 1200));
  const guideDays = Math.max(30, Number(options.guideDays || process.env.SNAPSHOT_RECENT_GUIDE_DAYS || 395));
  const guideLimit = Math.max(100, Number(options.guideLimit || process.env.SNAPSHOT_RECENT_GUIDE_LIMIT || 800));
  const movementLimit = Math.max(100, Number(options.movementLimit || process.env.SNAPSHOT_RECENT_MOVEMENT_LIMIT || 1500));
  const auditLimit = Math.max(100, Number(options.auditLimit || process.env.SNAPSHOT_RECENT_AUDIT_LIMIT || 1500));
  const cashClosingDays = Math.max(30, Number(options.cashClosingDays || process.env.SNAPSHOT_RECENT_CASH_CLOSING_DAYS || 730));
  const cashClosingLimit = Math.max(100, Number(options.cashClosingLimit || process.env.SNAPSHOT_RECENT_CASH_CLOSING_LIMIT || 800));

  return {
    ...data,
    sales: compactDocuments(data.sales || [], salesDays, salesLimit, now, isOperationalDocument),
    guides: compactDocuments(data.guides || [], guideDays, guideLimit, now, isOperationalDocument),
    inventoryMovements: newestItems(data.inventoryMovements || [], movementLimit),
    auditLogs: newestItems(data.auditLogs || [], auditLimit),
    cashClosings: compactDocuments(data.cashClosings || [], cashClosingDays, cashClosingLimit, now),
    historyPolicy: {
      mode: "compact-local-snapshot",
      salesDays,
      salesLimit,
      guideDays,
      guideLimit,
      movementLimit,
      auditLimit,
      cashClosingDays,
      cashClosingLimit,
      compactedAt: new Date().toISOString()
    }
  };
}

function compactDocuments(items, days, limit, now, keepPredicate = () => false) {
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  const sorted = newestItems(items, Number.MAX_SAFE_INTEGER);
  const kept = sorted.filter((item, index) => index < limit || timestampOf(item.createdAt || item.date || item.updatedAt) >= cutoff || keepPredicate(item));
  return kept.slice(0, Math.max(limit, kept.length));
}

function newestItems(items, limit) {
  return [...items]
    .sort((a, b) => timestampOf(b?.createdAt || b?.date || b?.updatedAt) - timestampOf(a?.createdAt || a?.date || a?.updatedAt))
    .slice(0, limit);
}

function isOperationalDocument(item = {}) {
  return ["BORRADOR", "PENDIENTE", "RECIBIDA", "DEVUELTA", "RECHAZADA"].includes(String(item.status || "").toUpperCase());
}

function assertEmissionPointLimit(data) {
  const limit = maxEmissionPointsForLicense(data?.license);
  const scopes = new Set();
  for (const establishment of Array.isArray(data?.issuer?.establishments) ? data.issuer.establishments : []) {
    if (establishment?.active === false) continue;
    const scope = `${normalizeEnvironment(data?.issuer?.environment) || "1"}-${normalizeThreeDigits(establishment?.establishment) || "001"}-${normalizeThreeDigits(establishment?.emissionPoint) || "001"}`;
    scopes.add(scope);
  }
  if (scopes.size === 0 && data?.issuer) {
    scopes.add(`${normalizeEnvironment(data.issuer.environment) || "1"}-${normalizeThreeDigits(data.issuer.establishment) || "001"}-${normalizeThreeDigits(data.issuer.emissionPoint) || "001"}`);
  }
  if (scopes.size > limit) {
    throwBadSnapshot(`Su plan actual permite ${limit} punto(s) de emision. Actualice a Pro para administrar mas puntos.`);
  }
}

function maxEmissionPointsForLicense(license = {}) {
  if (license?.plan === "trial" || String(license?.plan || "").startsWith("pro_") || license?.plan === "pro") {
    return Math.max(999, Number(license?.maxEmissionPoints || 999));
  }
  return 1;
}

function applySnapshotPatch(currentData, patch = {}) {
  const source = currentData || patch.baseData;
  if (!source || typeof source !== "object") {
    throwBadSnapshot("No existe una base inicial para aplicar el cambio incremental.");
  }

  const data = JSON.parse(JSON.stringify(source));
  data.deletedIds = mergeDeletedIds(data.deletedIds, patch.deletedIds, patch.deletions);
  if (patch.issuer && typeof patch.issuer === "object") {
    const sameSequenceScope = sameIssuerSequenceScope(data.issuer, patch.issuer);
    const currentEstablishmentTime = timestampOf(data.issuer?.establishmentsUpdatedAt);
    const incomingEstablishmentTime = timestampOf(patch.issuer.establishmentsUpdatedAt);
    const incomingEstablishmentsAreCurrent = incomingEstablishmentTime >= currentEstablishmentTime;
    const addedIds = incomingEstablishmentsAreCurrent ? addedEstablishmentIds(data.issuer, patch.issuer) : [];
    if (addedIds.length > 0 && !allowsEstablishmentCreation(patch, addedIds)) {
      throwBadSnapshot(`Guardar emisor no puede crear puntos nuevos: ${addedIds.join(", ")}.`);
    }
    data.issuer = {
      ...(data.issuer || {}),
      ...patch.issuer,
      establishments: incomingEstablishmentsAreCurrent ? (patch.issuer.establishments || []) : (data.issuer?.establishments || []),
      activeEstablishmentId: incomingEstablishmentsAreCurrent ? patch.issuer.activeEstablishmentId : data.issuer?.activeEstablishmentId,
      establishmentsUpdatedAt: incomingEstablishmentsAreCurrent ? patch.issuer.establishmentsUpdatedAt || data.issuer?.establishmentsUpdatedAt || "" : data.issuer?.establishmentsUpdatedAt || "",
      sequential: mergeIssuerSequence(data.issuer?.sequential, patch.issuer.sequential, sameSequenceScope),
      remissionSequential: mergeIssuerSequence(data.issuer?.remissionSequential, patch.issuer.remissionSequential, sameSequenceScope),
      creditNoteSequential: mergeIssuerSequence(data.issuer?.creditNoteSequential, patch.issuer.creditNoteSequential, sameSequenceScope)
    };
  }
  if (patch.license && typeof patch.license === "object") {
    data.license = {
      ...(data.license || {}),
      ...patch.license,
      features: {
        ...(data.license?.features || {}),
        ...(patch.license.features || {})
      }
    };
  }

  for (const field of ["users", "sales", "guides", "receivedRetentions", "cashClosings"]) {
    data[field] = mergeById(data[field] || [], patch[field] || []);
  }
  data.clients = mergeByLatestUpdatedAt(data.clients || [], patch.clients || []);
  data.products = mergeByLatestUpdatedAt(data.products || [], patch.products || []);

  applyDeletions(data, patch.deletions || {});
  applyDeletedIdFilters(data);

  data.inventoryMovements = prependUniqueById(data.inventoryMovements || [], patch.inventoryMovements || []);
  data.auditLogs = prependUniqueById(data.auditLogs || [], patch.auditLogs || []);

  return normalizeDocumentScopes(data);
}

function addedEstablishmentIds(currentIssuer = {}, incomingIssuer = {}) {
  const currentIds = new Set(normalizedEstablishmentIds(currentIssuer.establishments || []));
  return normalizedEstablishmentIds(incomingIssuer.establishments || []).filter((id) => !currentIds.has(id));
}

function normalizedEstablishmentIds(establishments = []) {
  return (Array.isArray(establishments) ? establishments : []).map((item) => {
    const establishment = normalizeThreeDigits(item?.establishment) || "001";
    const emissionPoint = normalizeThreeDigits(item?.emissionPoint) || "001";
    return `${establishment}-${emissionPoint}`;
  });
}

function allowsEstablishmentCreation(patch = {}, addedIds = []) {
  const logs = Array.isArray(patch.auditLogs) ? patch.auditLogs : [];
  return addedIds.every((id) => logs.some((log) =>
    log?.event === "ESTABLISHMENT_CREATED"
    && (log?.metadata?.establishment && log?.metadata?.emissionPoint
      ? `${normalizeThreeDigits(log.metadata.establishment)}-${normalizeThreeDigits(log.metadata.emissionPoint)}` === id
      : String(log?.summary || "").includes(id))
  ));
}

function mergeDeletedIds(current = {}, incoming = {}, deletions = {}) {
  return {
    clients: mergeIdLists(current.clients, incoming.clients, deletions.clients),
    products: mergeIdLists(current.products, incoming.products, deletions.products),
    users: mergeIdLists(current.users, incoming.users, deletions.users)
  };
}

function mergeIdLists(...lists) {
  const seen = new Set();
  lists.flatMap((list) => Array.isArray(list) ? list : []).forEach((id) => {
    if (id) seen.add(String(id));
  });
  return Array.from(seen);
}

function applyDeletedIdFilters(data) {
  const deleted = data.deletedIds || {};
  for (const field of ["clients", "products", "users"]) {
    if (!Array.isArray(data[field])) continue;
    const ids = new Set(deleted[field] || []);
    data[field] = data[field].filter((item) => !ids.has(item?.id));
  }
}

function normalizeDocumentScopes(data) {
  if (!data || typeof data !== "object") return data;

  const normalized = {
    ...data,
    sales: normalizeScopedItems(data.sales, data.issuer),
    guides: normalizeScopedItems(data.guides, data.issuer),
    cashClosings: normalizeScopedItems(data.cashClosings, data.issuer)
  };

  applyDeletedIdFilters(normalized);
  return normalized;
}

function normalizeScopedItems(items, issuer) {
  if (!Array.isArray(items)) return items;
  return items.map((item) => {
    const scope = scopeFromDocument(item, issuer);
    return {
      ...item,
      environment: scope.environment,
      establishment: scope.establishment,
      emissionPoint: scope.emissionPoint,
      establishmentName: item?.establishmentName || scope.establishmentName
    };
  });
}

function scopeFromDocument(document = {}, issuer = {}) {
  const accessScope = scopeFromAccessKey(document?.accessKey);
  const issuerScope = activeIssuerScope(issuer);
  const establishment = normalizeThreeDigits(document?.establishment) || accessScope.establishment || issuerScope.establishment;
  const emissionPoint = normalizeThreeDigits(document?.emissionPoint) || accessScope.emissionPoint || issuerScope.emissionPoint;
  return {
    environment: normalizeEnvironment(document?.environment) || accessScope.environment || issuerScope.environment,
    establishment,
    emissionPoint,
    establishmentName: document?.establishmentName || issuerScope.establishmentName || "Matriz"
  };
}

function activeIssuerScope(issuer = {}) {
  const establishments = Array.isArray(issuer.establishments) ? issuer.establishments : [];
  const active = establishments.find((item) => item?.id && item.id === issuer.activeEstablishmentId)
    || establishments.find((item) => item?.establishment || item?.emissionPoint)
    || {};
  return {
    environment: normalizeEnvironment(issuer.environment) || "1",
    establishment: normalizeThreeDigits(active.establishment) || normalizeThreeDigits(issuer.establishment) || "001",
    emissionPoint: normalizeThreeDigits(active.emissionPoint) || normalizeThreeDigits(issuer.emissionPoint) || "001",
    establishmentName: active.name || issuer.establishmentName || "Matriz"
  };
}

function scopeFromAccessKey(accessKey) {
  const value = String(accessKey || "");
  if (!/^\d{49}$/.test(value)) {
    return { environment: "", establishment: "", emissionPoint: "" };
  }
  return {
    environment: value.slice(23, 24),
    establishment: value.slice(24, 27),
    emissionPoint: value.slice(27, 30)
  };
}

function normalizeThreeDigits(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.slice(-3).padStart(3, "0");
}

function normalizeEnvironment(value) {
  const text = String(value || "");
  return ["1", "2"].includes(text) ? text : "";
}

function summarizeDocumentScopes(data = {}) {
  const counts = {};
  for (const item of [...(data.sales || []), ...(data.guides || []), ...(data.cashClosings || [])]) {
    const scope = scopeFromDocument(item, data.issuer);
    const key = `${scope.environment || "1"}-${scope.establishment || "001"}-${scope.emissionPoint || "001"}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function sameIssuerSequenceScope(currentIssuer = {}, incomingIssuer = {}) {
  return String(currentIssuer.environment || "1") === String(incomingIssuer.environment || "1")
    && String(currentIssuer.establishment || "") === String(incomingIssuer.establishment || "")
    && String(currentIssuer.emissionPoint || "") === String(incomingIssuer.emissionPoint || "");
}

function mergeIssuerSequence(currentValue, incomingValue, sameSequenceScope) {
  const incomingSequence = Number(incomingValue || 1);
  if (!sameSequenceScope) return incomingSequence;
  return Math.max(Number(currentValue || 1), incomingSequence);
}

function mergeById(currentItems, incomingItems) {
  const byId = new Map();
  currentItems.forEach((item) => {
    if (item?.id) byId.set(item.id, item);
  });
  incomingItems.forEach((item) => {
    if (item?.id) byId.set(item.id, item);
  });
  return Array.from(byId.values());
}

function mergeByLatestUpdatedAt(currentItems, incomingItems) {
  const byId = new Map();
  currentItems.forEach((item) => {
    if (item?.id) byId.set(item.id, item);
  });
  incomingItems.forEach((item) => {
    if (!item?.id) return;
    const previous = byId.get(item.id);
    if (!previous || timestampOf(item.updatedAt) >= timestampOf(previous.updatedAt)) {
      byId.set(item.id, item);
    }
  });
  return Array.from(byId.values());
}

function timestampOf(value) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function prependUniqueById(currentItems, incomingItems) {
  const seen = new Set();
  const result = [];
  [...incomingItems, ...currentItems].forEach((item) => {
    if (!item?.id || seen.has(item.id)) return;
    seen.add(item.id);
    result.push(item);
  });
  return result;
}

function applyDeletions(data, deletions) {
  Object.entries(deletions).forEach(([field, ids]) => {
    if (!Array.isArray(data[field]) || !Array.isArray(ids)) return;
    const deleted = new Set(ids);
    data[field] = data[field].filter((item) => !deleted.has(item?.id));
  });
}

module.exports = {
  applySnapshotPatch,
  compactSnapshotForStorage,
  normalizeClientIdentification,
  normalizeDocumentScopes,
  normalizeProductCode,
  normalizeTenantKey,
  normalizeUserEmail,
  scopeFromDocument,
  summarizeSnapshot,
  validateSnapshot
};
