import type { Client, Product } from "../../types";
import {
  readMainSnapshotCatalogSource,
  readMainSnapshotDescriptor,
  type MainSnapshotCatalogSource,
  type MainSnapshotDescriptor,
} from "../mainSnapshotStorage";
import {
  CatalogValidationReceiptRepository,
  type CatalogType,
} from "./CatalogValidationReceiptRepository";
import { openFactuDarwinDatabase } from "./client";
import { ClientsRepository } from "./ClientsRepository";
import { ProductsRepository } from "./ProductsRepository";
import { SQLITE_SCHEMA_VERSION } from "./schema";
import { AppMetadataRepository } from "./appMetadataRepository";

interface CatalogUpdate {
  tenantId: string;
  descriptor: MainSnapshotDescriptor;
  clients: Client[];
  products: Product[];
}

const queues = new Map<string, Promise<void>>();
const listeners = new Set<(tenantId: string) => void>();

function notify(tenantId: string): void {
  for (const listener of listeners) listener(tenantId);
}

export function subscribeCatalogMirrorUpdates(
  listener: (tenantId: string) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function queueKey(tenantId: string, catalogType: CatalogType): string {
  return `${tenantId}:${catalogType}`;
}

function serialize(
  tenantId: string,
  catalogType: CatalogType,
  operation: () => Promise<void>,
): Promise<void> {
  const key = queueKey(tenantId, catalogType);
  const previous = queues.get(key) ?? Promise.resolve();
  const current = previous.then(operation, operation);
  const queued = current.catch(() => undefined);
  queues.set(key, queued);
  void current.finally(() => {
    if (queues.get(key) === queued) queues.delete(key);
  }).catch(() => undefined);
  return current;
}

async function isCanonical(descriptor: MainSnapshotDescriptor): Promise<boolean> {
  const current = await readMainSnapshotDescriptor();
  return Boolean(
    current &&
    current.companyId === descriptor.companyId &&
    current.snapshotGeneration === descriptor.snapshotGeneration &&
    current.payloadHash === descriptor.payloadHash,
  );
}

async function updateCatalog(
  update: CatalogUpdate,
  catalogType: CatalogType,
): Promise<void> {
  const database = await openFactuDarwinDatabase();
  if (!database) return;
  const receiptRepository = new CatalogValidationReceiptRepository({
    database,
    tenantId: update.tenantId,
  });
  if (!(await isCanonical(update.descriptor))) return;
  try {
    const receipt = {
      snapshotGeneration: update.descriptor.snapshotGeneration,
      sourceHash: catalogType === "clients"
        ? update.descriptor.catalogHashes.clients
        : update.descriptor.catalogHashes.products,
      schemaVersion: SQLITE_SCHEMA_VERSION,
      confirmCanonical: () => isCanonical(update.descriptor),
    };
    if (catalogType === "clients") {
      await new ClientsRepository({
        database,
        tenantId: update.tenantId,
      }).synchronizeIncremental(update.clients, receipt);
    } else {
      await new ProductsRepository({
        database,
        tenantId: update.tenantId,
      }).synchronizeIncremental(update.products, receipt);
    }
  } catch (error) {
    if (error instanceof Error && error.message === "STALE_SNAPSHOT_GENERATION") {
      return;
    }
    await receiptRepository.markDirty(
      catalogType,
      "SQLITE_MIRROR_UPDATE_FAILED",
      error instanceof Error ? error.message : "Error desconocido.",
    ).catch(() => undefined);
    throw error;
  }
}

export function scheduleCatalogMirrorUpdate(
  descriptor: MainSnapshotDescriptor,
  clients: Client[],
  products: Product[],
): void {
  const tenantId = descriptor.companyId.trim();
  if (!tenantId) return;
  const update = {
    tenantId,
    descriptor: { ...descriptor },
    clients: JSON.parse(JSON.stringify(clients)) as Client[],
    products: JSON.parse(JSON.stringify(products)) as Product[],
  };
  const tasks = (["clients", "products"] as const).map((catalogType) =>
    serialize(
      tenantId,
      catalogType,
      () => updateCatalog(update, catalogType),
    ));
  void Promise.all(tasks)
    .then(async () => {
      if (!(await isCanonical(descriptor))) return;
      const database = await openFactuDarwinDatabase();
      if (!database) return;
      await new AppMetadataRepository({ database, tenantId }).save({
        tenantId,
        schemaVersion: SQLITE_SCHEMA_VERSION,
        migrationState: "products_validated",
        snapshotHash: descriptor.payloadHash,
      });
      notify(tenantId);
    })
    .catch(() => notify(tenantId));
}

export async function ensureCatalogMirrorsCurrent(
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
  const receipts = await new CatalogValidationReceiptRepository({
    database,
    tenantId,
  }).readAll();
  const valid = (catalogType: CatalogType, hash: string, count: number) => {
    const receipt = receipts.find((item) => item.catalogType === catalogType);
    return Boolean(
      receipt &&
      receipt.status === "validated" &&
      receipt.schemaVersion === SQLITE_SCHEMA_VERSION &&
      receipt.snapshotGeneration === source.snapshotGeneration &&
      receipt.sourceHash === hash &&
      receipt.rowCount === count,
    );
  };
  if (
    valid("clients", source.catalogHashes.clients, source.clients.length) &&
    valid("products", source.catalogHashes.products, source.products.length)
  ) {
    return true;
  }
  const update = {
    tenantId,
    descriptor: source,
    clients: source.clients,
    products: source.products,
  };
  const results = await Promise.allSettled([
    serialize(tenantId, "clients", () => updateCatalog(update, "clients")),
    serialize(tenantId, "products", () => updateCatalog(update, "products")),
  ]);
  const ready = results.every(({ status }) => status === "fulfilled");
  if (ready && await isCanonical(source)) {
    await new AppMetadataRepository({ database, tenantId }).save({
      tenantId,
      schemaVersion: SQLITE_SCHEMA_VERSION,
      migrationState: "products_validated",
      snapshotHash: source.payloadHash,
    });
  }
  return ready;
}
