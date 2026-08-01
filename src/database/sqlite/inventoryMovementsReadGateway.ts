import type { InventoryMovement, Product, Sale } from "../../types";
import { readMainSnapshotFastDescriptor } from "../mainSnapshotStorage";
import { AppMetadataRepository } from "./appMetadataRepository";
import { CatalogValidationReceiptRepository } from
  "./CatalogValidationReceiptRepository";
import { openFactuDarwinDatabase } from "./client";
import {
  InventoryMovementsRepository,
  type InventoryMovementMetrics,
  type InventoryMovementQuery,
} from "./InventoryMovementsRepository";
import { sqliteInventoryMovementReadsEnabled } from
  "./inventoryMovementsReadFeature";
import { SQLITE_SCHEMA_VERSION } from "./schema";
import type { SQLiteConnection } from "./types";

export type InventoryMovementsFallbackReason =
  | "FEATURE_DISABLED"
  | "WEB_USES_FILE"
  | "TENANT_MISSING"
  | "TENANT_MISMATCH"
  | "SCHEMA_NOT_READY"
  | "RECEIPT_MISSING"
  | "RECEIPT_NOT_VALIDATED"
  | "MIRROR_DIRTY"
  | "SNAPSHOT_GENERATION_MISMATCH"
  | "SOURCE_HASH_MISMATCH"
  | "ROW_COUNT_MISMATCH"
  | "AGGREGATE_MISMATCH"
  | "SQLITE_OPEN_FAILED"
  | "SQLITE_READ_FAILED";

export interface InventoryMovementsReadDiagnostic {
  source: "sqlite" | "file";
  reason: InventoryMovementsFallbackReason | null;
  detail: string;
  tenantId: string;
  checkedAt: string;
  gateDurationMs: number;
  readDurationMs: number;
  fileCount: number;
  sqliteCount: number;
}

export interface ControlledInventoryMovementsRead {
  source: "sqlite" | "file";
  movements: InventoryMovement[];
  diagnostic: InventoryMovementsReadDiagnostic;
}

type RepositoryReader = Pick<
  InventoryMovementsRepository,
  "checkLightweightIntegrity" | "list"
>;

interface Dependencies {
  openDatabase?: () => Promise<SQLiteConnection | null>;
  readDescriptor?: typeof readMainSnapshotFastDescriptor;
  createRepository?: (
    database: SQLiteConnection,
    tenantId: string,
  ) => RepositoryReader;
  platform?: string;
}

const METRIC_KEYS: Array<keyof InventoryMovementMetrics> = [
  "entryQuantityMicros",
  "exitQuantityMicros",
  "positiveAdjustmentMicros",
  "negativeAdjustmentMicros",
  "entryStockDeltaMicros",
  "exitStockDeltaMicros",
  "adjustmentStockDeltaMicros",
  "missingStockBefore",
  "missingStockAfter",
  "linkedSales",
  "linkedCreditNotes",
  "unknownSaleRelations",
  "rowsWithoutOperation",
  "operationCount",
  "operationsWithMultipleRows",
  "maxRowsPerOperation",
  "stockBeforeMicros",
  "stockAfterMicros",
  "negativeQuantityRows",
  "negativeStockRows",
  "legacyIncompleteRows",
  "missingCurrentProductRows",
  "quantityByProduct",
  "operationRowCounts",
  "quantityByEstablishment",
  "costAvailability",
  "establishmentAvailability",
  "warehouseAvailability",
];

let lastDiagnostic: InventoryMovementsReadDiagnostic | null = null;

function filterFileMovements(
  movements: InventoryMovement[],
  query: InventoryMovementQuery,
): InventoryMovement[] {
  return movements.filter((movement) =>
    (!query.productId || movement.productId === query.productId) &&
    (!query.operationId ||
      movement.inventoryOperationId === query.operationId) &&
    (!query.saleId || movement.saleId === query.saleId) &&
    (!query.createdFrom || movement.createdAt >= query.createdFrom) &&
    (!query.createdTo || movement.createdAt <= query.createdTo) &&
    (!query.movementType || movement.type === query.movementType) &&
    (!query.search || [
      movement.productName,
      movement.reason,
      movement.reference || "",
      movement.type,
    ].some((value) =>
      value.toLowerCase().includes(query.search!.trim().toLowerCase())
    ))
  );
}

function metricsFromReceipt(
  details: Record<string, unknown> | null,
): InventoryMovementMetrics | null {
  if (!details || METRIC_KEYS.some((key) =>
    !Object.prototype.hasOwnProperty.call(details, key)
  )) {
    return null;
  }
  return Object.fromEntries(
    METRIC_KEYS.map((key) => [key, details[key]]),
  ) as unknown as InventoryMovementMetrics;
}

function logFallback(diagnostic: InventoryMovementsReadDiagnostic): void {
  // eslint-disable-next-line no-console
  console.info(JSON.stringify({
    event: "sqlite_inventory_movements_fallback",
    tenantId: diagnostic.tenantId,
    reason: diagnostic.reason,
    detail: diagnostic.detail,
    fileCount: diagnostic.fileCount,
    sqliteCount: diagnostic.sqliteCount,
  }));
}

function fallback(
  tenantId: string,
  fileMovements: InventoryMovement[],
  startedAt: number,
  reason: InventoryMovementsFallbackReason,
  detail: string,
  sqliteCount = 0,
): ControlledInventoryMovementsRead {
  const diagnostic: InventoryMovementsReadDiagnostic = {
    source: "file",
    reason,
    detail,
    tenantId,
    checkedAt: new Date().toISOString(),
    gateDurationMs: Date.now() - startedAt,
    readDurationMs: 0,
    fileCount: fileMovements.length,
    sqliteCount,
  };
  lastDiagnostic = diagnostic;
  logFallback(diagnostic);
  return { source: "file", movements: fileMovements, diagnostic };
}

function markDirty(
  database: SQLiteConnection,
  tenantId: string,
  reason: InventoryMovementsFallbackReason,
  detail: string,
): void {
  void new CatalogValidationReceiptRepository({
    database,
    tenantId,
  }).markDirty(
    "inventory_movements",
    `SQLITE_INVENTORY_READ_${reason}`,
    detail,
  ).catch(() => undefined);
}

export function getLastInventoryMovementsReadDiagnostic():
  InventoryMovementsReadDiagnostic | null {
  return lastDiagnostic;
}

export async function readInventoryMovementsControlled(
  tenantValue: string,
  canonicalFileMovements: InventoryMovement[],
  sales: Sale[],
  products: Product[],
  query: InventoryMovementQuery = {},
  options: { enabled?: boolean; dependencies?: Dependencies } = {},
): Promise<ControlledInventoryMovementsRead> {
  const startedAt = Date.now();
  const tenantId = tenantValue.trim();
  const fileMovements = filterFileMovements(canonicalFileMovements, query);
  const platform = options.dependencies?.platform ??
    (await import("react-native")).Platform.OS;
  if (platform !== "android" && platform !== "ios") {
    return fallback(tenantId, fileMovements, startedAt, "WEB_USES_FILE",
      "La PWA siempre consulta el archivo canónico.");
  }
  if (!(options.enabled ?? sqliteInventoryMovementReadsEnabled())) {
    return fallback(tenantId, fileMovements, startedAt, "FEATURE_DISABLED",
      "La lectura SQLite de movimientos está desactivada.");
  }
  if (!tenantId) {
    return fallback(tenantId, fileMovements, startedAt, "TENANT_MISSING",
      "No existe una empresa activa.");
  }

  let database: SQLiteConnection | null;
  try {
    database = await (
      options.dependencies?.openDatabase ?? openFactuDarwinDatabase
    )();
  } catch (error) {
    return fallback(tenantId, fileMovements, startedAt, "SQLITE_OPEN_FAILED",
      error instanceof Error ? error.message : "No se pudo abrir SQLite.");
  }
  if (!database) {
    return fallback(tenantId, fileMovements, startedAt, "SQLITE_OPEN_FAILED",
      "SQLite no está disponible.");
  }

  try {
    const source = await (
      options.dependencies?.readDescriptor ?? readMainSnapshotFastDescriptor
    )();
    if (!source || source.companyId !== tenantId) {
      return fallback(tenantId, fileMovements, startedAt, "TENANT_MISMATCH",
        "El snapshot no pertenece exactamente a la empresa activa.");
    }
    const metadata = await new AppMetadataRepository({
      database,
      tenantId,
    }).read();
    if (
      !metadata ||
      metadata.tenantId !== tenantId ||
      metadata.schemaVersion !== SQLITE_SCHEMA_VERSION
    ) {
      return fallback(tenantId, fileMovements, startedAt, "SCHEMA_NOT_READY",
        "SQLite o sus metadatos no corresponden al esquema actual.");
    }
    const receipts = new CatalogValidationReceiptRepository({
      database,
      tenantId,
    });
    const receipt = await receipts.read("inventory_movements");
    if (!receipt) {
      return fallback(tenantId, fileMovements, startedAt, "RECEIPT_MISSING",
        "No existe recibo de movimientos.");
    }
    if (receipt.status === "dirty") {
      return fallback(tenantId, fileMovements, startedAt, "MIRROR_DIRTY",
        receipt.lastErrorCode || "El espejo está marcado como dirty.");
    }
    if (receipt.status !== "validated") {
      return fallback(tenantId, fileMovements, startedAt,
        "RECEIPT_NOT_VALIDATED", "El recibo no está validado.");
    }
    if (receipt.schemaVersion < 7 ||
        receipt.schemaVersion > SQLITE_SCHEMA_VERSION) {
      return fallback(tenantId, fileMovements, startedAt, "SCHEMA_NOT_READY",
        "El recibo no corresponde a un esquema compatible.");
    }
    if (receipt.snapshotGeneration !== source.snapshotGeneration) {
      return fallback(tenantId, fileMovements, startedAt,
        "SNAPSHOT_GENERATION_MISMATCH",
        "La generación del archivo es distinta a la del espejo.");
    }
    if (receipt.sourceHash !== source.catalogHashes.inventoryMovements) {
      return fallback(tenantId, fileMovements, startedAt,
        "SOURCE_HASH_MISMATCH",
        "El hash de movimientos no coincide con el archivo.");
    }
    if (receipt.rowCount !== canonicalFileMovements.length) {
      markDirty(database, tenantId, "ROW_COUNT_MISMATCH",
        "El recibo y el archivo tienen conteos distintos.");
      return fallback(tenantId, fileMovements, startedAt,
        "ROW_COUNT_MISMATCH", "El conteo del recibo no coincide.",
        receipt.rowCount);
    }
    const expectedMetrics = metricsFromReceipt(receipt.validationDetails);
    if (!expectedMetrics) {
      markDirty(database, tenantId, "AGGREGATE_MISMATCH",
        "El recibo no contiene todos los agregados requeridos.");
      return fallback(tenantId, fileMovements, startedAt,
        "AGGREGATE_MISMATCH",
        "El recibo no contiene agregados verificables.", receipt.rowCount);
    }
    const repository = options.dependencies?.createRepository?.(
      database, tenantId,
    ) ?? new InventoryMovementsRepository({ database, tenantId });
    const integrity = await repository.checkLightweightIntegrity(
      receipt.rowCount,
      expectedMetrics,
      sales,
      products,
    );
    if (!integrity.valid) {
      markDirty(database, tenantId, "AGGREGATE_MISMATCH",
        integrity.differences.join(","));
      return fallback(tenantId, fileMovements, startedAt,
        "AGGREGATE_MISMATCH", integrity.differences.join(","),
        integrity.rowCount);
    }
    const readStartedAt = Date.now();
    const movements = await repository.list(query);
    const unfiltered = Object.keys(query).length === 0;
    if (unfiltered && movements.length !== receipt.rowCount) {
      markDirty(database, tenantId, "ROW_COUNT_MISMATCH",
        "La consulta SQLite devolvió un conteo inesperado.");
      return fallback(tenantId, fileMovements, startedAt,
        "ROW_COUNT_MISMATCH", "SQLite devolvió otra cantidad.",
        movements.length);
    }
    const diagnostic: InventoryMovementsReadDiagnostic = {
      source: "sqlite",
      reason: null,
      detail: "",
      tenantId,
      checkedAt: new Date().toISOString(),
      gateDurationMs: readStartedAt - startedAt,
      readDurationMs: Date.now() - readStartedAt,
      fileCount: fileMovements.length,
      sqliteCount: movements.length,
    };
    lastDiagnostic = diagnostic;
    return { source: "sqlite", movements, diagnostic };
  } catch (error) {
    const detail = error instanceof Error
      ? error.message
      : "Error leyendo movimientos.";
    markDirty(database, tenantId, "SQLITE_READ_FAILED", detail);
    return fallback(tenantId, fileMovements, startedAt, "SQLITE_READ_FAILED",
      detail);
  }
}
