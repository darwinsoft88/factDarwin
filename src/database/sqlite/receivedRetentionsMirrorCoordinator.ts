import type { Client, ReceivedRetention, Sale } from "../../types";
import {
  readMainSnapshotCatalogSource,
  readMainSnapshotDescriptor,
  type MainSnapshotCatalogSource,
  type MainSnapshotDescriptor,
} from "../mainSnapshotStorage";
import { CatalogValidationReceiptRepository } from
  "./CatalogValidationReceiptRepository";
import { openFactuDarwinDatabase } from "./client";
import { ReceivedRetentionsRepository } from
  "./ReceivedRetentionsRepository";
import { SQLITE_SCHEMA_VERSION } from "./schema";

interface RetentionsUpdate {
  tenantId: string;
  descriptor: MainSnapshotDescriptor;
  retentions: ReceivedRetention[];
  sales: Sale[];
  clients: Client[];
}

const queues = new Map<string, Promise<void>>();
const listeners = new Set<(tenantId: string) => void>();

export function subscribeReceivedRetentionsMirrorUpdates(
  listener: (tenantId: string) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(tenantId: string): void {
  listeners.forEach((listener) => listener(tenantId));
}

function serialize(
  tenantId: string,
  operation: () => Promise<void>,
): Promise<void> {
  const previous = queues.get(tenantId) ?? Promise.resolve();
  const current = previous.then(operation, operation);
  const queued = current.catch(() => undefined);
  queues.set(tenantId, queued);
  void current.finally(() => {
    if (queues.get(tenantId) === queued) queues.delete(tenantId);
  }).catch(() => undefined);
  return current;
}

async function isCanonical(descriptor: MainSnapshotDescriptor) {
  const current = await readMainSnapshotDescriptor();
  return Boolean(
    current &&
    current.companyId === descriptor.companyId &&
    current.snapshotGeneration === descriptor.snapshotGeneration &&
    current.payloadHash === descriptor.payloadHash &&
    current.catalogHashes.receivedRetentions ===
      descriptor.catalogHashes.receivedRetentions,
  );
}

async function updateMirror(update: RetentionsUpdate): Promise<void> {
  const database = await openFactuDarwinDatabase();
  if (!database || !(await isCanonical(update.descriptor))) return;
  const receipts = new CatalogValidationReceiptRepository({
    database,
    tenantId: update.tenantId,
  });
  const previous = await receipts.read("received_retentions");
  try {
    await new ReceivedRetentionsRepository({
      database,
      tenantId: update.tenantId,
    }).migrateMirror(update.retentions, update.sales, update.clients, {
      snapshotGeneration: update.descriptor.snapshotGeneration,
      sourceHash: update.descriptor.catalogHashes.receivedRetentions || "",
      schemaVersion: SQLITE_SCHEMA_VERSION,
      confirmCanonical: () => isCanonical(update.descriptor),
    });
    notify(update.tenantId);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "STALE_SNAPSHOT_GENERATION"
    ) return;
    const detail = error instanceof Error
      ? error.message
      : "Error desconocido.";
    // Preserve a previously validated mirror when a newer rebuild fails.
    if (previous?.status !== "validated") {
      await receipts.markDirty(
        "received_retentions",
        "SQLITE_RECEIVED_RETENTIONS_UPDATE_FAILED",
        detail,
      ).catch(() => undefined);
    }
    // eslint-disable-next-line no-console
    console.info(JSON.stringify({
      event: "sqlite_received_retentions_mirror_rejected",
      tenantId: update.tenantId,
      generation: update.descriptor.snapshotGeneration,
      reason: "SQLITE_RECEIVED_RETENTIONS_UPDATE_FAILED",
      detail,
    }));
    throw error;
  }
}

export function scheduleReceivedRetentionsMirrorUpdate(
  descriptor: MainSnapshotDescriptor,
  retentions: ReceivedRetention[],
  sales: Sale[],
  clients: Client[],
): void {
  const tenantId = descriptor.companyId.trim();
  if (!tenantId) return;
  const update = JSON.parse(JSON.stringify({
    tenantId,
    descriptor,
    retentions,
    sales,
    clients,
  })) as RetentionsUpdate;
  void serialize(tenantId, () => updateMirror(update)).catch(() => undefined);
}

export async function ensureReceivedRetentionsMirrorCurrent(
  tenantValue: string,
  sourceValue?: MainSnapshotCatalogSource | null,
): Promise<boolean> {
  const tenantId = tenantValue.trim();
  const source = sourceValue ?? await readMainSnapshotCatalogSource();
  if (!source || !tenantId || source.companyId !== tenantId) return false;
  const database = await openFactuDarwinDatabase();
  if (!database) return false;
  const receipt = await new CatalogValidationReceiptRepository({
    database,
    tenantId,
  }).read("received_retentions");
  if (
    receipt?.status === "validated" &&
    receipt.schemaVersion === SQLITE_SCHEMA_VERSION &&
    receipt.snapshotGeneration === source.snapshotGeneration &&
    receipt.sourceHash === source.catalogHashes.receivedRetentions &&
    receipt.rowCount === (source.receivedRetentions || []).length
  ) return true;
  try {
    await serialize(tenantId, () => updateMirror({
      tenantId,
      descriptor: source,
      retentions: source.receivedRetentions || [],
      sales: source.sales,
      clients: source.clients,
    }));
    return true;
  } catch {
    return false;
  }
}
