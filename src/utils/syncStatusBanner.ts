import type { SyncState } from "./support";

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

export function buildSyncStatusBannerView({
  documentCount,
  hasError,
  pendingCount,
  reviewCount,
  retrying,
  sriPendingCount,
  staleSriCount,
  syncState
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
  const visible = documentCount > 0 || reviewCount > 0 || pendingCount > 0 || hasError || syncState === "syncing" || syncState === "pending";
  if (!visible) return { visible: false, title: "", tone: "warning" };

  const actions = documentCount > 0
    ? {
        retryLabel: documentCount === 1 ? "Reintentar" : "Reintentar todo",
        retryDisabled: retrying,
        viewLabel: documentCount === 1 ? "Ver" : "Ver lista"
      }
    : {};

  if (staleSriCount > 0) return { visible, title: `SRI requiere atención (${documentCount || staleSriCount})`, tone: "danger", ...actions };
  if (syncState === "syncing") return { visible, title: "Sincronizando documentos", tone: "info", ...actions };
  if (hasError) {
    return {
      visible,
      title: documentCount > 0 ? `SRI requiere atención (${documentCount})` : "Sincronización requiere atención",
      tone: "danger",
      ...actions
    };
  }
  if (sriPendingCount > 0) {
    return {
      visible,
      title: `${documentCount} documento${documentCount === 1 ? "" : "s"} requiere${documentCount === 1 ? "" : "n"} atención`,
      tone: "warning",
      ...actions
    };
  }
  return {
    visible,
    title: reviewCount > 0
      ? `${reviewCount} documento${reviewCount === 1 ? "" : "s"} requiere${reviewCount === 1 ? "" : "n"} atención`
      : `Sincronización requiere atención${pendingCount > 0 ? ` (${pendingCount})` : ""}`,
    tone: "warning",
    ...actions
  };
}

export function runSyncStatusBannerAction(action: SyncStatusBannerAction, callbacks: SyncStatusBannerCallbacks) {
  if (action === "retry") callbacks.onRetry();
  else if (action === "view") callbacks.onView();
  else callbacks.onOpen();
}
