import {
  TenantRepository,
  type TenantRepositoryContext,
} from "./repository";
import type { SQLiteConnection } from "./types";

export type CatalogType =
  | "clients"
  | "products"
  | "sales"
  | "inventory_movements"
  | "credit_payments"
  | "credit_adjustments"
  | "received_retentions"
  | "remission_guides"
  | "pending_sync_operations";
export type CatalogReceiptStatus = "validated" | "dirty";

export interface CatalogValidationReceipt {
  tenantId: string;
  catalogType: CatalogType;
  snapshotGeneration: string;
  sourceHash: string;
  rowCount: number;
  status: CatalogReceiptStatus;
  schemaVersion: number;
  validatedAt: string | null;
  updatedAt: string;
  lastErrorCode: string | null;
  lastErrorDetail: string | null;
  validationDetails: Record<string, unknown> | null;
}

interface ReceiptRow {
  tenant_id: string;
  catalog_type: CatalogType;
  snapshot_generation: string;
  source_hash: string;
  row_count: number;
  status: CatalogReceiptStatus;
  schema_version: number;
  validated_at: string | null;
  updated_at: string;
  last_error_code: string | null;
  last_error_detail: string | null;
  validation_details_json: string | null;
}

function fromRow(row: ReceiptRow): CatalogValidationReceipt {
  return {
    tenantId: row.tenant_id,
    catalogType: row.catalog_type,
    snapshotGeneration: row.snapshot_generation,
    sourceHash: row.source_hash,
    rowCount: Number(row.row_count),
    status: row.status,
    schemaVersion: Number(row.schema_version),
    validatedAt: row.validated_at,
    updatedAt: row.updated_at,
    lastErrorCode: row.last_error_code,
    lastErrorDetail: row.last_error_detail,
    validationDetails: row.validation_details_json
      ? JSON.parse(row.validation_details_json) as Record<string, unknown>
      : null,
  };
}

export class CatalogValidationReceiptRepository extends TenantRepository {
  constructor(context: TenantRepositoryContext) {
    super(context);
  }

  async read(catalogType: CatalogType): Promise<CatalogValidationReceipt | null> {
    const row = await this.database.getFirstAsync<ReceiptRow>(
      `SELECT tenant_id, catalog_type, snapshot_generation, source_hash,
        row_count, status, schema_version, validated_at, updated_at,
        last_error_code, last_error_detail, validation_details_json
       FROM catalog_validation_receipts
       WHERE tenant_id = ? AND catalog_type = ?`,
      this.tenantId,
      catalogType,
    );
    return row ? fromRow(row) : null;
  }

  async readAll(): Promise<CatalogValidationReceipt[]> {
    const rows = await this.database.getAllAsync<ReceiptRow>(
      `SELECT tenant_id, catalog_type, snapshot_generation, source_hash,
        row_count, status, schema_version, validated_at, updated_at,
        last_error_code, last_error_detail, validation_details_json
       FROM catalog_validation_receipts
       WHERE tenant_id = ?`,
      this.tenantId,
    );
    return rows.map(fromRow);
  }

  async saveValidatedWithinTransaction(
    transaction: SQLiteConnection,
    receipt: Omit<
      CatalogValidationReceipt,
      "tenantId" | "status" | "validatedAt" | "updatedAt" |
      "lastErrorCode" | "lastErrorDetail" | "validationDetails"
    > & {
      validationDetails?: Record<string, unknown>;
    },
  ): Promise<void> {
    const now = new Date().toISOString();
    await transaction.runAsync(
      `INSERT INTO catalog_validation_receipts (
        tenant_id, catalog_type, snapshot_generation, source_hash,
        row_count, status, schema_version, validated_at, updated_at,
        last_error_code, last_error_detail, validation_details_json
      ) VALUES (?, ?, ?, ?, ?, 'validated', ?, ?, ?, NULL, NULL, ?)
      ON CONFLICT(tenant_id, catalog_type) DO UPDATE SET
        snapshot_generation = excluded.snapshot_generation,
        source_hash = excluded.source_hash,
        row_count = excluded.row_count,
        status = 'validated',
        schema_version = excluded.schema_version,
        validated_at = excluded.validated_at,
        updated_at = excluded.updated_at,
        last_error_code = NULL,
        last_error_detail = NULL,
        validation_details_json = excluded.validation_details_json`,
      this.tenantId,
      receipt.catalogType,
      receipt.snapshotGeneration,
      receipt.sourceHash,
      receipt.rowCount,
      receipt.schemaVersion,
      now,
      now,
      receipt.validationDetails
        ? JSON.stringify(receipt.validationDetails)
        : null,
    );
  }

  async markDirty(
    catalogType: CatalogType,
    errorCode: string,
    errorDetail: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.database.runAsync(
      `INSERT INTO catalog_validation_receipts (
        tenant_id, catalog_type, snapshot_generation, source_hash,
        row_count, status, schema_version, validated_at, updated_at,
        last_error_code, last_error_detail
      ) VALUES (?, ?, '', '', 0, 'dirty', 0, NULL, ?, ?, ?)
      ON CONFLICT(tenant_id, catalog_type) DO UPDATE SET
        status = 'dirty',
        validated_at = NULL,
        updated_at = excluded.updated_at,
        last_error_code = excluded.last_error_code,
        last_error_detail = excluded.last_error_detail,
        validation_details_json = NULL`,
      this.tenantId,
      catalogType,
      now,
      errorCode,
      errorDetail.slice(0, 500),
    );
  }
}
