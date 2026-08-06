const crypto = require("node:crypto");
const { PROTOCOL_VERSION, evaluatePullDiagnosticAccess } = require("./sync-pull-config");
const { sanitizePayload } = require("./sync-change-log");
const { logTechnical } = require("./technical-logs");

function encodeCursor(data, secret) {
  const body = Buffer.from(JSON.stringify(data)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function decodeCursor(value, { companyId, config, maximumSeq }) {
  if (typeof value !== "string" || !value || value.length > config.maxCursorLength) throw pullError("SYNC_CURSOR_INVALID", 400);
  const [body, signature, extra] = value.split(".");
  if (!body || !signature || extra) throw pullError("SYNC_CURSOR_INVALID", 400);
  const expected = crypto.createHmac("sha256", config.cursorSecret).update(body).digest();
  let actual;
  try { actual = Buffer.from(signature, "base64url"); } catch { throw pullError("SYNC_CURSOR_INVALID", 400); }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) throw pullError("SYNC_CURSOR_INVALID", 400);
  let cursor;
  try { cursor = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { throw pullError("SYNC_CURSOR_INVALID", 400); }
  if (cursor.protocolVersion !== PROTOCOL_VERSION) throw pullError("SYNC_CURSOR_PROTOCOL_UNSUPPORTED", 409, { expectedProtocolVersion: PROTOCOL_VERSION });
  if (cursor.companyId !== companyId) throw pullError("SYNC_CURSOR_COMPANY_MISMATCH", 403);
  if (cursor.configVersion !== config.configVersion) throw pullError("SYNC_CURSOR_INVALID", 409, { reason: "CONFIG_VERSION_MISMATCH" });
  if (!Number.isSafeInteger(cursor.lastChangeSeq) || !Number.isSafeInteger(cursor.watermark) || cursor.lastChangeSeq < 0 || cursor.watermark < cursor.lastChangeSeq) throw pullError("SYNC_CURSOR_INVALID", 400);
  if (cursor.lastChangeSeq > maximumSeq || cursor.watermark > maximumSeq) throw pullError("SYNC_CURSOR_FUTURE", 409);
  if (cursor.lastChangeSeq < config.minimumAvailableSequence) {
    throw pullError("SYNC_CURSOR_EXPIRED", 410, { minimumAvailableSequence: config.minimumAvailableSequence, expectedProtocolVersion: PROTOCOL_VERSION });
  }
  return cursor;
}

async function diagnosticPull(repository, options) {
  const startedAt = Date.now();
  const { config, companyId } = options;
  if (!options.accessGranted) {
    const access = evaluatePullDiagnosticAccess(config, companyId);
    if (!access.enabled) throw pullError("SYNC_PULL_DISABLED", 404, { reason: access.reason });
  }
  if (options.modules !== undefined) throw pullError("SYNC_MODULE_FILTER_UNSUPPORTED", 400);
  const limit = parseLimit(options.limit, config);
  const maximumSeq = await repository.maximumSequence(companyId, config.queryTimeoutMs);
  let cursor = options.cursor
    ? decodeCursor(options.cursor, { companyId, config, maximumSeq })
    : initialCursor(companyId, maximumSeq, config);
  if (options.rollingWatermark && cursor.lastChangeSeq === cursor.watermark && maximumSeq > cursor.watermark) {
    cursor = { ...cursor, watermark: maximumSeq, snapshotRevision: maximumSeq, issuedAt: new Date().toISOString() };
  }
  const rows = await repository.listChanges({ companyId, after: cursor.lastChangeSeq, watermark: cursor.watermark, limit: limit + 1, timeoutMs: config.queryTimeoutMs, entityTypes: options.entityTypes || null });
  const changes = [];
  for (const row of rows.slice(0, limit)) {
    const change = publicChange(row);
    changes.push(change);
  }
  const fromCursor = options.cursor || encodeCursor(cursor, config.cursorSecret);
  let result;
  let responseBytes;
  do {
    const exhausted = rows.length === changes.length;
    const lastChangeSeq = options.advanceToWatermarkWhenExhausted && exhausted
      ? cursor.watermark
      : changes.length ? changes.at(-1).sequence : cursor.lastChangeSeq;
    const nextCursor = encodeCursor({ ...cursor, lastChangeSeq }, config.cursorSecret);
    result = { ok: true, protocolVersion: PROTOCOL_VERSION, mode: options.mode || "diagnostic", fromCursor, nextCursor, hasMore: rows.length > changes.length, changeCount: changes.length, snapshotRevision: cursor.watermark, changes };
    responseBytes = Buffer.byteLength(JSON.stringify(result));
    if (responseBytes <= config.maxResponseBytes) break;
    changes.pop();
  } while (changes.length > 0);
  if (responseBytes > config.maxResponseBytes) throw pullError("SYNC_PULL_RESPONSE_TOO_LARGE", 413);
  logTechnical("info", changes.length ? "sync_diagnostic_pull_total" : "sync_diagnostic_pull_empty_total", { companyId, result: "ok", protocolVersion: PROTOCOL_VERSION, limit, changeCount: changes.length, responseBytes, durationMs: Date.now() - startedAt });
  logTechnical("info", "sync_diagnostic_pull_changes_total", { companyId, result: "ok", protocolVersion: PROTOCOL_VERSION, changeCount: changes.length });
  logTechnical("info", "sync_diagnostic_pull_bytes", { companyId, result: "ok", protocolVersion: PROTOCOL_VERSION, responseBytes });
  logTechnical("info", "sync_diagnostic_pull_duration_ms", { companyId, result: "ok", protocolVersion: PROTOCOL_VERSION, durationMs: Date.now() - startedAt });
  return result;
}

function initialCursor(companyId, watermark, config) {
  return { protocolVersion: PROTOCOL_VERSION, companyId, lastChangeSeq: 0, watermark, snapshotRevision: watermark, issuedAt: new Date().toISOString(), configVersion: config.configVersion };
}

function publicChange(row) {
  return {
    sequence: Number(row.changeSeq), module: row.module, entityType: row.entityType, entityId: row.entityId,
    action: row.action, recordVersion: Number(row.recordVersion), payloadHash: row.payloadHash,
    payload: row.action === "DELETE" ? null : sanitizePayload(row.entityType, row.payload),
    origin: row.origin, occurredAt: new Date(row.occurredAt).toISOString(), isTombstone: Boolean(row.isTombstone)
  };
}

function parseLimit(value, config) {
  if (value === undefined || value === "") return Math.min(config.defaultLimit, config.maxLimit);
  if (!/^\d+$/.test(String(value))) throw pullError("SYNC_PULL_INVALID_LIMIT", 400);
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > config.maxLimit) throw pullError("SYNC_PULL_INVALID_LIMIT", 400, { maxLimit: config.maxLimit });
  return limit;
}

function pullError(code, statusCode, details = {}) {
  const error = new Error(code); error.code = code; error.statusCode = statusCode; error.details = details; return error;
}

module.exports = { decodeCursor, diagnosticPull, encodeCursor, initialCursor, parseLimit, pullError, publicChange };
