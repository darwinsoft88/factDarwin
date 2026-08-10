import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import type { AppData, Sale, User } from "../types";
import { activeScopeId } from "../utils/documents";
import { combineDocumentHistory, historicalStateAfterFailure, historicalStateAfterPage, initialHistoricalDocumentsState, type HistoricalDocumentsState } from "../utils/documentHistory";
import {
  getHistoricalDocumentsPage,
  HISTORICAL_DOCUMENT_PAGE_SIZE,
} from "../services/backendApi/documentHistory";
import { getIncrementalDeviceId } from "../services/incrementalDeviceIdentity";
import { historicalDocumentPaginationEnabled } from "../services/documentHistoryFeature";

type HistoryFilters = {
  search: string;
  startDate: string;
  endDate: string;
  status: string;
};

export function useHistoricalDocuments({
  active,
  backendToken,
  data,
  filters,
  localSales,
  user,
}: {
  active: boolean;
  backendToken: string;
  data: AppData;
  filters: HistoryFilters;
  localSales: Sale[];
  user: User;
}) {
  const enabled = active && historicalDocumentPaginationEnabled();
  const companyId = String(user.companyId || "").trim();
  const scope = activeScopeId(data);
  const normalizedSearch = filters.search.trim();
  const remoteEligible = (filters.status === "TODAS" || filters.status === "AUTORIZADA") && (!normalizedSearch || normalizedSearch.length >= 3);
  const contextKey = JSON.stringify([companyId, scope, filters.startDate, filters.endDate, normalizedSearch, filters.status]);
  const [state, setState] = useState<HistoricalDocumentsState>(() => initialHistoricalDocumentsState(contextKey));
  const [loadingOlder, setLoadingOlder] = useState(false);
  const stateRef = useRef(state);
  const requestActiveRef = useRef(false);
  const contextGenerationRef = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    contextGenerationRef.current += 1;
    requestActiveRef.current = false;
    setLoadingOlder(false);
    const initialState = initialHistoricalDocumentsState(contextKey);
    stateRef.current = initialState;
    setState(initialState);
    return () => {
      contextGenerationRef.current += 1;
      requestActiveRef.current = false;
    };
  }, [contextKey, enabled]);

  const contextState = state.contextKey === contextKey ? state : initialHistoricalDocumentsState(contextKey);
  const combined = useMemo(
    () => combineDocumentHistory(localSales, contextState.items, data.deletedIds?.sales || []),
    [contextState.items, data.deletedIds?.sales, localSales],
  );

  const loadOlder = useCallback(async (): Promise<number> => {
    const current = stateRef.current;
    if (current.contextKey !== contextKey) return 0;
    if (!enabled || !remoteEligible || !backendToken || !companyId || current.suspended || (current.requested && !current.hasMore) || requestActiveRef.current) {
      return 0;
    }
    requestActiveRef.current = true;
    setLoadingOlder(true);
    const generation = contextGenerationRef.current;
    const startedAt = Date.now();
    try {
      const deviceId = await getIncrementalDeviceId();
      const page = await getHistoricalDocumentsPage(data.backendUrl, backendToken, Platform.OS, deviceId, {
        documentScope: scope,
        cursor: current.requested ? current.nextCursor : null,
        dateFrom: filters.startDate || undefined,
        dateTo: filters.endDate || undefined,
        search: normalizedSearch || undefined,
        limit: HISTORICAL_DOCUMENT_PAGE_SIZE,
      });
      if (generation !== contextGenerationRef.current) return 0;
      const nextState = historicalStateAfterPage(current, page.items, page.nextCursor, page.hasMore);
      const added = nextState.items.length - current.items.length;
      stateRef.current = nextState;
      setState(nextState);
      recordHistoryMetric({ companyId, durationMs: Date.now() - startedAt, count: page.items.length, cursorPresent: Boolean(current.nextCursor), ok: true, fallback: false });
      return added;
    } catch (error) {
      if (generation === contextGenerationRef.current) {
        const nextState = historicalStateAfterFailure(stateRef.current);
        stateRef.current = nextState;
        setState(nextState);
      }
      recordHistoryMetric({ companyId, durationMs: Date.now() - startedAt, count: 0, cursorPresent: Boolean(current.nextCursor), ok: false, fallback: true, errorCode: historyErrorCode(error) });
      return 0;
    } finally {
      if (generation === contextGenerationRef.current) {
        requestActiveRef.current = false;
        setLoadingOlder(false);
      }
    }
  }, [backendToken, companyId, contextKey, data.backendUrl, enabled, filters.endDate, filters.startDate, normalizedSearch, remoteEligible, scope]);

  return {
    ...combined,
    canLoadOlder: enabled && remoteEligible && !contextState.suspended && (!contextState.requested || contextState.hasMore),
    loadingOlder,
    loadOlder,
    source: contextState.items.length ? "combined" as const : "local" as const,
  };
}

function historyErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) return String((error as { code?: unknown }).code || "UNKNOWN_ERROR").slice(0, 80);
  return error instanceof Error ? error.name.slice(0, 80) : "UNKNOWN_ERROR";
}

function recordHistoryMetric(metric: {
  companyId: string;
  durationMs: number;
  count: number;
  cursorPresent: boolean;
  ok: boolean;
  fallback: boolean;
  errorCode?: string;
}) {
  // Metadatos tecnicos solamente: nunca cursor, token, nombres, identificaciones ni payload.
  // eslint-disable-next-line no-console
  console.info(JSON.stringify({
    event: "historical_documents_client_page",
    companyRef: metric.companyId.slice(-8),
    durationMs: Math.max(0, Math.round(metric.durationMs)),
    count: metric.count,
    cursorPresent: metric.cursorPresent,
    ok: metric.ok,
    fallback: metric.fallback,
    errorCode: metric.errorCode,
  }));
}
