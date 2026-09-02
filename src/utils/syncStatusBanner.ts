import type { SyncState } from "./support";
import type { Sale } from "../types";
import { isCreditNoteSale, isInvoiceSale } from "./sales";
import { isStaleSriPendingDocument, shouldAutoRetrySriDocument } from "./sriRetryPolicy";

export type SyncStatusBannerAction = "open" | "retry" | "view";

export type SyncStatusBannerCallbacks = {
  onOpen: () => void;
  onRetry: () => void;
  onView: () => void;
};

export type SyncStatusBannerView = {
  visible: boolean;
  title: string;
  tone: "danger" | "info" | "warning";
  retryLabel?: string;
  retryDisabled?: boolean;
  viewLabel?: string;
};

export function countUniqueAttentionDocuments(...documentIdGroups: string[][]) {
  return new Set(documentIdGroups.flat().filter(Boolean)).size;
}

export function requiresSyncBannerAttention(sale: Sale, now = new Date()) {
  if (!(isInvoiceSale(sale) || isCreditNoteSale(sale))) return false;
  if (sale.inventoryState === "RECONCILIATION_PENDING") return true;
  if (isStaleSriPendingDocument(sale, now)) return true;
  if (sale.status === "DEVUELTA") return true;
  if (sale.status === "ERROR_SRI") return !shouldAutoRetrySriDocument(sale, now);
  return false;
}

export function buildSyncStatusBannerView({
  documentCount,
  hasError,
  retrying,
  staleSriCount
}: {
  documentCount: number;
  hasError: boolean;
  pendingCount: number;
  reviewCount: number;
  retrying: boolean;
  sriPendingCount: number;
  staleSriCount: number;
  syncState: SyncState;
}): SyncStatusBannerView {
  // La actividad normal del outbox es silenciosa. La franja superior se reserva
  // para documentos tributarios que realmente requieren intervencion.
  const visible = documentCount > 0 || staleSriCount > 0;
  if (!visible) return { visible: false, title: "", tone: "warning" };

  const actions = documentCount > 0
    ? {
        retryLabel: documentCount === 1 ? "Reintentar" : "Reintentar todo",
        retryDisabled: retrying,
        viewLabel: documentCount === 1 ? "Ver" : "Ver lista"
      }
    : {};

  if (staleSriCount > 0) return { visible, title: `SRI requiere atención (${documentCount || staleSriCount})`, tone: "danger", ...actions };
  if (hasError) {
    return {
      visible,
      title: documentCount > 0 ? `SRI requiere atención (${documentCount})` : "Sincronización requiere atención",
      tone: "danger",
      ...actions
    };
  }
  return {
    visible,
    title: `${documentCount} documento${documentCount === 1 ? "" : "s"} requiere${documentCount === 1 ? "" : "n"} atención`,
    tone: "warning",
    ...actions
  };
}

export function runSyncStatusBannerAction(action: SyncStatusBannerAction, callbacks: SyncStatusBannerCallbacks) {
  if (action === "retry") callbacks.onRetry();
  else if (action === "view") callbacks.onView();
  else callbacks.onOpen();
}
