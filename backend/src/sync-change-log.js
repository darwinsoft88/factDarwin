const crypto = require("node:crypto");
const { hashSyncPayload } = require("./db-utils");
const { evaluateShadowAccess } = require("./sync-shadow-config");
const { logTechnical } = require("./technical-logs");

const PROTOCOL_VERSION = 1;
const COLLECTIONS = Object.freeze([
  ["users", "users", "user"],
  ["clients", "clients", "client"],
  ["products", "products", "product"],
  ["sales", "sales", "sale"],
  ["inventoryMovements", "inventory", "inventory_movement"],
  ["auditLogs", "audit", "audit_log"],
  ["creditPayments", "credit", "credit_payment"],
  ["creditAdjustments", "credit", "credit_adjustment"],
  ["receivedRetentions", "retentions", "received_retention"],
  ["guides", "guides", "remission_guide"],
  ["cashClosings", "cash", "cash_closing"]
]);

function collectSnapshotChanges(currentData = {}, finalData = {}) {
  const changes = [];
  for (const [field, module, entityType] of COLLECTIONS) {
    collectArrayChanges(changes, currentData?.[field], finalData?.[field], module, entityType);
  }
  collectSingletonChange(changes, currentData?.issuer, finalData?.issuer, "configuration", "issuer", "issuer");
  collectSingletonChange(changes, currentData?.license, finalData?.license, "configuration", "license", "license");
  return changes;
}

async function appendSnapshotChanges(client, options) {
  const companyId = String(options.companyId || "");
  const access = options.shadowConfig
    ? evaluateShadowAccess(options.shadowConfig, companyId)
    : { enabled: options.enabled === true, reason: options.enabled ? "LEGACY_TEST_ENABLED" : "GLOBAL_DISABLED" };
  logTechnical("info", "sync_shadow_configuration_decision", {
    companyId,
    enabled: access.enabled,
    reason: access.reason,
    mode: access.mode,
    environment: access.environment
  });
  if (!access.enabled) {
    return { enabled: false, reason: access.reason, inserted: 0, transactionId: null };
  }
  if (!companyId) throw new Error("companyId es obligatorio para registrar cambios shadow.");

  const existingResult = await client.query(
    "SELECT EXISTS (SELECT 1 FROM sync_change_log WHERE company_id = $1) AS exists",
    [companyId]
  );
  const baseline = !existingResult.rows[0]?.exists;
  const requestedChanges = baseline
    ? new Set(collectSnapshotChanges(options.currentData, options.finalData).map(changeKey))
    : null;
  const changes = collectSnapshotChanges(
    baseline ? {} : options.currentData,
    options.finalData
  );
  if (changes.length === 0) {
    return { enabled: true, reason: access.reason, baseline, inserted: 0, transactionId: null };
  }

  const transactionId = options.transactionId || crypto.randomUUID();
  const occurredAt = options.occurredAt || new Date().toISOString();
  const requestedOrigin = normalizeOrigin(options.origin);
  let inserted = 0;
  let payloadBytes = 0;

  try {
    for (const change of changes) {
      const belongsToRequest = !baseline || requestedChanges.has(changeKey(change));
      const origin = belongsToRequest ? requestedOrigin : "shadow_baseline";
      const versionResult = await client.query(
        `SELECT COALESCE(MAX(record_version), 0)::bigint + 1 AS version
         FROM sync_change_log
         WHERE company_id = $1 AND entity_type = $2 AND entity_id = $3`,
        [companyId, change.entityType, change.entityId]
      );
      const recordVersion = Number(versionResult.rows[0]?.version || 1);
      const serializedPayload = change.payload === null ? null : JSON.stringify(change.payload);
      const changePayloadBytes = serializedPayload ? Buffer.byteLength(serializedPayload, "utf8") : 0;
      await client.query(
        `INSERT INTO sync_change_log (
           company_id, module, entity_type, entity_id, action, record_version,
           payload, payload_hash, request_id, operation_id, device_id, user_id, origin,
           occurred_at, transaction_id, protocol_version, is_tombstone
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7::jsonb, $8, $9, $10, $11, $12, $13,
           $14, $15::uuid, $16, $17
         )`,
        [
          companyId,
          change.module,
          change.entityType,
          change.entityId,
          change.action,
          recordVersion,
          serializedPayload,
          change.payloadHash,
          belongsToRequest ? options.requestId || null : null,
          change.operationId || options.operationId || null,
          options.deviceId || null,
          options.userId || null,
          origin,
          occurredAt,
          transactionId,
          PROTOCOL_VERSION,
          change.action === "DELETE"
        ]
      );
      inserted += 1;
      payloadBytes += changePayloadBytes;
      logTechnical("info", change.action === "DELETE"
        ? "sync_shadow_tombstone_total"
        : "sync_shadow_change_written_total", {
        companyId,
        module: change.module,
        entityType: change.entityType,
        action: change.action,
        origin,
        payloadBytes: changePayloadBytes
      });
    }
  } catch (error) {
    logTechnical("error", "sync_shadow_change_failed_total", {
      companyId,
      origin: requestedOrigin,
      result: "failed",
      errorCode: error.code || error.name || "UNKNOWN_ERROR"
    });
    throw error;
  }

  return {
    enabled: true,
    reason: access.reason,
    baseline,
    inserted,
    transactionId,
    payloadBytes,
    origin: baseline ? "mixed_baseline" : requestedOrigin
  };
}

function collectArrayChanges(target, currentItems, finalItems, module, entityType) {
  const current = byId(currentItems);
  const final = byId(finalItems);
  for (const [id, value] of final) {
    const safeValue = sanitizePayload(entityType, value);
    const previous = current.get(id);
    if (previous && hashPayload(sanitizePayload(entityType, previous)) === hashPayload(safeValue)) continue;
    target.push(changeDescriptor(module, entityType, id, "UPSERT", safeValue));
  }
  for (const id of current.keys()) {
    if (!final.has(id)) target.push(changeDescriptor(module, entityType, id, "DELETE", null));
  }
}

function collectSingletonChange(target, currentValue, finalValue, module, entityType, entityId) {
  if (currentValue === undefined && finalValue === undefined) return;
  if (finalValue === undefined || finalValue === null) {
    if (currentValue !== undefined && currentValue !== null) {
      target.push(changeDescriptor(module, entityType, entityId, "DELETE", null));
    }
    return;
  }
  if (hashPayload(currentValue) === hashPayload(finalValue)) return;
  target.push(changeDescriptor(module, entityType, entityId, "UPSERT", finalValue));
}

function changeDescriptor(module, entityType, entityId, action, payload) {
  return {
    module,
    entityType,
    entityId,
    action,
    payload,
    operationId: operationIdFromPayload(payload),
    payloadHash: hashPayload(payload)
  };
}

function byId(items) {
  const result = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const id = String(item?.id || "");
    if (id) result.set(id, item);
  }
  return result;
}

function sanitizePayload(entityType, value) {
  if (entityType !== "user" || !value || typeof value !== "object") return value;
  return sanitizeAuthenticationFields(value);
}

const AUTHENTICATION_FIELDS = new Set([
  "password",
  "passwordhash",
  "token",
  "refreshtoken",
  "accesstoken",
  "secret",
  "jwt",
  "authorization"
]);

function sanitizeAuthenticationFields(value) {
  if (Array.isArray(value)) return value.map(sanitizeAuthenticationFields);
  if (!value || typeof value !== "object") return value;
  return Object.entries(value).reduce((safe, [key, item]) => {
    if (!AUTHENTICATION_FIELDS.has(key.toLowerCase())) {
      safe[key] = sanitizeAuthenticationFields(item);
    }
    return safe;
  }, {});
}

function operationIdFromPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  for (const field of [
    "operationId",
    "inventoryOperationId",
    "creditNoteInventoryOperationId",
    "voidOperationId",
    "reverseOperationId"
  ]) {
    const value = String(payload[field] || "").trim();
    if (value) return value.slice(0, 200);
  }
  return null;
}

function hashPayload(payload) {
  return hashSyncPayload({ payload });
}

function changeKey(change) {
  return `${change.entityType}:${change.entityId}:${change.action}`;
}

function normalizeOrigin(value) {
  const origin = String(value || "system_operation").trim().toLowerCase();
  return [
    "legacy_snapshot",
    "legacy_merge",
    "incremental_merge",
    "domain_operation",
    "admin_operation",
    "system_operation",
    "shadow_baseline"
  ].includes(origin) ? origin : "system_operation";
}

module.exports = {
  COLLECTIONS,
  PROTOCOL_VERSION,
  appendSnapshotChanges,
  collectSnapshotChanges,
  hashPayload,
  sanitizePayload
};
