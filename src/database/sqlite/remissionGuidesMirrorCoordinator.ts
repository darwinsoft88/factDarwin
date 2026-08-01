import type { Client, RemissionGuide, Sale } from "../../types";
import {
  readMainSnapshotCatalogSource,
  readMainSnapshotDescriptor,
  type MainSnapshotCatalogSource,
  type MainSnapshotDescriptor,
} from "../mainSnapshotStorage";
import { CatalogValidationReceiptRepository } from
  "./CatalogValidationReceiptRepository";
import { openFactuDarwinDatabase } from "./client";
import { RemissionGuidesRepository } from "./RemissionGuidesRepository";
import { SQLITE_SCHEMA_VERSION } from "./schema";

interface GuideUpdate {
  tenantId: string;
  descriptor: MainSnapshotDescriptor;
  guides: RemissionGuide[];
  sales: Sale[];
  clients: Client[];
}

const queues = new Map<string, Promise<void>>();
const listeners = new Set<(tenantId: string) => void>();

export function subscribeRemissionGuidesMirrorUpdates(
  listener: (tenantId: string) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

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
    current.catalogHashes.guides === descriptor.catalogHashes.guides,
  );
}

async function updateMirror(update: GuideUpdate): Promise<void> {
  const database = await openFactuDarwinDatabase();
  if (!database || !(await isCanonical(update.descriptor))) return;
  const receipts = new CatalogValidationReceiptRepository({
    database,
    tenantId: update.tenantId,
  });
  const previous = await receipts.read("remission_guides");
  try {
    await new RemissionGuidesRepository({
      database,
      tenantId: update.tenantId,
    }).migrateMirror(update.guides, update.sales, update.clients, {
      snapshotGeneration: update.descriptor.snapshotGeneration,
      sourceHash: update.descriptor.catalogHashes.guides || "",
      schemaVersion: SQLITE_SCHEMA_VERSION,
      confirmCanonical: () => isCanonical(update.descriptor),
    });
    listeners.forEach((listener) => listener(update.tenantId));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "STALE_SNAPSHOT_GENERATION"
    ) return;
    const detail = error instanceof Error ? error.message : "Error desconocido.";
    if (previous?.status !== "validated") {
      await receipts.markDirty(
        "remission_guides",
        "SQLITE_REMISSION_GUIDES_UPDATE_FAILED",
        detail,
      ).catch(() => undefined);
    }
    // eslint-disable-next-line no-console
    console.info(JSON.stringify({
      event: "sqlite_remission_guides_mirror_rejected",
      tenantId: update.tenantId,
      generation: update.descriptor.snapshotGeneration,
      reason: "SQLITE_REMISSION_GUIDES_UPDATE_FAILED",
      detail,
    }));
    throw error;
  }
}

export function scheduleRemissionGuidesMirrorUpdate(
  descriptor: MainSnapshotDescriptor,
  guides: RemissionGuide[],
  sales: Sale[],
  clients: Client[],
): void {
  const tenantId = descriptor.companyId.trim();
  if (!tenantId) return;
  const update = JSON.parse(JSON.stringify({
    tenantId, descriptor, guides, sales, clients,
  })) as GuideUpdate;
  void serialize(tenantId, () => updateMirror(update)).catch(() => undefined);
}

export async function ensureRemissionGuidesMirrorCurrent(
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
  }).read("remission_guides");
  if (
    receipt?.status === "validated" &&
    receipt.schemaVersion === SQLITE_SCHEMA_VERSION &&
    receipt.snapshotGeneration === source.snapshotGeneration &&
    receipt.sourceHash === source.catalogHashes.guides &&
    receipt.rowCount === (source.guides || []).length
  ) return true;
  try {
    await serialize(tenantId, () => updateMirror({
      tenantId,
      descriptor: source,
      guides: source.guides || [],
      sales: source.sales,
      clients: source.clients,
    }));
    return true;
  } catch {
    return false;
  }
}
