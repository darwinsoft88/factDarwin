import type { AppData, Sale } from "../../types";
import type { HistoricalDocumentSummary } from "../../services/backendApi/documentHistory";
import { validateHistoricalDocumentPage } from "../../services/backendApi/documentHistory";
import { historicalDocumentPaginationEnabled } from "../../services/documentHistoryFeature";
import { filterDocumentSales } from "../../hooks/useSalesDocumentList";
import {
  appendHistoricalPage,
  combineDocumentHistory,
  historicalStateAfterFailure,
  historicalStateAfterPage,
  initialHistoricalDocumentsState,
  pageContainingFirstAppendedItem,
} from "../documentHistory";

function sale(id: string, status: Sale["status"] = "AUTORIZADA", createdAt = "2026-08-08T12:00:00.000Z"): Sale {
  return { id, documentType: "factura", establishment: "002", emissionPoint: "010", clientId: `client-${id}`, userId: "user", createdAt, sequence: id.padStart(9, "0"), accessKey: "", subtotal: 1, tax: 0.15, total: 1.15, paymentMethod: "01", status, items: [] };
}

function summary(id: string, createdAt = "2025-01-01T12:00:00.000Z"): HistoricalDocumentSummary {
  return { documentId: id, documentType: "factura", establishment: "002", emissionPoint: "010", sequential: id.padStart(9, "0"), issueDate: "01/01/2025", createdAt, clientId: `client-${id}`, clientDisplayName: `Cliente historico ${id}`, totalMicros: "1150000", paymentCondition: "contado", status: "AUTORIZADA", sriStatus: "AUTORIZADA", emailStatus: "none", hasAuthorizedXml: true, hasRideData: true };
}

function page(items: HistoricalDocumentSummary[], overrides: Record<string, unknown> = {}) {
  return { ok: true, protocolVersion: 1, mode: "historical-read-only", items, nextCursor: null, hasMore: false, queryWatermark: "10", countReturned: items.length, ...overrides };
}

const data = { clients: [], issuer: { establishment: "002", emissionPoint: "010" } } as unknown as AppData;

describe("Etapa 3.5D - historial paginado controlado", () => {
  it("1. mantiene el comportamiento actual con el flag apagado", () => expect(historicalDocumentPaginationEnabled(undefined)).toBe(false));
  it("2. inicia solo con snapshot y sin historial solicitado", () => {
    const state = initialHistoricalDocumentsState();
    expect(state.requested).toBe(false);
    expect(combineDocumentHistory([sale("1")], state.items).sales).toHaveLength(1);
  });
  it("3. agrega una pagina historica", () => expect(historicalStateAfterPage(initialHistoricalDocumentsState(), [summary("2")], "cursor", true).items).toHaveLength(1));
  it("4. agrega varias paginas conservando las anteriores", () => {
    const first = historicalStateAfterPage(initialHistoricalDocumentsState(), [summary("1")], "a", true);
    expect(historicalStateAfterPage(first, [summary("2")], null, false).items.map((item) => item.documentId)).toEqual(["1", "2"]);
  });
  it("5. reconoce una pagina final vacia", () => expect(historicalStateAfterPage(initialHistoricalDocumentsState(), [], null, false)).toMatchObject({ hasMore: false, requested: true }));
  it("6. rechaza paginas mayores a 100", () => expect(() => validateHistoricalDocumentPage(page(Array.from({ length: 101 }, (_, index) => summary(String(index)))))).toThrow("HISTORICAL_DOCUMENTS_RESPONSE_INVALID"));
  it("7. deduplica un documento presente en snapshot e historial", () => expect(combineDocumentHistory([sale("1")], [summary("1")]).sales).toHaveLength(1));
  it("8. conserva exactamente la version operativa del snapshot", () => {
    const current = sale("1", "ERROR_SRI");
    expect(combineDocumentHistory([current], [summary("1")]).sales[0]).toBe(current);
  });
  it("9. deduplica documentos repetidos entre paginas", () => expect(appendHistoricalPage([summary("1")], [summary("1"), summary("2")])).toHaveLength(2));
  it("10. repetir la misma pagina es idempotente", () => {
    const once = appendHistoricalPage([], [summary("1")]);
    expect(appendHistoricalPage(once, [summary("1")])).toEqual(once);
  });
  it("11. rechaza un contrato HTTP invalido", () => expect(() => validateHistoricalDocumentPage({ ok: false })).toThrow("HISTORICAL_DOCUMENTS_RESPONSE_INVALID"));
  it("12. un timeout suspende remoto sin borrar datos", () => {
    const loaded = historicalStateAfterPage(initialHistoricalDocumentsState(), [summary("1")], "x", true);
    expect(historicalStateAfterFailure(loaded)).toMatchObject({ suspended: true, items: loaded.items });
  });
  it("13. rechaza un item mal formado", () => expect(() => validateHistoricalDocumentPage(page([{ ...summary("1"), totalMicros: "x" }]))).toThrow("HISTORICAL_DOCUMENTS_RESPONSE_INVALID"));
  it("14. perdida de conexion conserva el cursor y paginas", () => {
    const loaded = historicalStateAfterPage(initialHistoricalDocumentsState(), [summary("1")], "cursor", true);
    expect(historicalStateAfterFailure(loaded)).toMatchObject({ nextCursor: "cursor", hasMore: true });
  });
  it("15. fallback local permanece inmediato", () => expect(combineDocumentHistory([sale("1")], []).sales[0]!.id).toBe("1"));
  it("16. conserva paginas cargadas despues de fallo", () => {
    const failed = historicalStateAfterFailure(historicalStateAfterPage(initialHistoricalDocumentsState(), [summary("1")], "x", true));
    expect(combineDocumentHistory([sale("2")], failed.items).sales).toHaveLength(2);
  });
  it("17. un contexto nuevo comienza sin paginas de Empresa A", () => expect(initialHistoricalDocumentsState().items).toEqual([]));
  it("18. el mismo documentId se aisla al combinar cada empresa", () => {
    expect(combineDocumentHistory([], [summary("1")]).sales).toHaveLength(1);
    expect(combineDocumentHistory([sale("1")], []).sales).toHaveLength(1);
  });
  it("19. regresar a una empresa reconstruye desde sus fuentes actuales", () => expect(combineDocumentHistory([sale("A")], []).sales.map((item) => item.id)).toEqual(["A"]));
  it("20. reapertura no conserva cursor en memoria", () => expect(initialHistoricalDocumentsState().nextCursor).toBeNull());
  it("21. busca sobre el nombre historico combinado", () => {
    const combined = combineDocumentHistory([], [summary("1")]);
    expect(filterDocumentSales(combined.sales, data, { invoiceSearch: "historico", saleEndDate: "", saleStartDate: "", statusFilter: "TODAS", historicalClientNames: combined.historicalClientNames })).toHaveLength(1);
  });
  it("22. filtra el conjunto combinado por estado", () => {
    const combined = combineDocumentHistory([sale("1", "ERROR_SRI")], [summary("2")]);
    expect(filterDocumentSales(combined.sales, data, { invoiceSearch: "", saleEndDate: "", saleStartDate: "", statusFilter: "AUTORIZADA" })).toHaveLength(1);
  });
  it("23. conserva la referencia y acciones del documento reciente", () => {
    const local = sale("1");
    expect(combineDocumentHistory([local], [summary("1")]).sales[0]).toBe(local);
  });
  it("24. identifica por separado el resumen historico no operativo", () => expect(combineDocumentHistory([], [summary("1")]).historicalIds.has("1")).toBe(true));
  it("25. una pagina de un historial de miles carga como maximo 100", () => {
    const simulatedPage = Array.from({ length: 100 }, (_, index) => summary(String(index)));
    expect(validateHistoricalDocumentPage(page(simulatedPage)).countReturned).toBe(100);
  });
  it("combina 10.000 documentos locales con una sola pagina remota sin cargar el resto", () => {
    const locals = Array.from({ length: 10_000 }, (_, index) => sale(`L${index}`, "AUTORIZADA", new Date(1_700_000_000_000 - index * 1000).toISOString()));
    const remotePage = Array.from({ length: 100 }, (_, index) => summary(`H${index}`));
    const startedAt = Date.now();
    expect(combineDocumentHistory(locals, remotePage).sales).toHaveLength(10_100);
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });
  it("26. un tombstone impide que el remoto reintroduzca el documento", () => expect(combineDocumentHistory([], [summary("1")], ["1"]).sales).toEqual([]));
  it("abre la pagina que contiene el primer historico agregado sin saltarlo", () => {
    expect(pageContainingFirstAppendedItem(15, 10)).toBe(2);
    expect(pageContainingFirstAppendedItem(20, 10)).toBe(3);
  });
  it("acepta el flag solamente con valores explicitos", () => {
    expect(historicalDocumentPaginationEnabled("1")).toBe(true);
    expect(historicalDocumentPaginationEnabled("true")).toBe(true);
    expect(historicalDocumentPaginationEnabled("yes")).toBe(false);
  });
  it("rechaza pagina con duplicados internos", () => expect(() => validateHistoricalDocumentPage(page([summary("1"), summary("1")]))).toThrow("HISTORICAL_DOCUMENTS_DUPLICATE_PAGE"));
  it("rechaza hasMore sin cursor opaco", () => expect(() => validateHistoricalDocumentPage(page([summary("1")], { hasMore: true }))).toThrow("HISTORICAL_DOCUMENTS_RESPONSE_INVALID"));
});
