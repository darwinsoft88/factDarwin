import type { InventoryMovement, Product, Sale } from "../../types";
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
import { InventoryMovementsRepository } from
  "./InventoryMovementsRepository";
import { SQLITE_SCHEMA_VERSION } from "./schema";

interface InventoryUpdate {
  tenantId: string;
  descriptor: MainSnapshotDescriptor;
  movements: InventoryMovement[];
  sales: Sale[];
  products: Product[];
}

const queues = new Map<string, Promise<void>>();
const listeners = new Set<(tenantId: string) => void>();

function notify(tenantId: string): void {
  for (const listener of listeners) listener(tenantId);
}

export function subscribeInventoryMovementsMirrorUpdates(
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
    current.catalogHashes.inventoryMovements ===
      descriptor.catalogHashes.inventoryMovements,
  );
}

async function updateInventory(update: InventoryUpdate): Promise<void> {
  const database = await openFactuDarwinDatabase();
  if (!database || !(await isCanonical(update.descriptor))) return;
  const receipts = new CatalogValidationReceiptRepository({
    database,
    tenantId: update.tenantId,
  });
  try {
    await new InventoryMovementsRepository({
      database,
      tenantId: update.tenantId,
    }).migrateMirror(update.movements, update.sales, update.products, {
      snapshotGeneration: update.descriptor.snapshotGeneration,
      sourceHash: update.descriptor.catalogHashes.inventoryMovements,
      schemaVersion: SQLITE_SCHEMA_VERSION,
      confirmCanonical: () => isCanonical(update.descriptor),
    });
    notify(update.tenantId);
  } catch (error) {
    if (error instanceof Error &&
        error.message === "STALE_SNAPSHOT_GENERATION") {
      return;
    }
    await receipts.markDirty(
      "inventory_movements",
      "SQLITE_INVENTORY_MIRROR_UPDATE_FAILED",
      error instanceof Error ? error.message : "Error desconocido.",
    ).catch(() => undefined);
    throw error;
  }
}

export function scheduleInventoryMovementsMirrorUpdate(
  descriptor: MainSnapshotDescriptor,
  movements: InventoryMovement[],
  sales: Sale[],
  products: Product[],
): void {
  const tenantId = descriptor.companyId.trim();
  if (!tenantId) return;
  const update: InventoryUpdate = {
    tenantId,
    descriptor: {
      ...descriptor,
      catalogHashes: { ...descriptor.catalogHashes },
    },
    movements: JSON.parse(JSON.stringify(movements)) as InventoryMovement[],
    sales: JSON.parse(JSON.stringify(sales)) as Sale[],
    products: JSON.parse(JSON.stringify(products)) as Product[],
  };
  void serialize(tenantId, () => updateInventory(update))
    .catch(() => undefined);
}

export async function ensureInventoryMovementsMirrorCurrent(
  tenantValue: string,
  sourceValue?: MainSnapshotCatalogSource | null,
): Promise<boolean> {
  const tenantId = tenantValue.trim();
  const source = sourceValue ?? await readMainSnapshotCatalogSource();
  if (
    !source ||
    !tenantId ||
    (source.companyId && source.companyId !== tenantId)
  ) {
    return false;
  }
  const database = await openFactuDarwinDatabase();
  if (!database) return false;
  const receipt = await new CatalogValidationReceiptRepository({
    database,
    tenantId,
  }).read("inventory_movements");
  if (
    receipt?.status === "validated" &&
    receipt.schemaVersion === SQLITE_SCHEMA_VERSION &&
    receipt.snapshotGeneration === source.snapshotGeneration &&
    receipt.sourceHash === source.catalogHashes.inventoryMovements &&
    receipt.rowCount === source.inventoryMovements.length
  ) {
    return true;
  }
  try {
    await serialize(tenantId, () => updateInventory({
      tenantId,
      descriptor: source,
      movements: source.inventoryMovements,
      sales: source.sales,
      products: source.products,
    }));
    return true;
  } catch {
    return false;
  }
}
