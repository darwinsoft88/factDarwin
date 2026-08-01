import type { Sale } from "../../types";
import { readMainSnapshotFastDescriptor } from "../mainSnapshotStorage";
import { CatalogValidationReceiptRepository } from
  "./CatalogValidationReceiptRepository";
import { AppMetadataRepository } from "./appMetadataRepository";
import { openFactuDarwinDatabase } from "./client";
import { SalesRepository } from "./SalesRepository";
import { sqliteSalesReadsEnabled } from "./salesReadFeature";
import { SQLITE_SCHEMA_VERSION } from "./schema";
import type { SalesFinancialMetrics } from "./saleRecord";
import { hashSaleRecord } from "./saleRecord";
import type { SQLiteConnection } from "./types";

export type SalesFallbackReason =
  | "FEATURE_DISABLED"
  | "WEB_USES_FILE"
  | "TENANT_MISSING"
  | "TENANT_MISMATCH"
  | "SCHEMA_NOT_READY"
  | "SALES_RECEIPT_MISSING"
  | "SALES_NOT_VALIDATED"
  | "SALES_MARKED_DIRTY"
  | "SNAPSHOT_GENERATION_MISMATCH"
  | "SALES_HASH_MISMATCH"
  | "SALES_COUNT_MISMATCH"
  | "LIGHTWEIGHT_INTEGRITY_FAILED"
  | "SQLITE_OPEN_FAILED"
  | "SQLITE_READ_FAILED"
  | "SALE_RECONSTRUCTION_FAILED";

export interface SalesReadDiagnostic {
  source: "sqlite" | "file";
  reason: SalesFallbackReason | null;
  detail: string;
  tenantId: string;
  checkedAt: string;
  gateDurationMs: number;
  readDurationMs: number;
  fileCount: number;
  sqliteCount: number;
  approximateBytes: number;
}

export interface ControlledSalesRead {
  source: "sqlite" | "file";
  sales: Sale[];
  diagnostic: SalesReadDiagnostic;
}

interface Dependencies {
  openDatabase?: () => Promise<SQLiteConnection | null>;
  readDescriptor?: typeof readMainSnapshotFastDescriptor;
  createRepository?: (
    database: SQLiteConnection,
    tenantId: string,
  ) => Pick<
    SalesRepository,
    "checkLightweightIntegrity" | "listSummaries"
  >;
}

let lastDiagnostic: SalesReadDiagnostic | null = null;

function result(
  tenantId: string,
  fileSales: Sale[],
  startedAt: number,
  reason: SalesFallbackReason,
  detail: string,
  sqliteCount = 0,
): ControlledSalesRead {
  const diagnostic: SalesReadDiagnostic = {
    source: "file",
    reason,
    detail,
    tenantId,
    checkedAt: new Date().toISOString(),
    gateDurationMs: Date.now() - startedAt,
    readDurationMs: 0,
    fileCount: fileSales.length,
    sqliteCount,
    approximateBytes: 0,
  };
  lastDiagnostic = diagnostic;
  return { source: "file", sales: fileSales, diagnostic };
}

function receiptMetrics(
  details: Record<string, unknown> | null,
): SalesFinancialMetrics | null {
  const keys: Array<keyof SalesFinancialMetrics> = [
    "subtotalMicros", "taxMicros", "discountMicros", "totalMicros",
    "creditBalanceMicros", "lineCount", "paymentCount", "signedXmlCount",
    "authorizedXmlCount",
  ];
  if (!details || keys.some((key) => !Number.isFinite(details[key]))) {
    return null;
  }
  return Object.fromEntries(
    keys.map((key) => [key, Number(details[key])]),
  ) as unknown as SalesFinancialMetrics;
}

export function getLastSalesReadDiagnostic(): SalesReadDiagnostic | null {
  return lastDiagnostic;
}

export async function readSalesControlled(
  tenantValue: string,
  fileSales: Sale[],
  options: { enabled?: boolean; dependencies?: Dependencies } = {},
): Promise<ControlledSalesRead> {
  const startedAt = Date.now();
  const tenantId = tenantValue.trim();
  if (!(options.enabled ?? sqliteSalesReadsEnabled())) {
    return result(tenantId, fileSales, startedAt, "FEATURE_DISABLED",
      "La lectura SQLite de ventas está desactivada.");
  }
  if (!tenantId) {
    return result(tenantId, fileSales, startedAt, "TENANT_MISSING",
      "No existe una empresa activa.");
  }
  let database: SQLiteConnection | null;
  try {
    database = await (
      options.dependencies?.openDatabase ?? openFactuDarwinDatabase
    )();
  } catch (error) {
    return result(tenantId, fileSales, startedAt, "SQLITE_OPEN_FAILED",
      error instanceof Error ? error.message : "No se pudo abrir SQLite.");
  }
  if (!database) {
    return result(tenantId, fileSales, startedAt, "WEB_USES_FILE",
      "La PWA continúa leyendo el archivo.");
  }
  try {
    const source = await (
      options.dependencies?.readDescriptor ?? readMainSnapshotFastDescriptor
    )();
    if (!source || (source.companyId && source.companyId !== tenantId)) {
      return result(tenantId, fileSales, startedAt, "TENANT_MISMATCH",
        "El snapshot no pertenece a la empresa activa.");
    }
    const metadata = await new AppMetadataRepository({
      database, tenantId,
    }).read();
    if (
      !metadata ||
      metadata.tenantId !== tenantId ||
      metadata.schemaVersion < 5
    ) {
      return result(tenantId, fileSales, startedAt, "SCHEMA_NOT_READY",
        "Los metadatos SQLite de la empresa no están listos.");
    }
    const receipt = await new CatalogValidationReceiptRepository({
      database, tenantId,
    }).read("sales");
    if (!receipt) {
      return result(tenantId, fileSales, startedAt, "SALES_RECEIPT_MISSING",
        "No existe recibo de validación de Ventas.");
    }
    if (receipt.status === "dirty") {
      return result(tenantId, fileSales, startedAt, "SALES_MARKED_DIRTY",
        receipt.lastErrorCode || "El espejo requiere reconstrucción.");
    }
    if (receipt.status !== "validated") {
      return result(tenantId, fileSales, startedAt, "SALES_NOT_VALIDATED",
        "El espejo de Ventas no está validado.");
    }
    if (receipt.schemaVersion !== SQLITE_SCHEMA_VERSION) {
      return result(tenantId, fileSales, startedAt, "SCHEMA_NOT_READY",
        "El recibo no corresponde al esquema SQLite actual.");
    }
    if (receipt.snapshotGeneration !== source.snapshotGeneration) {
      return result(tenantId, fileSales, startedAt,
        "SNAPSHOT_GENERATION_MISMATCH",
        "El archivo es más reciente que el espejo SQLite.");
    }
    if (receipt.sourceHash !== source.catalogHashes.sales) {
      return result(tenantId, fileSales, startedAt, "SALES_HASH_MISMATCH",
        "El hash de Ventas no coincide.");
    }
    if (
      receipt.rowCount !== fileSales.length
    ) {
      return result(tenantId, fileSales, startedAt, "SALES_COUNT_MISMATCH",
        "La cantidad de ventas no coincide.", receipt.rowCount);
    }
    const expectedMetrics = receiptMetrics(receipt.validationDetails);
    if (!expectedMetrics) {
      return result(tenantId, fileSales, startedAt,
        "LIGHTWEIGHT_INTEGRITY_FAILED",
        "El recibo no contiene agregados verificables.", receipt.rowCount);
    }
    const repository = options.dependencies?.createRepository?.(
      database, tenantId,
    ) ?? new SalesRepository({ database, tenantId });
    const integrity = await repository.checkLightweightIntegrity(
      receipt.rowCount, expectedMetrics,
    );
    if (!integrity.valid) {
      return result(tenantId, fileSales, startedAt,
        "LIGHTWEIGHT_INTEGRITY_FAILED",
        integrity.differences.join(","), integrity.rowCount);
    }
    const readStartedAt = Date.now();
    const sales = await repository.listSummaries();
    if (sales.length !== receipt.rowCount) {
      return result(tenantId, fileSales, startedAt, "SALES_COUNT_MISMATCH",
        "La consulta resumida devolvió otra cantidad.", sales.length);
    }
    const diagnostic: SalesReadDiagnostic = {
      source: "sqlite",
      reason: null,
      detail: "",
      tenantId,
      checkedAt: new Date().toISOString(),
      gateDurationMs: readStartedAt - startedAt,
      readDurationMs: Date.now() - readStartedAt,
      fileCount: fileSales.length,
      sqliteCount: sales.length,
      approximateBytes: JSON.stringify(sales).length * 2,
    };
    lastDiagnostic = diagnostic;
    return { source: "sqlite", sales, diagnostic };
  } catch (error) {
    return result(tenantId, fileSales, startedAt, "SQLITE_READ_FAILED",
      error instanceof Error ? error.message : "Error leyendo Ventas.");
  }
}

export async function loadSaleDetailControlled(
  tenantId: string,
  saleId: string,
  canonicalSale: Sale,
): Promise<Sale> {
  try {
    const database = await openFactuDarwinDatabase();
    if (!database) return canonicalSale;
    const detail = await new SalesRepository({
      database, tenantId,
    }).loadDetailById(saleId);
    if (!detail) return canonicalSale;
    const reconstructed = {
      ...detail,
      signedXml: canonicalSale.signedXml,
      authorizedXml: canonicalSale.authorizedXml,
    };
    return await hashSaleRecord(reconstructed) ===
        await hashSaleRecord(canonicalSale)
      ? detail
      : canonicalSale;
  } catch {
    return canonicalSale;
  }
}

export async function loadSaleXmlControlled(
  tenantId: string,
  saleId: string,
  canonicalSale: Sale,
): Promise<Pick<Sale, "signedXml" | "authorizedXml">> {
  try {
    const database = await openFactuDarwinDatabase();
    if (!database) return canonicalSale;
    const xml = await new SalesRepository({
      database, tenantId,
    }).loadXmlById(saleId);
    if (
      !xml ||
      xml.signedXml !== canonicalSale.signedXml ||
      xml.authorizedXml !== canonicalSale.authorizedXml
    ) {
      return canonicalSale;
    }
    return xml;
  } catch {
    return canonicalSale;
  }
}
