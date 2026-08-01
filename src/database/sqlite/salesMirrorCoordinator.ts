import type { Sale } from "../../types";
import {
  readMainSnapshotCatalogSource,
  readMainSnapshotDescriptor,
  type MainSnapshotCatalogSource,
  type MainSnapshotDescriptor,
} from "../mainSnapshotStorage";
import {
  CatalogValidationReceiptRepository,
} from "./CatalogValidationReceiptRepository";
import { openFactuDarwinDatabase } from "./client";
import { SalesRepository } from "./SalesRepository";
import { SQLITE_SCHEMA_VERSION } from "./schema";

interface SalesUpdate {
  tenantId: string;
  descriptor: MainSnapshotDescriptor;
  sales: Sale[];
}

const queues = new Map<string, Promise<void>>();
const listeners = new Set<(tenantId: string) => void>();

function notify(tenantId: string) {
  for (const listener of listeners) listener(tenantId);
}

export function subscribeSalesMirrorUpdates(
  listener: (tenantId: string) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
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
    current.catalogHashes.sales === descriptor.catalogHashes.sales,
  );
}

async function updateSales(update: SalesUpdate): Promise<void> {
  const database = await openFactuDarwinDatabase();
  if (!database || !(await isCanonical(update.descriptor))) return;
  const receipts = new CatalogValidationReceiptRepository({
    database,
    tenantId: update.tenantId,
  });
  try {
    await new SalesRepository({
      database,
      tenantId: update.tenantId,
    }).migrateMirror(update.sales, {
      snapshotGeneration: update.descriptor.snapshotGeneration,
      sourceHash: update.descriptor.catalogHashes.sales,
      schemaVersion: SQLITE_SCHEMA_VERSION,
      confirmCanonical: () => isCanonical(update.descriptor),
    });
    notify(update.tenantId);
  } catch (error) {
    if (error instanceof Error && error.message === "STALE_SNAPSHOT_GENERATION") {
      return;
    }
    await receipts.markDirty(
      "sales",
      "SQLITE_SALES_MIRROR_UPDATE_FAILED",
      error instanceof Error ? error.message : "Error desconocido.",
    ).catch(() => undefined);
    notify(update.tenantId);
    throw error;
  }
}

export function scheduleSalesMirrorUpdate(
  descriptor: MainSnapshotDescriptor,
  sales: Sale[],
): void {
  const tenantId = descriptor.companyId.trim();
  if (!tenantId) return;
  const update: SalesUpdate = {
    tenantId,
    descriptor: { ...descriptor },
    sales: JSON.parse(JSON.stringify(sales)) as Sale[],
  };
  void serialize(tenantId, () => updateSales(update)).catch(() => undefined);
}

export async function ensureSalesMirrorCurrent(
  tenantIdValue: string,
  sourceValue?: MainSnapshotCatalogSource | null,
): Promise<boolean> {
  const tenantId = tenantIdValue.trim();
  const source = sourceValue ?? await readMainSnapshotCatalogSource();
  if (!source || !tenantId || (source.companyId && source.companyId !== tenantId)) {
    return false;
  }
  const database = await openFactuDarwinDatabase();
  if (!database) return false;
  const receipt = await new CatalogValidationReceiptRepository({
    database,
    tenantId,
  }).read("sales");
  if (
    receipt?.status === "validated" &&
    receipt.schemaVersion === SQLITE_SCHEMA_VERSION &&
    receipt.snapshotGeneration === source.snapshotGeneration &&
    receipt.sourceHash === source.catalogHashes.sales &&
    receipt.rowCount === source.sales.length
  ) {
    return true;
  }
  try {
    await serialize(tenantId, () => updateSales({
      tenantId,
      descriptor: source,
      sales: source.sales,
    }));
    return true;
  } catch {
    return false;
  }
}
