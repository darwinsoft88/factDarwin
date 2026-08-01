import type { Client, Product } from "../../types";
import { readMainSnapshotCatalogSource } from "../mainSnapshotStorage";
import { AppMetadataRepository } from "./appMetadataRepository";
import { ClientsRepository } from "./ClientsRepository";
import { openFactuDarwinDatabase } from "./client";
import { sqliteCatalogReadsEnabled } from "./catalogReadFeature";
import { ProductsRepository } from "./ProductsRepository";
import { SQLITE_SCHEMA_VERSION } from "./schema";
import type { SQLiteConnection } from "./types";
import {
  CatalogValidationReceiptRepository,
} from "./CatalogValidationReceiptRepository";

export type CatalogFallbackReason =
  | "FEATURE_DISABLED"
  | "WEB_USES_FILE"
  | "MISSING_TENANT"
  | "MISSING_SNAPSHOT"
  | "TENANT_MISMATCH"
  | "METADATA_MISSING"
  | "SCHEMA_NOT_READY"
  | "CLIENTS_NOT_VALIDATED"
  | "PRODUCTS_NOT_VALIDATED"
  | "SNAPSHOT_HASH_MISMATCH"
  | "CATALOG_RECEIPT_MISSING"
  | "CATALOG_RECEIPT_DIRTY"
  | "CLIENTS_PARITY_FAILED"
  | "PRODUCTS_PARITY_FAILED"
  | "SQLITE_ERROR";

export interface CatalogParityDiagnostic {
  ready: boolean;
  tenantId: string;
  checkedAt: string;
  durationMs: number;
  fallbackReason: CatalogFallbackReason | null;
  fallbackDetail: string;
  snapshotHash: string | null;
  clients: {
    fileCount: number;
    sqliteCount: number;
    comparedHashes: number;
    equal: boolean;
  };
  products: {
    fileCount: number;
    sqliteCount: number;
    comparedHashes: number;
    equal: boolean;
  };
}

export interface ControlledCatalogRead {
  source: "sqlite" | "file";
  clients: Client[];
  products: Product[];
  diagnostic: CatalogParityDiagnostic;
  readDurationMs: number;
}

interface CatalogGatewayDependencies {
  openDatabase?: () => Promise<SQLiteConnection | null>;
  readSource?: typeof readMainSnapshotCatalogSource;
}

let lastDiagnostic: CatalogParityDiagnostic | null = null;

function emptyDiagnostic(
  tenantId: string,
  reason: CatalogFallbackReason,
  detail: string,
  startedAt: number,
): CatalogParityDiagnostic {
  return {
    ready: false,
    tenantId,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    fallbackReason: reason,
    fallbackDetail: detail,
    snapshotHash: null,
    clients: {
      fileCount: 0,
      sqliteCount: 0,
      comparedHashes: 0,
      equal: false,
    },
    products: {
      fileCount: 0,
      sqliteCount: 0,
      comparedHashes: 0,
      equal: false,
    },
  };
}

function recordDiagnostic(
  diagnostic: CatalogParityDiagnostic,
): CatalogParityDiagnostic {
  lastDiagnostic = diagnostic;
  return diagnostic;
}

export function getLastCatalogReadDiagnostic():
  CatalogParityDiagnostic | null {
  return lastDiagnostic;
}

export async function validateCatalogParity(
  tenantIdValue: string,
  dependencies: CatalogGatewayDependencies = {},
): Promise<CatalogParityDiagnostic> {
  const startedAt = Date.now();
  const tenantId = tenantIdValue.trim();
  if (!tenantId) {
    return recordDiagnostic(emptyDiagnostic(
      tenantId,
      "MISSING_TENANT",
      "No existe una empresa activa para consultar SQLite.",
      startedAt,
    ));
  }

  try {
    const database = await (
      dependencies.openDatabase ?? openFactuDarwinDatabase
    )();
    if (!database) {
      return recordDiagnostic(emptyDiagnostic(
        tenantId,
        "WEB_USES_FILE",
        "La PWA conserva el almacenamiento por archivo/IndexedDB.",
        startedAt,
      ));
    }
    const source = await (
      dependencies.readSource ?? readMainSnapshotCatalogSource
    )();
    if (!source) {
      return recordDiagnostic(emptyDiagnostic(
        tenantId,
        "MISSING_SNAPSHOT",
        "No existe un snapshot validado para comparar.",
        startedAt,
      ));
    }
    if (source.companyId && source.companyId !== tenantId) {
      return recordDiagnostic(emptyDiagnostic(
        tenantId,
        "TENANT_MISMATCH",
        "El snapshot no pertenece a la empresa activa.",
        startedAt,
      ));
    }

    const metadata = await new AppMetadataRepository({
      database,
      tenantId,
    }).read();
    if (!metadata) {
      return recordDiagnostic(emptyDiagnostic(
        tenantId,
        "METADATA_MISSING",
        "No existen metadatos SQLite para la empresa.",
        startedAt,
      ));
    }
    if (metadata.tenantId !== tenantId) {
      return recordDiagnostic(emptyDiagnostic(
        tenantId,
        "TENANT_MISMATCH",
        "Los metadatos SQLite pertenecen a otra empresa.",
        startedAt,
      ));
    }
    if (metadata.schemaVersion !== SQLITE_SCHEMA_VERSION) {
      return recordDiagnostic(emptyDiagnostic(
        tenantId,
        "SCHEMA_NOT_READY",
        "La versión del esquema SQLite no está lista.",
        startedAt,
      ));
    }
    if (metadata.migrationState === "not_started") {
      return recordDiagnostic(emptyDiagnostic(
        tenantId,
        "CLIENTS_NOT_VALIDATED",
        "El espejo de clientes todavía no está validado.",
        startedAt,
      ));
    }
    if (metadata.migrationState !== "products_validated") {
      return recordDiagnostic(emptyDiagnostic(
        tenantId,
        "PRODUCTS_NOT_VALIDATED",
        "El espejo de productos todavía no está validado.",
        startedAt,
      ));
    }
    if (
      !metadata.snapshotHash ||
      metadata.snapshotHash !== source.payloadHash
    ) {
      return recordDiagnostic(emptyDiagnostic(
        tenantId,
        "SNAPSHOT_HASH_MISMATCH",
        "El espejo fue creado desde otra versión del snapshot.",
        startedAt,
      ));
    }

    const receipts = await new CatalogValidationReceiptRepository({
      database,
      tenantId,
    }).readAll();
    const clientsReceipt = receipts.find(
      ({ catalogType }) => catalogType === "clients",
    );
    const productsReceipt = receipts.find(
      ({ catalogType }) => catalogType === "products",
    );
    if (!clientsReceipt || !productsReceipt) {
      return recordDiagnostic(emptyDiagnostic(
        tenantId,
        "CATALOG_RECEIPT_MISSING",
        "Falta el recibo validado de uno o más catálogos.",
        startedAt,
      ));
    }
    if (
      clientsReceipt.status !== "validated" ||
      productsReceipt.status !== "validated"
    ) {
      return recordDiagnostic(emptyDiagnostic(
        tenantId,
        "CATALOG_RECEIPT_DIRTY",
        "Uno o más espejos SQLite requieren reconstrucción.",
        startedAt,
      ));
    }
    const clientsEqual =
      clientsReceipt.schemaVersion === SQLITE_SCHEMA_VERSION &&
      clientsReceipt.snapshotGeneration === source.snapshotGeneration &&
      clientsReceipt.sourceHash === source.catalogHashes.clients &&
      clientsReceipt.rowCount === source.clients.length;
    const productsEqual =
      productsReceipt.schemaVersion === SQLITE_SCHEMA_VERSION &&
      productsReceipt.snapshotGeneration === source.snapshotGeneration &&
      productsReceipt.sourceHash === source.catalogHashes.products &&
      productsReceipt.rowCount === source.products.length;
    const diagnostic: CatalogParityDiagnostic = {
      ready: clientsEqual && productsEqual,
      tenantId,
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      fallbackReason: !clientsEqual
        ? "CLIENTS_PARITY_FAILED"
        : !productsEqual
          ? "PRODUCTS_PARITY_FAILED"
          : null,
      fallbackDetail: !clientsEqual
        ? "El recibo de clientes no corresponde al snapshot actual."
        : !productsEqual
          ? "El recibo de productos no corresponde al snapshot actual."
          : "",
      snapshotHash: source.payloadHash,
      clients: {
        fileCount: source.clients.length,
        sqliteCount: clientsReceipt.rowCount,
        comparedHashes: 0,
        equal: clientsEqual,
      },
      products: {
        fileCount: source.products.length,
        sqliteCount: productsReceipt.rowCount,
        comparedHashes: 0,
        equal: productsEqual,
      },
    };
    return recordDiagnostic(diagnostic);
  } catch (error) {
    return recordDiagnostic(emptyDiagnostic(
      tenantId,
      "SQLITE_ERROR",
      error instanceof Error ? error.message : "Error desconocido de SQLite.",
      startedAt,
    ));
  }
}

export async function readCatalogsControlled(
  tenantId: string,
  fileClients: Client[],
  fileProducts: Product[],
  options: {
    enabled?: boolean;
    dependencies?: CatalogGatewayDependencies;
  } = {},
): Promise<ControlledCatalogRead> {
  const readStartedAt = Date.now();
  const enabled = options.enabled ?? sqliteCatalogReadsEnabled();
  if (!enabled) {
    const diagnostic = recordDiagnostic(emptyDiagnostic(
      tenantId,
      "FEATURE_DISABLED",
      "La lectura SQLite de catálogos está desactivada.",
      Date.now(),
    ));
    return {
      source: "file",
      clients: fileClients,
      products: fileProducts,
      diagnostic,
      readDurationMs: Date.now() - readStartedAt,
    };
  }

  const diagnostic = await validateCatalogParity(
    tenantId,
    options.dependencies,
  );
  if (!diagnostic.ready) {
    return {
      source: "file",
      clients: fileClients,
      products: fileProducts,
      diagnostic,
      readDurationMs: Date.now() - readStartedAt,
    };
  }

  try {
    const database = await (
      options.dependencies?.openDatabase ?? openFactuDarwinDatabase
    )();
    if (!database) {
      return {
        source: "file",
        clients: fileClients,
        products: fileProducts,
        diagnostic: recordDiagnostic(emptyDiagnostic(
          tenantId,
          "WEB_USES_FILE",
          "SQLite dejó de estar disponible antes de la lectura.",
          Date.now(),
        )),
        readDurationMs: Date.now() - readStartedAt,
      };
    }
    const [clients, products] = await Promise.all([
      new ClientsRepository({ database, tenantId }).listAll(),
      new ProductsRepository({ database, tenantId }).listAll(),
    ]);
    return {
      source: "sqlite",
      clients,
      products,
      diagnostic,
      readDurationMs: Date.now() - readStartedAt,
    };
  } catch (error) {
    return {
      source: "file",
      clients: fileClients,
      products: fileProducts,
      diagnostic: recordDiagnostic(emptyDiagnostic(
        tenantId,
        "SQLITE_ERROR",
        error instanceof Error ? error.message : "Error leyendo SQLite.",
        Date.now(),
      )),
      readDurationMs: Date.now() - readStartedAt,
    };
  }
}
