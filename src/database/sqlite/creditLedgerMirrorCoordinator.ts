import type {
  Client,
  CreditAdjustment,
  CreditPayment,
  Sale,
} from "../../types";
import {
  readMainSnapshotCatalogSource,
  readMainSnapshotDescriptor,
  type MainSnapshotCatalogSource,
  type MainSnapshotDescriptor,
} from "../mainSnapshotStorage";
import { CatalogValidationReceiptRepository } from
  "./CatalogValidationReceiptRepository";
import type { CatalogValidationReceipt } from
  "./CatalogValidationReceiptRepository";
import { openFactuDarwinDatabase } from "./client";
import { CreditLedgerRepository } from "./CreditLedgerRepository";
import { SQLITE_SCHEMA_VERSION } from "./schema";

interface CreditLedgerUpdate {
  tenantId: string;
  descriptor: MainSnapshotDescriptor;
  payments: CreditPayment[];
  adjustments: CreditAdjustment[];
  sales: Sale[];
  clients: Client[];
}

const queues = new Map<string, Promise<void>>();
const listeners = new Set<(tenantId: string) => void>();

function notify(tenantId: string): void {
  listeners.forEach((listener) => listener(tenantId));
}

export function subscribeCreditLedgerMirrorUpdates(
  listener: (tenantId: string) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function creditLedgerReceiptsCoherent(
  tenantId: string,
  source: MainSnapshotCatalogSource,
  paymentsReceipt: CatalogValidationReceipt | null,
  adjustmentsReceipt: CatalogValidationReceipt | null,
): boolean {
  return Boolean(
    paymentsReceipt?.tenantId === tenantId &&
    adjustmentsReceipt?.tenantId === tenantId &&
    paymentsReceipt.status === "validated" &&
    adjustmentsReceipt.status === "validated" &&
    paymentsReceipt.schemaVersion === SQLITE_SCHEMA_VERSION &&
    adjustmentsReceipt.schemaVersion === SQLITE_SCHEMA_VERSION &&
    paymentsReceipt.snapshotGeneration === source.snapshotGeneration &&
    adjustmentsReceipt.snapshotGeneration === source.snapshotGeneration &&
    paymentsReceipt.snapshotGeneration ===
      adjustmentsReceipt.snapshotGeneration &&
    paymentsReceipt.sourceHash === source.catalogHashes.creditPayments &&
    adjustmentsReceipt.sourceHash ===
      source.catalogHashes.creditAdjustments &&
    paymentsReceipt.rowCount === (source.creditPayments || []).length &&
    adjustmentsReceipt.rowCount === (source.creditAdjustments || []).length
  );
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
    current.catalogHashes.creditPayments ===
      descriptor.catalogHashes.creditPayments &&
    current.catalogHashes.creditAdjustments ===
      descriptor.catalogHashes.creditAdjustments,
  );
}

async function updateLedger(update: CreditLedgerUpdate): Promise<void> {
  const database = await openFactuDarwinDatabase();
  if (!database || !(await isCanonical(update.descriptor))) return;
  const receipts = new CatalogValidationReceiptRepository({
    database,
    tenantId: update.tenantId,
  });
  const [previousPaymentsReceipt, previousAdjustmentsReceipt] =
    await Promise.all([
      receipts.read("credit_payments"),
      receipts.read("credit_adjustments"),
    ]);
  try {
    await new CreditLedgerRepository({
      database,
      tenantId: update.tenantId,
    }).migrateMirror(
      update.payments,
      update.adjustments,
      update.sales,
      update.clients,
      {
        snapshotGeneration: update.descriptor.snapshotGeneration,
        creditPaymentsHash:
          update.descriptor.catalogHashes.creditPayments || "",
        creditAdjustmentsHash:
          update.descriptor.catalogHashes.creditAdjustments || "",
        schemaVersion: SQLITE_SCHEMA_VERSION,
        confirmCanonical: () => isCanonical(update.descriptor),
      },
    );
    notify(update.tenantId);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "STALE_SNAPSHOT_GENERATION"
    ) {
      return;
    }
    const detail = error instanceof Error
      ? error.message
      : "Error desconocido.";
    // eslint-disable-next-line no-console
    console.info(JSON.stringify({
      event: "sqlite_credit_ledger_mirror_rejected",
      tenantId: update.tenantId,
      generation: update.descriptor.snapshotGeneration,
      reason: "SQLITE_CREDIT_LEDGER_UPDATE_FAILED",
      detail,
    }));
    const dirtyUpdates: Promise<void>[] = [];
    if (previousPaymentsReceipt?.status !== "validated") {
      dirtyUpdates.push(receipts.markDirty(
        "credit_payments",
        "SQLITE_CREDIT_LEDGER_UPDATE_FAILED",
        detail,
      ));
    }
    if (previousAdjustmentsReceipt?.status !== "validated") {
      dirtyUpdates.push(receipts.markDirty(
        "credit_adjustments",
        "SQLITE_CREDIT_LEDGER_UPDATE_FAILED",
        detail,
      ));
    }
    await Promise.all(dirtyUpdates).catch(() => undefined);
    throw error;
  }
}

export function scheduleCreditLedgerMirrorUpdate(
  descriptor: MainSnapshotDescriptor,
  payments: CreditPayment[],
  adjustments: CreditAdjustment[],
  sales: Sale[],
  clients: Client[],
): void {
  const tenantId = descriptor.companyId.trim();
  if (!tenantId) return;
  const update: CreditLedgerUpdate = JSON.parse(JSON.stringify({
    tenantId,
    descriptor,
    payments,
    adjustments,
    sales,
    clients,
  })) as CreditLedgerUpdate;
  void serialize(tenantId, () => updateLedger(update))
    .catch(() => undefined);
}

export async function ensureCreditLedgerMirrorCurrent(
  tenantValue: string,
  sourceValue?: MainSnapshotCatalogSource | null,
): Promise<boolean> {
  const tenantId = tenantValue.trim();
  const source = sourceValue ?? await readMainSnapshotCatalogSource();
  if (
    !source ||
    !tenantId ||
    source.companyId !== tenantId
  ) {
    return false;
  }
  const database = await openFactuDarwinDatabase();
  if (!database) return false;
  const receipts = new CatalogValidationReceiptRepository({
    database,
    tenantId,
  });
  const [paymentsReceipt, adjustmentsReceipt] = await Promise.all([
    receipts.read("credit_payments"),
    receipts.read("credit_adjustments"),
  ]);
  if (creditLedgerReceiptsCoherent(
    tenantId, source, paymentsReceipt, adjustmentsReceipt,
  )) {
    return true;
  }
  try {
    await serialize(tenantId, () => updateLedger({
      tenantId,
      descriptor: source,
      payments: source.creditPayments || [],
      adjustments: source.creditAdjustments || [],
      sales: source.sales,
      clients: source.clients,
    }));
    return true;
  } catch {
    return false;
  }
}
