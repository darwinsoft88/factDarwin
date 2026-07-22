const crypto = require("node:crypto");

const MAX_SYNC_REQUEST_ID_LENGTH = 200;
const MAX_DOMAIN_OPERATION_ID_LENGTH = 200;
const DOMAIN_OPERATION_TYPES = Object.freeze([
  "CREDIT_PAYMENT_CREATE",
  "CREDIT_PAYMENT_VOID",
  "CREDIT_ADJUSTMENT_APPLY",
  "CREDIT_ADJUSTMENT_REVERSE",
  "CREDIT_NOTE_ISSUE"
]);
const DOMAIN_OPERATION_TYPE_SET = new Set(DOMAIN_OPERATION_TYPES);
const DOMAIN_TRANSPORT_FIELDS = new Set([
  "requestId",
  "Idempotency-Key",
  "idempotencyKey",
  "receivedAt",
  "processedAt",
  "transportMetadata",
  "result",
  "resultJson",
  "httpStatus"
]);

function normalizeSyncRequestId(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_SYNC_REQUEST_ID_LENGTH) return null;
  return normalized;
}

function resolveSyncRequestId(headerValue, bodyValue, bodyPresent = false) {
  const headerPresent = headerValue !== undefined;
  const headerRequestId = headerPresent ? normalizeSyncRequestId(headerValue) : null;
  const bodyRequestId = bodyPresent ? normalizeSyncRequestId(bodyValue) : null;
  if ((headerPresent && !headerRequestId) || (bodyPresent && !bodyRequestId)) {
    const error = new Error(`requestId debe ser texto no vacio de hasta ${MAX_SYNC_REQUEST_ID_LENGTH} caracteres.`);
    error.statusCode = 400;
    error.code = "SYNC_REQUEST_ID_INVALID";
    throw error;
  }
  if (headerRequestId && bodyRequestId && headerRequestId !== bodyRequestId) {
    const error = new Error("Idempotency-Key y requestId no coinciden.");
    error.statusCode = 400;
    error.code = "SYNC_REQUEST_ID_CONFLICT";
    throw error;
  }
  return headerRequestId || bodyRequestId || null;
}

function stripSyncTransportFields(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return patch;
  const semanticPatch = { ...patch };
  delete semanticPatch.requestId;
  return semanticPatch;
}

function canonicalizeSyncPayload(value) {
  if (Array.isArray(value)) return value.map(canonicalizeSyncPayload);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = canonicalizeSyncPayload(value[key]);
    return result;
  }, {});
}

function hashSyncPayload(patch) {
  const canonical = canonicalizeSyncPayload(stripSyncTransportFields(patch));
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function createDomainOperationError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function validateDomainIdentifier(value, code, label) {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > MAX_DOMAIN_OPERATION_ID_LENGTH) {
    throw createDomainOperationError(code, `${label} debe ser texto no vacio, sin espacios externos y de hasta ${MAX_DOMAIN_OPERATION_ID_LENGTH} caracteres.`, { value });
  }
  return value;
}

function validateDomainOperationType(value) {
  if (!DOMAIN_OPERATION_TYPE_SET.has(value)) {
    throw createDomainOperationError("INVALID_DOMAIN_OPERATION_TYPE", "El tipo de operacion de dominio no esta permitido.", { operationType: value });
  }
  return value;
}

function stripDomainTransportFields(value) {
  if (Array.isArray(value)) return value.map(stripDomainTransportFields);
  if (!value || typeof value !== "object") return value;
  return Object.keys(value).reduce((result, key) => {
    if (!DOMAIN_TRANSPORT_FIELDS.has(key)) result[key] = stripDomainTransportFields(value[key]);
    return result;
  }, {});
}

function prepareDomainOperation(operation) {
  if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
    throw createDomainOperationError("INVALID_DOMAIN_OPERATION_ID", "La operacion de dominio debe ser un objeto.");
  }
  const operationType = validateDomainOperationType(operation.operationType);
  const operationId = validateDomainIdentifier(operation.operationId, "INVALID_DOMAIN_OPERATION_ID", "operationId");
  const entityId = validateDomainIdentifier(operation.entityId, "INVALID_DOMAIN_OPERATION_ID", "entityId");
  const batchOperationId = operation.batchOperationId === undefined
    ? null
    : validateDomainIdentifier(operation.batchOperationId, "INVALID_BATCH_OPERATION_ID", "batchOperationId");
  const materialPayload = stripDomainTransportFields(operation.payload);
  const canonicalPayload = canonicalizeSyncPayload({
    operationType,
    operationId,
    entityId,
    ...(batchOperationId ? { batchOperationId } : {}),
    payload: materialPayload
  });
  const payloadHash = crypto.createHash("sha256").update(JSON.stringify(canonicalPayload)).digest("hex");
  return { operationType, operationId, entityId, batchOperationId, payloadHash, canonicalPayload };
}

function hashDomainOperation(operation) {
  return prepareDomainOperation(operation).payloadHash;
}

function assertDomainOperationReplay(existing, incoming) {
  if (existing.payloadHash !== incoming.payloadHash
    || existing.entityId !== incoming.entityId
    || (existing.batchOperationId || null) !== (incoming.batchOperationId || null)) {
    throw createDomainOperationError("DOMAIN_OPERATION_MISMATCH", "El operationId ya fue utilizado con un payload de dominio diferente.", {
      operationType: incoming.operationType,
      operationId: incoming.operationId,
      entityId: incoming.entityId
    });
  }
  return {
    status: "REPLAY",
    operation: incoming,
    result: existing.resultJson ?? null
  };
}

function createDomainEntityOperationConflictError(incoming, existingOperationId) {
  return createDomainOperationError("DOMAIN_ENTITY_OPERATION_CONFLICT", "La entidad ya esta asociada a otra identidad de operacion.", {
    operationType: incoming.operationType,
    operationId: incoming.operationId,
    entityId: incoming.entityId,
    existingOperationId
  });
}

function createSyncOperationMismatchError(requestId) {
  const error = new Error("El requestId ya fue utilizado con un payload diferente.");
  error.statusCode = 409;
  error.code = "SYNC_OPERATION_MISMATCH";
  error.requestId = requestId;
  return error;
}

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

  validateInitialPayments(data.sales);
  validateCreditPayments(data.creditPayments);
  validateCreditAdjustments(data.creditAdjustments);
  assertNoCreditOverpayments(data);

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
    creditPayments: data.creditPayments?.length || 0,
    creditAdjustments: data.creditAdjustments?.length || 0,
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

  const referencedDocumentIds = new Set();
  for (const adjustment of Array.isArray(data.creditAdjustments) ? data.creditAdjustments : []) {
    if (adjustment?.sourceSaleId) referencedDocumentIds.add(adjustment.sourceSaleId);
    if (adjustment?.sourceCreditNoteId) referencedDocumentIds.add(adjustment.sourceCreditNoteId);
  }
  const keepReferencedOrOperationalSale = (sale) => isOperationalDocument(sale) || referencedDocumentIds.has(sale?.id);

  return {
    ...data,
    sales: compactDocuments(data.sales || [], salesDays, salesLimit, now, keepReferencedOrOperationalSale),
    guides: compactDocuments(data.guides || [], guideDays, guideLimit, now, isOperationalDocument),
    inventoryMovements: newestItems(data.inventoryMovements || [], movementLimit),
    auditLogs: newestItems(data.auditLogs || [], auditLimit),
    cashClosings: compactDocuments(data.cashClosings || [], cashClosingDays, cashClosingLimit, now),
    creditPayments: compactDocuments(data.creditPayments || [], cashClosingDays, cashClosingLimit, now),
    creditAdjustments: data.creditAdjustments || [],
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
  return ["BORRADOR", "PENDIENTE", "PENDIENTE_SRI", "ENVIADA_SRI", "RECIBIDA", "DEVUELTA", "ERROR_SRI", "RECHAZADA"].includes(String(item.status || "").toUpperCase());
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
  if (license?.plan === "trial" || String(license?.plan || "").startsWith("pro_") || String(license?.plan || "").startsWith("premium_") || license?.plan === "pro") {
    return Math.max(1, Number(license?.maxEmissionPoints || (license?.plan === "trial" ? 3 : 999)));
  }
  return 1;
}

function applySnapshotPatch(currentData, patch = {}) {
  const source = currentData || patch.baseData;
  if (!source || typeof source !== "object") {
    throwBadSnapshot("No existe una base inicial para aplicar el cambio incremental.");
  }

  const data = JSON.parse(JSON.stringify(source));
  validateCreditAdjustments(patch.creditAdjustments);
  validateCreditPayments(patch.creditPayments);
  validateInitialPayments(patch.sales);
  data.deletedIds = mergeDeletedIds(data.deletedIds, patch.deletedIds, patch.deletions);
  if (patch.issuer && typeof patch.issuer === "object") {
    const sameSequenceScope = sameIssuerSequenceScope(data.issuer, patch.issuer);
    const currentEstablishmentTime = timestampOf(data.issuer?.establishmentsUpdatedAt);
    const incomingEstablishmentTime = timestampOf(patch.issuer.establishmentsUpdatedAt);
    const incomingEstablishmentsAreCurrent = incomingEstablishmentTime >= currentEstablishmentTime;
    const addedIds = incomingEstablishmentsAreCurrent ? addedEstablishmentIds(data.issuer, patch.issuer) : [];
    const currentCount = normalizedEstablishmentIds(data.issuer?.establishments || []).length;
    const incomingCount = normalizedEstablishmentIds(patch.issuer.establishments || []).length;
    if (addedIds.length > 0 && incomingCount > currentCount && !allowsEstablishmentCreation(patch, addedIds)) {
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

  for (const field of ["users", "sales", "guides", "receivedRetentions", "cashClosings", "creditPayments", "creditAdjustments"]) {
    data[field] = mergeById(data[field] || [], patch[field] || []);
  }
  data.clients = mergeByLatestUpdatedAt(data.clients || [], patch.clients || []);
  data.products = mergeByLatestUpdatedAt(data.products || [], patch.products || []);

  applyDeletions(data, patch.deletions || {});
  applyDeletedIdFilters(data);

  data.inventoryMovements = prependUniqueById(data.inventoryMovements || [], patch.inventoryMovements || []);
  data.auditLogs = prependUniqueById(data.auditLogs || [], patch.auditLogs || []);

  validateInitialPayments(data.sales);
  validateCreditPayments(data.creditPayments);
  validateCreditAdjustments(data.creditAdjustments);
  validateIncomingCreditAdjustmentReferences(data, patch.creditAdjustments);

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
    users: mergeIdLists(current.users, incoming.users, deletions.users),
    inventoryMovements: mergeIdLists(current.inventoryMovements, incoming.inventoryMovements, deletions.inventoryMovements)
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
  for (const field of ["clients", "products", "users", "inventoryMovements"]) {
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
  validateInitialPayments(normalized.sales);
  validateCreditPayments(normalized.creditPayments);
  validateCreditAdjustments(normalized.creditAdjustments);
  const reconciled = reconcileCreditBalancesFromPayments(normalized);
  assertNoCreditOverpayments(reconciled);
  return reconciled;
}

function reconcileCreditBalancesFromPayments(data) {
  if (!data || typeof data !== "object") return data;
  validateInitialPayments(data.sales);
  validateCreditPayments(data.creditPayments);
  validateCreditAdjustments(data.creditAdjustments);
  const paidBySale = new Map();
  for (const payment of Array.isArray(data.creditPayments) ? data.creditPayments : []) {
    if (!payment?.saleId || payment.voidedAt) continue;
    paidBySale.set(payment.saleId, roundMoney((paidBySale.get(payment.saleId) || 0) + Number(payment.amount || 0)));
  }

  const adjustmentsBySale = new Map();
  for (const adjustment of Array.isArray(data.creditAdjustments) ? data.creditAdjustments : []) {
    if (!adjustment?.sourceSaleId || adjustment.state !== "APPLIED") continue;
    adjustmentsBySale.set(
      adjustment.sourceSaleId,
      roundMoney((adjustmentsBySale.get(adjustment.sourceSaleId) || 0) + Number(adjustment.amount || 0))
    );
  }

  const sales = (Array.isArray(data.sales) ? data.sales : []).map((sale) => {
    if (sale?.paymentCondition !== "credito") return sale;
    const initialPayments = Array.isArray(sale.payments)
      ? sale.payments.reduce((sum, payment) => sum + Number(payment?.amount || 0), 0)
      : 0;
    const originalCredit = Math.max(0, roundMoney(Number(sale.total || 0) - initialPayments));
    const paidAmount = paidBySale.get(sale.id) || 0;
    const adjustmentAmount = adjustmentsBySale.get(sale.id) || 0;
    const nextBalance = Math.max(0, roundMoney(originalCredit - paidAmount - adjustmentAmount));
    return {
      ...sale,
      creditBalance: nextBalance,
      creditStatus: nextBalance <= 0 ? "pagado" : "pendiente"
    };
  });

  return { ...data, sales };
}

function assertNoCreditOverpayments(data) {
  const paidBySale = new Map();
  for (const payment of Array.isArray(data.creditPayments) ? data.creditPayments : []) {
    if (!payment?.saleId || payment.voidedAt) continue;
    paidBySale.set(payment.saleId, roundMoney((paidBySale.get(payment.saleId) || 0) + Number(payment.amount || 0)));
  }

  for (const sale of Array.isArray(data.sales) ? data.sales : []) {
    if (sale?.paymentCondition !== "credito") continue;
    const initialPayments = Array.isArray(sale.payments)
      ? sale.payments.reduce((sum, payment) => sum + Number(payment?.amount || 0), 0)
      : 0;
    const originalCredit = Math.max(0, roundMoney(Number(sale.total || 0) - initialPayments));
    const paid = paidBySale.get(sale.id) || 0;
    if (paid > originalCredit + 0.009) {
      throwBadSnapshot(`El abono supera el saldo real de ${sale.sequence || "la factura"}. Sincronice datos antes de cobrar nuevamente.`);
    }
  }
}

function validateCreditAdjustments(adjustments) {
  if (adjustments === undefined) return;
  if (!Array.isArray(adjustments)) {
    throwBadSnapshot("Respaldo invalido: creditAdjustments debe ser una lista.");
  }
  const seenIds = new Set();
  for (const adjustment of adjustments) {
    if (!adjustment || typeof adjustment !== "object" || Array.isArray(adjustment)) {
      throwBadSnapshot("Ajuste de cartera invalido: cada elemento debe ser un objeto.");
    }
    const hasOperationId = Object.prototype.hasOwnProperty.call(adjustment, "operationId");
    if (hasOperationId && (typeof adjustment.operationId !== "string"
      || !adjustment.operationId
      || adjustment.operationId !== adjustment.operationId.trim()
      || adjustment.operationId.length > MAX_DOMAIN_OPERATION_ID_LENGTH)) {
      throwBadSnapshot(`Ajuste de cartera invalido: operationId debe ser texto no vacio, sin espacios externos y de hasta ${MAX_DOMAIN_OPERATION_ID_LENGTH} caracteres.`);
    }
    if (!isNonEmptyString(adjustment.id)
      || !isNonEmptyString(adjustment.sourceCreditNoteId) || !isNonEmptyString(adjustment.sourceSaleId)
      || !isNonEmptyString(adjustment.clientId) || !isNonEmptyString(adjustment.userId)) {
      throwBadSnapshot("Ajuste de cartera invalido: faltan identificadores obligatorios.");
    }
    if (seenIds.has(adjustment.id)) {
      throwBadSnapshot(`Ajuste de cartera duplicado: ${adjustment.id}.`);
    }
    seenIds.add(adjustment.id);
    if (adjustment.type !== "CREDIT_NOTE" || !["UNKNOWN", "APPLIED", "REVERSED"].includes(adjustment.state)) {
      throwBadSnapshot("Ajuste de cartera invalido: tipo o estado no reconocido.");
    }
    if (typeof adjustment.amount !== "number" || !Number.isFinite(adjustment.amount) || adjustment.amount <= 0) {
      throwBadSnapshot("Ajuste de cartera invalido: el importe debe ser mayor que cero.");
    }
  }
}

function validateCreditPayments(payments) {
  if (payments === undefined) return;
  if (!Array.isArray(payments)) {
    throwBadSnapshot("Respaldo invalido: creditPayments debe ser una lista.");
  }
  for (const payment of payments) {
    if (!payment || typeof payment !== "object" || Array.isArray(payment)) {
      throwBadSnapshot("Abono invalido: cada elemento debe ser un objeto.");
    }
    if (!isNonEmptyString(payment.id) || !isNonEmptyString(payment.saleId)
      || !isNonEmptyString(payment.clientId) || !isNonEmptyString(payment.userId)
      || !isNonEmptyString(payment.userName) || !isNonEmptyString(payment.paymentMethod)
      || !isNonEmptyString(payment.createdAt)) {
      throwBadSnapshot("Abono invalido: faltan campos obligatorios.");
    }
    if (typeof payment.amount !== "number" || !Number.isFinite(payment.amount) || payment.amount <= 0) {
      throwBadSnapshot("Abono invalido: el importe debe ser numerico, finito y mayor que cero.");
    }
  }
}

function validateInitialPayments(sales) {
  if (sales === undefined) return;
  if (!Array.isArray(sales)) {
    throwBadSnapshot("Respaldo invalido: sales debe ser una lista.");
  }
  for (const sale of sales) {
    if (sale?.payments === undefined) continue;
    if (!Array.isArray(sale.payments)) {
      throwBadSnapshot(`Pago inicial invalido en ${sale?.sequence || sale?.id || "la venta"}: payments debe ser una lista.`);
    }
    for (const payment of sale.payments) {
      if (!payment || typeof payment !== "object" || Array.isArray(payment)) {
        throwBadSnapshot(`Pago inicial invalido en ${sale?.sequence || sale?.id || "la venta"}: cada elemento debe ser un objeto.`);
      }
      if (!isNonEmptyString(payment.id) || !isNonEmptyString(payment.paymentMethod)) {
        throwBadSnapshot(`Pago inicial invalido en ${sale?.sequence || sale?.id || "la venta"}: faltan campos obligatorios.`);
      }
      if (typeof payment.amount !== "number" || !Number.isFinite(payment.amount) || payment.amount <= 0) {
        throwBadSnapshot(`Pago inicial invalido en ${sale?.sequence || sale?.id || "la venta"}: el importe debe ser numerico, finito y mayor que cero.`);
      }
    }
  }
}

function validateIncomingCreditAdjustmentReferences(data, incomingAdjustments) {
  if (incomingAdjustments === undefined) return;
  const salesById = new Map((data.sales || []).filter((sale) => sale?.id).map((sale) => [sale.id, sale]));
  for (const adjustment of incomingAdjustments) {
    const sourceSale = salesById.get(adjustment.sourceSaleId);
    if (!sourceSale || sourceSale.paymentCondition !== "credito") {
      throwBadSnapshot(`Ajuste de cartera invalido: no existe la venta a credito ${adjustment.sourceSaleId}.`);
    }
    const creditNote = salesById.get(adjustment.sourceCreditNoteId);
    if (!creditNote || creditNote.documentType !== "nota_credito") {
      throwBadSnapshot(`Ajuste de cartera invalido: no existe la nota de credito ${adjustment.sourceCreditNoteId}.`);
    }
    if (creditNote.sourceSaleId !== sourceSale.id || adjustment.clientId !== sourceSale.clientId) {
      throwBadSnapshot("Ajuste de cartera invalido: la nota de credito no pertenece a la venta indicada.");
    }
    if (adjustment.state === "APPLIED" && creditNote.status !== "AUTORIZADA") {
      throwBadSnapshot("Ajuste de cartera invalido: la nota de credito aplicada no esta autorizada.");
    }
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
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

function roundMoney(value) {
  const number = Number(value);
  return Math.round((Number.isFinite(number) ? number : 0) * 100) / 100;
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
  DOMAIN_OPERATION_TYPES,
  MAX_DOMAIN_OPERATION_ID_LENGTH,
  MAX_SYNC_REQUEST_ID_LENGTH,
  applySnapshotPatch,
  assertDomainOperationReplay,
  createDomainEntityOperationConflictError,
  createDomainOperationError,
  createSyncOperationMismatchError,
  compactSnapshotForStorage,
  hashSyncPayload,
  hashDomainOperation,
  normalizeClientIdentification,
  normalizeDocumentScopes,
  normalizeProductCode,
  reconcileCreditBalancesFromPayments,
  normalizeTenantKey,
  normalizeUserEmail,
  normalizeSyncRequestId,
  prepareDomainOperation,
  resolveSyncRequestId,
  scopeFromDocument,
  summarizeSnapshot,
  stripSyncTransportFields,
  validateSnapshot
};
