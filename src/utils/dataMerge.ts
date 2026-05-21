import { initialData } from "../storage";
import { AppData, Issuer, IssuerEstablishment } from "../types";
import { sanitizeAppData } from "../validation";
import { normalizedEstablishments } from "./establishments";

export function mergeAppDataSnapshots(remoteData: AppData, localData: AppData): AppData {
  const sameSequenceScope = sameIssuerSequenceScope(remoteData.issuer, localData.issuer);
  return sanitizeAppData({
    ...remoteData,
    ...localData,
    issuer: {
      ...remoteData.issuer,
      ...localData.issuer,
      establishments: mergeIssuerEstablishments(remoteData.issuer, localData.issuer),
      establishmentsUpdatedAt: newerTimestamp(remoteData.issuer?.establishmentsUpdatedAt, localData.issuer?.establishmentsUpdatedAt),
      sequential: mergeIssuerSequence(remoteData.issuer?.sequential, localData.issuer?.sequential, sameSequenceScope),
      remissionSequential: mergeIssuerSequence(remoteData.issuer?.remissionSequential, localData.issuer?.remissionSequential, sameSequenceScope),
      creditNoteSequential: mergeIssuerSequence(remoteData.issuer?.creditNoteSequential, localData.issuer?.creditNoteSequential, sameSequenceScope)
    },
    users: mergeById(remoteData.users || [], localData.users || []),
    clients: mergeByLatestUpdatedAt(remoteData.clients || [], localData.clients || []),
    products: mergeByLatestUpdatedAt(remoteData.products || [], localData.products || []),
    sales: prependUniqueById(remoteData.sales || [], localData.sales || []),
    guides: prependUniqueById(remoteData.guides || [], localData.guides || []),
    receivedRetentions: prependUniqueById(remoteData.receivedRetentions || [], localData.receivedRetentions || []),
    cashClosings: prependUniqueById(remoteData.cashClosings || [], localData.cashClosings || []),
    inventoryMovements: prependUniqueById(remoteData.inventoryMovements || [], localData.inventoryMovements || []),
    auditLogs: prependUniqueById(remoteData.auditLogs || [], localData.auditLogs || []),
    backendUrl: localData.backendUrl || remoteData.backendUrl,
    autoBackupEnabled: localData.autoBackupEnabled,
    autoBackupLastAt: localData.autoBackupLastAt || remoteData.autoBackupLastAt || "",
    autoBackupLastError: localData.autoBackupLastError || "",
    pendingSync: localData.pendingSync || [],
    deletedIds: mergeDeletedIds(remoteData.deletedIds, localData.deletedIds),
    historyPolicy: remoteData.historyPolicy || localData.historyPolicy
  });
}

export function addedEstablishmentIds(previousIssuer: Issuer, nextIssuer: Issuer) {
  const previousIds = new Set(normalizedEstablishments(previousIssuer).map((item) => item.id));
  return normalizedEstablishments(nextIssuer)
    .map((item) => item.id)
    .filter((id) => !previousIds.has(id));
}

function mergeDeletedIds(remoteDeleted?: AppData["deletedIds"], localDeleted?: AppData["deletedIds"]) {
  return {
    clients: Array.from(new Set([...(remoteDeleted?.clients || []), ...(localDeleted?.clients || [])])),
    products: Array.from(new Set([...(remoteDeleted?.products || []), ...(localDeleted?.products || [])])),
    users: Array.from(new Set([...(remoteDeleted?.users || []), ...(localDeleted?.users || [])]))
  };
}

function sameIssuerSequenceScope(remoteIssuer?: Partial<Issuer>, localIssuer?: Partial<Issuer>) {
  return String(remoteIssuer?.environment || "1") === String(localIssuer?.environment || "1")
    && String(remoteIssuer?.establishment || "") === String(localIssuer?.establishment || "")
    && String(remoteIssuer?.emissionPoint || "") === String(localIssuer?.emissionPoint || "");
}

function mergeIssuerSequence(remoteValue: unknown, localValue: unknown, sameSequenceScope: boolean) {
  const localSequence = Number(localValue || 1);
  if (!sameSequenceScope) return localSequence;
  return Math.max(Number(remoteValue || 1), localSequence);
}

function mergeIssuerEstablishments(remoteIssuer?: Issuer, localIssuer?: Issuer) {
  const localIssuerTime = timestampOf(localIssuer?.establishmentsUpdatedAt);
  const remoteIssuerTime = timestampOf(remoteIssuer?.establishmentsUpdatedAt);
  if (localIssuerTime !== remoteIssuerTime) {
    return normalizedEstablishments((localIssuerTime > remoteIssuerTime ? localIssuer : remoteIssuer) || initialData.issuer);
  }
  const byId = new Map<string, IssuerEstablishment>();
  normalizedEstablishments(remoteIssuer || initialData.issuer).forEach((item) => byId.set(item.id, item));
  normalizedEstablishments(localIssuer || initialData.issuer).forEach((item) => {
    const previous = byId.get(item.id);
    if (!previous) {
      byId.set(item.id, item);
      return;
    }
    const localTime = timestampOf(item.updatedAt);
    const remoteTime = timestampOf(previous.updatedAt);
    const localWinsStatus = localTime >= remoteTime;
    byId.set(item.id, {
      ...previous,
      ...item,
      active: localWinsStatus ? item.active !== false : previous.active !== false,
      updatedAt: localTime >= remoteTime ? item.updatedAt : previous.updatedAt,
      sequential: Math.max(previous.sequential || 1, item.sequential || 1),
      remissionSequential: Math.max(previous.remissionSequential || 1, item.remissionSequential || 1),
      creditNoteSequential: Math.max(previous.creditNoteSequential || 1, item.creditNoteSequential || 1)
    });
  });
  return Array.from(byId.values());
}

function newerTimestamp(first?: string, second?: string) {
  return timestampOf(second) >= timestampOf(first) ? second || first || "" : first || second || "";
}

function mergeById<T extends { id: string }>(remoteItems: T[], localItems: T[]) {
  const byId = new Map<string, T>();
  remoteItems.forEach((item) => byId.set(item.id, item));
  localItems.forEach((item) => byId.set(item.id, item));
  return Array.from(byId.values());
}

function mergeByLatestUpdatedAt<T extends { id: string; updatedAt?: string }>(remoteItems: T[], localItems: T[]) {
  const byId = new Map<string, T>();
  remoteItems.forEach((item) => byId.set(item.id, item));
  localItems.forEach((item) => {
    const previous = byId.get(item.id);
    if (!previous || timestampOf(item.updatedAt) >= timestampOf(previous.updatedAt)) {
      byId.set(item.id, item);
    }
  });
  return Array.from(byId.values());
}

function prependUniqueById<T extends { id: string }>(remoteItems: T[], localItems: T[]) {
  const seen = new Set<string>();
  const result: T[] = [];
  [...localItems, ...remoteItems].forEach((item) => {
    if (!item?.id || seen.has(item.id)) return;
    seen.add(item.id);
    result.push(item);
  });
  return result;
}

function timestampOf(value?: string) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}
