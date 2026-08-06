const assert = require("node:assert/strict");
const test = require("node:test");
const { buildDocumentHistoryConfig } = require("../document-history-config");
const {
  decodeHistoryCursor,
  encodeHistoryCursor,
  hashFilters,
  historicalDocumentsPage,
  normalizeHistoryFilters
} = require("../document-history");

function config(overrides = {}) {
  return {
    ...buildDocumentHistoryConfig({
      NODE_ENV: "test",
      HISTORICAL_DOCUMENT_PAGINATION_ENABLED: "true",
      HISTORICAL_DOCUMENT_PAGINATION_MODE: "pilot",
      HISTORICAL_DOCUMENT_PAGINATION_CONFIG_VERSION: "1",
      HISTORICAL_DOCUMENT_PAGINATION_COMPANY_IDS: "company",
      HISTORICAL_DOCUMENT_PAGINATION_CURSOR_SECRET: "h".repeat(32)
    }, "jwt"),
    ...overrides
  };
}

function row(id, createdAt, sequenceNumber) {
  return {
    documentId: id,
    establishment: "002",
    emissionPoint: "010",
    sequence: String(sequenceNumber).padStart(9, "0"),
    sequenceNumber,
    issueDate: createdAt.slice(0, 10),
    createdAt,
    clientId: "client-1",
    clientName: "Cliente Prueba",
    clientIdentification: "1723772099",
    totalMicros: "1400000",
    paymentCondition: "contado",
    creditBalanceMicros: null,
    authorizationNumber: `authorization-${id}`,
    inventoryStatus: "APPLIED",
    emailStatus: "accepted",
    hasAuthorizedXml: true,
    hasRideData: true
  };
}

test("cursor firmado queda ligado a empresa, filtros, protocolo y expiracion", () => {
  const c = config();
  const filters = normalizeHistoryFilters({ documentScope: "002-010" });
  const cursorData = {
    protocolVersion: 1,
    configVersion: "1",
    companyId: "company",
    documentScope: "002-010",
    filterHash: hashFilters(filters),
    queryWatermark: "10",
    lastCreatedAt: "2026-08-01T10:00:00.000Z",
    lastSequenceNumber: 10,
    lastDocumentId: "sale-10",
    issuedAt: "2026-08-01T10:00:00.000Z"
  };
  const encoded = encodeHistoryCursor(cursorData, c.cursorSecret);
  const decoded = decodeHistoryCursor(encoded, {
    companyId: "company",
    config: c,
    filterHash: cursorData.filterHash,
    maximumSequence: "10",
    now: Date.parse("2026-08-01T11:00:00.000Z")
  });
  assert.equal(decoded.lastDocumentId, "sale-10");
  assert.throws(() => decodeHistoryCursor(`${encoded}x`, {
    companyId: "company", config: c, filterHash: cursorData.filterHash, maximumSequence: "10"
  }), { code: "HISTORICAL_DOCUMENTS_CURSOR_INVALID" });
  assert.throws(() => decodeHistoryCursor(encoded, {
    companyId: "other", config: c, filterHash: cursorData.filterHash, maximumSequence: "10"
  }), { code: "HISTORICAL_DOCUMENTS_COMPANY_MISMATCH" });
  assert.throws(() => decodeHistoryCursor(encoded, {
    companyId: "company", config: c, filterHash: "different", maximumSequence: "10"
  }), { code: "HISTORICAL_DOCUMENTS_FILTER_MISMATCH" });
  assert.throws(() => decodeHistoryCursor(encoded, {
    companyId: "company", config: { ...c, configVersion: "2" }, filterHash: cursorData.filterHash, maximumSequence: "10"
  }), { code: "HISTORICAL_DOCUMENTS_CURSOR_INVALID" });
  assert.throws(() => decodeHistoryCursor(encoded, {
    companyId: "company", config: c, filterHash: cursorData.filterHash, maximumSequence: "10",
    now: Date.parse("2026-08-03T11:00:00.000Z")
  }), { code: "HISTORICAL_DOCUMENTS_CURSOR_EXPIRED" });
  assert.throws(() => decodeHistoryCursor("x".repeat(4097), {
    companyId: "company", config: c, filterHash: cursorData.filterHash, maximumSequence: "10"
  }), { code: "HISTORICAL_DOCUMENTS_CURSOR_INVALID" });
});

test("primera pagina fija watermark y pagina siguiente usa keyset", async () => {
  const all = [
    row("sale-3", "2026-08-01T12:00:00.000Z", 3),
    row("sale-2", "2026-08-01T11:00:00.000Z", 2),
    row("sale-1", "2026-08-01T10:00:00.000Z", 1)
  ];
  const calls = [];
  const repository = {
    maximumSequence: async () => "25",
    listPage: async (query) => {
      calls.push(query);
      if (!query.after) return all.slice(0, query.limit);
      return all.filter((item) => item.documentId === "sale-1");
    }
  };
  const first = await historicalDocumentsPage(repository, {
    companyId: "company", config: config({ defaultLimit: 2, maxLimit: 2 }), query: { documentScope: "002-010" }
  });
  assert.equal(first.queryWatermark, "25");
  assert.equal(first.items.length, 2);
  assert.equal(first.hasMore, true);
  assert.equal(first.items[0].clientIdentificationMasked, "******2099");
  assert.equal(first.items[0].authorizationNumber, undefined);
  const second = await historicalDocumentsPage(repository, {
    companyId: "company", config: config({ defaultLimit: 2, maxLimit: 2 }), query: { documentScope: "002-010", cursor: first.nextCursor }
  });
  assert.deepEqual(second.items.map((item) => item.documentId), ["sale-1"]);
  assert.equal(calls[1].watermark, "25");
  assert.deepEqual(calls[1].after, {
    createdAt: "2026-08-01T11:00:00.000Z",
    sequenceNumber: 2,
    documentId: "sale-2"
  });
});

test("solo acepta factura autorizada, alcance y busqueda exacta limitada", () => {
  assert.throws(() => normalizeHistoryFilters({ documentScope: "bad" }), { code: "HISTORICAL_DOCUMENTS_SCOPE_INVALID" });
  assert.throws(() => normalizeHistoryFilters({ documentScope: "002-010", documentType: "nota_credito" }), { code: "HISTORICAL_DOCUMENTS_TYPE_UNSUPPORTED" });
  assert.throws(() => normalizeHistoryFilters({ documentScope: "002-010", status: "ERROR_SRI" }), { code: "HISTORICAL_DOCUMENTS_STATUS_UNSUPPORTED" });
  assert.throws(() => normalizeHistoryFilters({ documentScope: "002-010", search: "ab" }), { code: "HISTORICAL_DOCUMENTS_SEARCH_INVALID" });
});

test("timeout y error PostgreSQL se clasifican sin exponer detalles", async () => {
  const timedOut = { maximumSequence: async () => { const error = new Error("statement details"); error.code = "57014"; throw error; } };
  await assert.rejects(historicalDocumentsPage(timedOut, {
    companyId: "company", config: config(), query: { documentScope: "002-010" }
  }), { code: "HISTORICAL_DOCUMENTS_QUERY_TIMEOUT", statusCode: 504 });
  const failed = { maximumSequence: async () => { throw new Error("sensitive database details"); } };
  await assert.rejects(historicalDocumentsPage(failed, {
    companyId: "company", config: config(), query: { documentScope: "002-010" }
  }), { code: "HISTORICAL_DOCUMENTS_DATABASE_ERROR", statusCode: 503 });
});

test("rechaza identidades duplicadas sin entregar una pagina ambigua", async () => {
  const duplicate = row("sale-1", "2026-08-01T10:00:00.000Z", 1);
  await assert.rejects(historicalDocumentsPage({
    maximumSequence: async () => "2",
    listPage: async () => [duplicate, { ...duplicate }]
  }, {
    companyId: "company",
    config: config(),
    query: { documentScope: "002-010" }
  }), { code: "HISTORICAL_DOCUMENTS_DUPLICATE_DETECTED", statusCode: 409 });
});
