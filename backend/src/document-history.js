const crypto = require("node:crypto");
const { HISTORY_PROTOCOL_VERSION } = require("./document-history-config");
const { logTechnical } = require("./technical-logs");

function encodeHistoryCursor(cursor, secret) {
  const body = Buffer.from(JSON.stringify(cursor)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function decodeHistoryCursor(value, context) {
  const { companyId, config, filterHash, maximumSequence, now = Date.now() } = context;
  if (typeof value !== "string" || !value || value.length > config.maxCursorLength) {
    throw historyError("HISTORICAL_DOCUMENTS_CURSOR_INVALID", 400);
  }
  const [body, signature, extra] = value.split(".");
  if (!body || !signature || extra) throw historyError("HISTORICAL_DOCUMENTS_CURSOR_INVALID", 400);
  const expected = crypto.createHmac("sha256", config.cursorSecret).update(body).digest();
  let actual;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    throw historyError("HISTORICAL_DOCUMENTS_CURSOR_INVALID", 400);
  }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw historyError("HISTORICAL_DOCUMENTS_CURSOR_INVALID", 400);
  }
  let cursor;
  try {
    cursor = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw historyError("HISTORICAL_DOCUMENTS_CURSOR_INVALID", 400);
  }
  if (cursor.protocolVersion !== HISTORY_PROTOCOL_VERSION) throw historyError("HISTORICAL_DOCUMENTS_PROTOCOL_UNSUPPORTED", 409);
  if (cursor.configVersion !== config.configVersion) throw historyError("HISTORICAL_DOCUMENTS_CURSOR_INVALID", 409, { reason: "CONFIG_VERSION_MISMATCH" });
  if (cursor.companyId !== companyId) throw historyError("HISTORICAL_DOCUMENTS_COMPANY_MISMATCH", 403);
  if (cursor.filterHash !== filterHash) throw historyError("HISTORICAL_DOCUMENTS_FILTER_MISMATCH", 409);
  if (!isBigintText(cursor.queryWatermark) || BigInt(cursor.queryWatermark) > BigInt(maximumSequence)) {
    throw historyError("HISTORICAL_DOCUMENTS_CURSOR_FUTURE", 409);
  }
  const issuedAt = Date.parse(cursor.issuedAt);
  if (!Number.isFinite(issuedAt) || now - issuedAt > config.cursorTtlMs || issuedAt > now + 60_000) {
    throw historyError("HISTORICAL_DOCUMENTS_CURSOR_EXPIRED", 410);
  }
  if (!cursor.lastCreatedAt || !Number.isSafeInteger(cursor.lastSequenceNumber) || !cursor.lastDocumentId) {
    throw historyError("HISTORICAL_DOCUMENTS_CURSOR_INVALID", 400);
  }
  if (!Number.isFinite(Date.parse(cursor.lastCreatedAt))) throw historyError("HISTORICAL_DOCUMENTS_CURSOR_INVALID", 400);
  return cursor;
}

async function historicalDocumentsPage(repository, options) {
  const startedAt = Date.now();
  const { companyId, config } = options;
  const filters = normalizeHistoryFilters(options.query || {});
  const filterHash = hashFilters(filters);
  const limit = parseHistoryLimit(options.query?.limit, config);
  let maximumSequence;
  try {
    maximumSequence = await repository.maximumSequence(companyId, config.queryTimeoutMs);
  } catch (error) {
    throw repositoryError(error);
  }
  const cursor = options.query?.cursor
    ? decodeHistoryCursor(options.query.cursor, { companyId, config, filterHash, maximumSequence })
    : null;
  const watermark = cursor?.queryWatermark || maximumSequence;
  let rows;
  try {
    rows = await repository.listPage({
      companyId,
      filters,
      watermark,
      after: cursor ? {
        createdAt: cursor.lastCreatedAt,
        sequenceNumber: cursor.lastSequenceNumber,
        documentId: cursor.lastDocumentId
      } : null,
      limit: limit + 1,
      timeoutMs: config.queryTimeoutMs
    });
  } catch (error) {
    throw repositoryError(error);
  }
  const hasExtraRow = rows.length > limit;
  const selectedRows = rows.slice(0, limit);
  const identities = new Set();
  for (const row of selectedRows) {
    const identity = `${companyId}:factura:${String(row.documentId)}`;
    if (identities.has(identity)) {
      logTechnical("warn", "historical_documents_duplicate_detected", {
        companyId,
        result: "duplicate",
        documentIdHash: crypto.createHash("sha256").update(String(row.documentId)).digest("hex").slice(0, 16)
      });
      throw historyError("HISTORICAL_DOCUMENTS_DUPLICATE_DETECTED", 409);
    }
    identities.add(identity);
  }
  const items = selectedRows.map(publicSummary);
  let response;
  let responseBytes;
  do {
    const last = selectedRows[items.length - 1];
    const hasMore = hasExtraRow || items.length < Math.min(limit, rows.length);
    const nextCursor = hasMore && last ? encodeHistoryCursor({
      protocolVersion: HISTORY_PROTOCOL_VERSION,
      configVersion: config.configVersion,
      companyId,
      documentScope: filters.documentScope,
      filterHash,
      queryWatermark: String(watermark),
      lastCreatedAt: new Date(last.createdAt).toISOString(),
      lastSequenceNumber: Number(last.sequenceNumber),
      lastDocumentId: String(last.documentId),
      issuedAt: cursor?.issuedAt || new Date().toISOString()
    }, config.cursorSecret) : null;
    response = {
      ok: true,
      protocolVersion: HISTORY_PROTOCOL_VERSION,
      mode: "historical-read-only",
      items,
      nextCursor,
      hasMore,
      queryWatermark: String(watermark),
      countReturned: items.length
    };
    responseBytes = Buffer.byteLength(JSON.stringify(response));
    if (responseBytes <= config.maxResponseBytes) break;
    items.pop();
  } while (items.length);
  if (responseBytes > config.maxResponseBytes) throw historyError("HISTORICAL_DOCUMENTS_RESPONSE_TOO_LARGE", 413);
  logTechnical("info", "historical_documents_page_completed", {
    companyId,
    result: "ok",
    countReturned: items.length,
    hasMore: response.hasMore,
    responseBytes,
    durationMs: Date.now() - startedAt
  });
  logTechnical("info", "historical_documents_items_returned", { companyId, countReturned: items.length });
  logTechnical("info", "historical_documents_bytes", { companyId, responseBytes });
  logTechnical("info", "historical_documents_duration_ms", { companyId, durationMs: Date.now() - startedAt });
  if (!items.length) logTechnical("info", "historical_documents_empty_page", { companyId, result: "empty" });
  return response;
}

function normalizeHistoryFilters(query) {
  const documentScope = String(query.documentScope || "").trim();
  if (!/^\d{3}-\d{3}$/.test(documentScope)) throw historyError("HISTORICAL_DOCUMENTS_SCOPE_INVALID", 400);
  const dateFrom = normalizeDate(query.dateFrom, "dateFrom");
  const dateTo = normalizeDate(query.dateTo, "dateTo");
  if (dateFrom && dateTo && dateFrom > dateTo) throw historyError("HISTORICAL_DOCUMENTS_DATE_RANGE_INVALID", 400);
  const search = String(query.search || "").trim();
  if (search && (search.length < 3 || search.length > 80)) throw historyError("HISTORICAL_DOCUMENTS_SEARCH_INVALID", 400);
  if (query.documentType && query.documentType !== "factura") throw historyError("HISTORICAL_DOCUMENTS_TYPE_UNSUPPORTED", 400);
  if (query.status && query.status !== "AUTORIZADA") throw historyError("HISTORICAL_DOCUMENTS_STATUS_UNSUPPORTED", 400);
  return { documentScope, dateFrom, dateTo, search, documentType: "factura", status: "AUTORIZADA" };
}

function normalizeDate(value, field) {
  if (value === undefined || value === null || value === "") return "";
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00.000Z`))) {
    throw historyError("HISTORICAL_DOCUMENTS_DATE_INVALID", 400, { field });
  }
  return text;
}

function hashFilters(filters) {
  return crypto.createHash("sha256").update(JSON.stringify(filters)).digest("hex");
}

function parseHistoryLimit(value, config) {
  if (value === undefined || value === "") return Math.min(config.defaultLimit, config.maxLimit);
  if (!/^\d+$/.test(String(value))) throw historyError("HISTORICAL_DOCUMENTS_LIMIT_INVALID", 400);
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > config.maxLimit) {
    throw historyError("HISTORICAL_DOCUMENTS_LIMIT_INVALID", 400, { maxLimit: config.maxLimit });
  }
  return limit;
}

function publicSummary(row) {
  return {
    documentId: String(row.documentId),
    documentType: "factura",
    establishment: String(row.establishment),
    emissionPoint: String(row.emissionPoint),
    sequential: String(row.sequence),
    issueDate: String(row.issueDate),
    createdAt: new Date(row.createdAt).toISOString(),
    clientId: String(row.clientId || ""),
    clientDisplayName: String(row.clientName || "Cliente"),
    clientIdentificationMasked: maskIdentifier(row.clientIdentification),
    totalMicros: String(row.totalMicros),
    paymentCondition: row.paymentCondition || undefined,
    creditBalanceMicros: row.creditBalanceMicros === null || row.creditBalanceMicros === undefined ? undefined : String(row.creditBalanceMicros),
    status: "AUTORIZADA",
    sriStatus: "AUTORIZADA",
    authorizationNumberMasked: maskAuthorization(row.authorizationNumber),
    inventoryStatus: row.inventoryStatus || undefined,
    emailStatus: normalizeEmailStatus(row.emailStatus),
    hasAuthorizedXml: Boolean(row.hasAuthorizedXml),
    hasRideData: Boolean(row.hasRideData)
  };
}

function maskIdentifier(value) {
  const text = String(value || "");
  if (text.length <= 4) return text ? "*".repeat(text.length) : undefined;
  return `${"*".repeat(text.length - 4)}${text.slice(-4)}`;
}

function maskAuthorization(value) {
  const text = String(value || "");
  if (!text) return undefined;
  if (text.length <= 8) return `${text.slice(0, 2)}***${text.slice(-2)}`;
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function normalizeEmailStatus(value) {
  const status = String(value || "none").toLowerCase();
  return ["accepted", "failed", "uncertain"].includes(status) ? status : "none";
}

function historyError(code, statusCode, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function repositoryError(error) {
  if (error?.code === "57014") return historyError("HISTORICAL_DOCUMENTS_QUERY_TIMEOUT", 504);
  return historyError("HISTORICAL_DOCUMENTS_DATABASE_ERROR", 503);
}

function isBigintText(value) {
  return typeof value === "string" && /^\d+$/.test(value);
}

module.exports = {
  decodeHistoryCursor,
  encodeHistoryCursor,
  hashFilters,
  historicalDocumentsPage,
  historyError,
  normalizeHistoryFilters,
  parseHistoryLimit,
  publicSummary
};
