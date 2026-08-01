import type { PendingSyncItem } from "../../types";
import {
  readMainSnapshotCatalogSource,
  readMainSnapshotDescriptor,
  type MainSnapshotCatalogSource,
  type MainSnapshotDescriptor,
} from "../mainSnapshotStorage";
import { CatalogValidationReceiptRepository } from
  "./CatalogValidationReceiptRepository";
import { openFactuDarwinDatabase } from "./client";
import { PendingSyncRepository } from "./PendingSyncRepository";
import { SQLITE_SCHEMA_VERSION } from "./schema";

interface PendingSyncUpdate {
  tenantId: string;
  descriptor: MainSnapshotDescriptor;
  operations: PendingSyncItem[];
}

const queues = new Map<string, Promise<void>>();

function serialize(tenantId: string, task: () => Promise<void>) {
  const previous = queues.get(tenantId) ?? Promise.resolve();
  const current = previous.then(task, task);
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
    current.catalogHashes.pendingSync ===
      descriptor.catalogHashes.pendingSync,
  );
}

async function updateMirror(update: PendingSyncUpdate): Promise<void> {
  const database = await openFactuDarwinDatabase();
  if (!database || !(await isCanonical(update.descriptor))) return;
  const receipts = new CatalogValidationReceiptRepository({
    database,
    tenantId: update.tenantId,
  });
  const previous = await receipts.read("pending_sync_operations");
  try {
    await new PendingSyncRepository({
      database,
      tenantId: update.tenantId,
    }).migrateMirror(update.operations, {
      snapshotGeneration: update.descriptor.snapshotGeneration,
      sourceHash: update.descriptor.catalogHashes.pendingSync || "",
      schemaVersion: SQLITE_SCHEMA_VERSION,
      confirmCanonical: () => isCanonical(update.descriptor),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "STALE_SNAPSHOT_GENERATION"
    ) return;
    const detail = error instanceof Error ? error.message : "Error desconocido.";
    if (previous?.status !== "validated") {
      await receipts.markDirty(
        "pending_sync_operations",
        "SQLITE_PENDING_SYNC_UPDATE_FAILED",
        detail,
      ).catch(() => undefined);
    }
    // eslint-disable-next-line no-console
    console.info(JSON.stringify({
      event: "sqlite_pending_sync_mirror_rejected",
      tenantId: update.tenantId,
      generation: update.descriptor.snapshotGeneration,
      reason: "SQLITE_PENDING_SYNC_UPDATE_FAILED",
      detail,
    }));
    throw error;
  }
}

export function schedulePendingSyncMirrorUpdate(
  descriptor: MainSnapshotDescriptor,
  operations: PendingSyncItem[],
): void {
  const tenantId = descriptor.companyId.trim();
  if (!tenantId) return;
  const update = JSON.parse(JSON.stringify({
    tenantId,
    descriptor,
    operations,
  })) as PendingSyncUpdate;
  void serialize(tenantId, () => updateMirror(update)).catch(() => undefined);
}

export async function ensurePendingSyncMirrorCurrent(
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
  }).read("pending_sync_operations");
  const operations = source.pendingSync || [];
  if (
    receipt?.status === "validated" &&
    receipt.schemaVersion === SQLITE_SCHEMA_VERSION &&
    receipt.snapshotGeneration === source.snapshotGeneration &&
    receipt.sourceHash === source.catalogHashes.pendingSync &&
    receipt.rowCount === operations.length
  ) return true;
  try {
    await serialize(tenantId, () => updateMirror({
      tenantId,
      descriptor: source,
      operations,
    }));
    return true;
  } catch {
    return false;
  }
}
