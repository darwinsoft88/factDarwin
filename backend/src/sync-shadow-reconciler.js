const { collectSnapshotChanges, hashPayload, sanitizePayload } = require("./sync-change-log");
const { logTechnical } = require("./technical-logs");

const NORMALIZED_TABLES = Object.freeze({
  user: "users",
  client: "clients",
  product: "products",
  sale: "sales",
  inventory_movement: "inventory_movements",
  audit_log: "audit_logs",
  remission_guide: "remission_guides",
  cash_closing: "cash_closings"
});

async function reconcileSyncShadow(client, companyId) {
  const startedAt = Date.now();
  const normalizedCompanyId = String(companyId || "").trim();
  if (!normalizedCompanyId) throw new Error("companyId es obligatorio para reconciliar shadow logging.");

  const [snapshotResult, logResult] = await Promise.all([
    client.query("SELECT data, updated_at FROM saas_snapshots WHERE company_id = $1", [normalizedCompanyId]),
    client.query(
      `SELECT change_seq, module, entity_type, entity_id, action, record_version,
              payload, payload_hash, request_id, operation_id, device_id, user_id,
              origin, occurred_at, transaction_id, is_tombstone
       FROM sync_change_log WHERE company_id = $1 ORDER BY change_seq ASC`,
      [normalizedCompanyId]
    )
  ]);
  const snapshot = objectValue(snapshotResult.rows[0]?.data);
  const issues = [];
  const latest = new Map();
  const versions = new Map();
  let previousSeq = 0;
  let payloadBytes = 0;
  let tombstones = 0;

  for (const row of logResult.rows) {
    const seq = Number(row.change_seq);
    const key = `${row.entity_type}:${row.entity_id}`;
    const version = Number(row.record_version);
    if (seq <= previousSeq) issues.push(issue("CHANGE_SEQUENCE_NOT_MONOTONIC", key, { seq, previousSeq }));
    previousSeq = seq;
    const expectedVersion = (versions.get(key) || 0) + 1;
    if (version !== expectedVersion) issues.push(issue("RECORD_VERSION_GAP", key, { expectedVersion, actualVersion: version }));
    versions.set(key, version);
    const payload = row.payload === null ? null : objectValue(row.payload);
    const actualHash = hashPayload(payload);
    if (actualHash !== row.payload_hash) issues.push(issue("PAYLOAD_HASH_MISMATCH", key, { seq }));
    if ((row.action === "DELETE") !== Boolean(row.is_tombstone)) issues.push(issue("TOMBSTONE_FLAG_MISMATCH", key, { seq }));
    if (row.action === "DELETE" && payload !== null) issues.push(issue("TOMBSTONE_PAYLOAD_PRESENT", key, { seq }));
    if (row.action === "DELETE") tombstones += 1;
    payloadBytes += payload === null ? 0 : Buffer.byteLength(JSON.stringify(payload), "utf8");
    latest.set(key, { ...row, payload });
  }

  const expected = expectedSnapshotEntities(snapshot);
  for (const [key, entity] of expected) {
    const change = latest.get(key);
    if (!change) {
      issues.push(issue("MISSING_CHANGE", key));
      continue;
    }
    if (change.action !== "UPSERT") {
      issues.push(issue("LIVE_ENTITY_HAS_TOMBSTONE", key, { seq: Number(change.change_seq) }));
      continue;
    }
    if (hashPayload(entity.payload) !== change.payload_hash) {
      issues.push(issue("SNAPSHOT_LOG_DIVERGENCE", key, { seq: Number(change.change_seq) }));
    }
  }
  for (const [key, change] of latest) {
    if (change.action === "UPSERT" && !expected.has(key)) {
      issues.push(issue("ORPHAN_CHANGE", key, { seq: Number(change.change_seq) }));
    }
  }

  const normalized = await compareNormalizedCounts(client, normalizedCompanyId, expected);
  issues.push(...normalized.issues);
  const result = {
    companyId: normalizedCompanyId,
    status: issues.length ? "mismatch" : "consistent",
    snapshotUpdatedAt: snapshotResult.rows[0]?.updated_at || null,
    changeCount: logResult.rows.length,
    entityCount: expected.size,
    tombstones,
    payloadBytes,
    latestChangeSeq: previousSeq || null,
    durationMs: Date.now() - startedAt,
    issues,
    normalized: normalized.summary
  };
  logTechnical(issues.length ? "warn" : "info", "sync_shadow_reconciliation", {
    companyId: normalizedCompanyId,
    status: result.status,
    durationMs: result.durationMs,
    changeCount: result.changeCount,
    issueCount: issues.length,
    issueCodes: [...new Set(issues.map((item) => item.code))]
  });
  return result;
}

function expectedSnapshotEntities(snapshot) {
  const changes = collectSnapshotChanges({}, snapshot);
  return new Map(changes.map((change) => [
    `${change.entityType}:${change.entityId}`,
    { ...change, payload: sanitizePayload(change.entityType, change.payload) }
  ]));
}

async function compareNormalizedCounts(client, companyId, expected) {
  const summary = {};
  const issues = [];
  for (const [entityType, table] of Object.entries(NORMALIZED_TABLES)) {
    const expectedCount = [...expected.keys()].filter((key) => key.startsWith(`${entityType}:`)).length;
    const available = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = $1 AND column_name = 'company_id'
       ) AS available`,
      [table]
    );
    if (!available.rows[0]?.available) {
      summary[entityType] = { status: "UNAVAILABLE", expectedCount };
      continue;
    }
    const result = await client.query(`SELECT COUNT(*)::bigint AS count FROM ${table} WHERE company_id = $1`, [companyId]);
    const actualCount = Number(result.rows[0]?.count || 0);
    summary[entityType] = { status: "AVAILABLE", expectedCount, actualCount };
    if (actualCount !== expectedCount) issues.push(issue("NORMALIZED_COUNT_MISMATCH", entityType, { expectedCount, actualCount }));
  }
  for (const entityType of ["credit_payment", "credit_adjustment", "received_retention", "issuer", "license"]) {
    summary[entityType] = { status: "UNAVAILABLE", expectedCount: [...expected.keys()].filter((key) => key.startsWith(`${entityType}:`)).length };
  }
  return { summary, issues };
}

function issue(code, entity, details = {}) {
  return { code, entity, ...details };
}

function objectValue(value) {
  if (!value) return {};
  return typeof value === "string" ? JSON.parse(value) : value;
}

module.exports = { NORMALIZED_TABLES, reconcileSyncShadow };
