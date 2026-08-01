import type { InventoryMovement, Product, Sale } from "../../types";
import {
  canonicalInventoryMovement,
  hashInventoryMovement,
  INVENTORY_DECIMAL_SCALE,
  type CanonicalInventoryMovement,
} from "./inventoryMovementRecord";
import {
  CatalogValidationReceiptRepository,
} from "./CatalogValidationReceiptRepository";
import type { CatalogMirrorReceiptInput } from "./ClientsRepository";
import {
  TenantRepository,
  type TenantRepositoryContext,
} from "./repository";
import type { SQLiteConnection } from "./types";

interface PreparedMovement {
  record: CanonicalInventoryMovement;
  hash: string;
  sourceIndex: number;
}

interface MovementRow {
  id: string;
  source_index: number;
  product_id: string | null;
  product_name: string | null;
  movement_type: string | null;
  quantity_micros: number | null;
  stock_before_micros: number | null;
  stock_after_micros: number | null;
  reason: string | null;
  reference: string | null;
  sale_id: string | null;
  inventory_operation_id: string | null;
  inventory_operation_type: string | null;
  user_id: string | null;
  created_at: string | null;
  compatibility_json: string;
  record_hash: string;
}

export interface InventoryMovementMetrics {
  entryQuantityMicros: number;
  exitQuantityMicros: number;
  positiveAdjustmentMicros: number;
  negativeAdjustmentMicros: number;
  entryStockDeltaMicros: number;
  exitStockDeltaMicros: number;
  adjustmentStockDeltaMicros: number;
  missingStockBefore: number;
  missingStockAfter: number;
  linkedSales: number;
  linkedCreditNotes: number;
  unknownSaleRelations: number;
  rowsWithoutOperation: number;
  operationCount: number;
  operationsWithMultipleRows: number;
  maxRowsPerOperation: number;
  stockBeforeMicros: number;
  stockAfterMicros: number;
  negativeQuantityRows: number;
  negativeStockRows: number;
  legacyIncompleteRows: number;
  missingCurrentProductRows: number;
  quantityByProduct: Record<string, number>;
  operationRowCounts: Record<string, number>;
  quantityByEstablishment: "UNAVAILABLE";
  costAvailability: "UNAVAILABLE";
  establishmentAvailability: "UNAVAILABLE";
  warehouseAvailability: "UNAVAILABLE";
}

export interface InventoryMovementsParityResult {
  equal: boolean;
  jsonCount: number;
  sqliteCount: number;
  comparedHashes: number;
  metrics: InventoryMovementMetrics;
  differences: string[];
}

export interface InventoryMovementsMigrationResult
  extends InventoryMovementsParityResult {
  durationMs: number;
  snapshotHash: string;
}

export interface InventoryMovementQuery {
  productId?: string;
  operationId?: string;
  saleId?: string;
  createdFrom?: string;
  createdTo?: string;
  movementType?: string;
  search?: string;
}

function rowRecord(row: MovementRow): CanonicalInventoryMovement {
  const stored = JSON.parse(row.compatibility_json) as {
    presentFields?: string[];
    unknown?: Record<string, unknown>;
  };
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    movementType: row.movement_type,
    quantityMicros: row.quantity_micros === null
      ? null
      : Number(row.quantity_micros),
    stockBeforeMicros: row.stock_before_micros === null
      ? null
      : Number(row.stock_before_micros),
    stockAfterMicros: row.stock_after_micros === null
      ? null
      : Number(row.stock_after_micros),
    reason: row.reason,
    reference: row.reference,
    saleId: row.sale_id,
    inventoryOperationId: row.inventory_operation_id,
    inventoryOperationType: row.inventory_operation_type,
    userId: row.user_id,
    createdAt: row.created_at,
    presentFields: stored.presentFields ?? [],
    compatibility: stored.unknown ?? {},
  };
}

export function calculateInventoryMovementMetrics(
  records: CanonicalInventoryMovement[],
  sales: Sale[],
  products: Product[],
): InventoryMovementMetrics {
  const saleTypes = new Map(sales.map((sale) => [sale.id, sale.documentType]));
  const productIds = new Set(products.map((product) => product.id));
  const operationRows = new Map<string, number>();
  const result: InventoryMovementMetrics = {
    entryQuantityMicros: 0,
    exitQuantityMicros: 0,
    positiveAdjustmentMicros: 0,
    negativeAdjustmentMicros: 0,
    entryStockDeltaMicros: 0,
    exitStockDeltaMicros: 0,
    adjustmentStockDeltaMicros: 0,
    missingStockBefore: 0,
    missingStockAfter: 0,
    linkedSales: 0,
    linkedCreditNotes: 0,
    unknownSaleRelations: 0,
    rowsWithoutOperation: 0,
    operationCount: 0,
    operationsWithMultipleRows: 0,
    maxRowsPerOperation: 0,
    stockBeforeMicros: 0,
    stockAfterMicros: 0,
    negativeQuantityRows: 0,
    negativeStockRows: 0,
    legacyIncompleteRows: 0,
    missingCurrentProductRows: 0,
    quantityByProduct: {},
    operationRowCounts: {},
    quantityByEstablishment: "UNAVAILABLE",
    costAvailability: "UNAVAILABLE",
    establishmentAvailability: "UNAVAILABLE",
    warehouseAvailability: "UNAVAILABLE",
  };
  for (const record of records) {
    const quantity = record.quantityMicros ?? 0;
    const delta = record.stockBeforeMicros === null ||
        record.stockAfterMicros === null
      ? 0
      : record.stockAfterMicros - record.stockBeforeMicros;
    result.stockBeforeMicros += record.stockBeforeMicros ?? 0;
    result.stockAfterMicros += record.stockAfterMicros ?? 0;
    if (quantity < 0) result.negativeQuantityRows += 1;
    if (
      (record.stockBeforeMicros ?? 0) < 0 ||
      (record.stockAfterMicros ?? 0) < 0
    ) {
      result.negativeStockRows += 1;
    }
    if (
      record.quantityMicros === null ||
      record.stockBeforeMicros === null ||
      record.stockAfterMicros === null ||
      !record.productId ||
      !record.movementType
    ) {
      result.legacyIncompleteRows += 1;
    }
    if (record.productId) {
      result.quantityByProduct[record.productId] =
        (result.quantityByProduct[record.productId] ?? 0) + quantity;
      if (!productIds.has(record.productId)) {
        result.missingCurrentProductRows += 1;
      }
    }
    if (record.movementType === "entrada") {
      result.entryQuantityMicros += quantity;
      result.entryStockDeltaMicros += delta;
    } else if (record.movementType === "salida") {
      result.exitQuantityMicros += quantity;
      result.exitStockDeltaMicros += delta;
    } else if (record.movementType === "ajuste") {
      result.adjustmentStockDeltaMicros += delta;
      if (delta >= 0) result.positiveAdjustmentMicros += delta;
      else result.negativeAdjustmentMicros += Math.abs(delta);
    }
    if (record.stockBeforeMicros === null) result.missingStockBefore += 1;
    if (record.stockAfterMicros === null) result.missingStockAfter += 1;
    if (record.saleId) {
      const documentType = saleTypes.get(record.saleId);
      if (documentType === "nota_credito") result.linkedCreditNotes += 1;
      else if (documentType) result.linkedSales += 1;
      else result.unknownSaleRelations += 1;
    }
    if (record.inventoryOperationId) {
      operationRows.set(
        record.inventoryOperationId,
        (operationRows.get(record.inventoryOperationId) ?? 0) + 1,
      );
    } else {
      result.rowsWithoutOperation += 1;
    }
  }
  result.operationCount = operationRows.size;
  result.operationsWithMultipleRows = [...operationRows.values()]
    .filter((count) => count > 1).length;
  result.maxRowsPerOperation = Math.max(0, ...operationRows.values());
  result.quantityByProduct = Object.fromEntries(
    Object.entries(result.quantityByProduct)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  result.operationRowCounts = Object.fromEntries(
    [...operationRows.entries()]
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  return result;
}

function movementFromRow(row: MovementRow): InventoryMovement {
  const record = rowRecord(row);
  const present = new Set(record.presentFields);
  const movement: Record<string, unknown> = {
    ...record.compatibility,
    id: record.id,
  };
  const assign = (key: string, value: unknown) => {
    if (present.has(key)) movement[key] = value;
  };
  assign("productId", record.productId);
  assign("productName", record.productName);
  assign("type", record.movementType);
  assign("quantity", record.quantityMicros === null
    ? null
    : record.quantityMicros / INVENTORY_DECIMAL_SCALE);
  assign("stockBefore", record.stockBeforeMicros === null
    ? null
    : record.stockBeforeMicros / INVENTORY_DECIMAL_SCALE);
  assign("stockAfter", record.stockAfterMicros === null
    ? null
    : record.stockAfterMicros / INVENTORY_DECIMAL_SCALE);
  assign("reason", record.reason);
  assign("reference", record.reference);
  assign("saleId", record.saleId);
  assign("inventoryOperationId", record.inventoryOperationId);
  assign("inventoryOperationType", record.inventoryOperationType);
  assign("userId", record.userId);
  assign("createdAt", record.createdAt);
  return movement as unknown as InventoryMovement;
}

export class InventoryMovementsRepository extends TenantRepository {
  constructor(context: TenantRepositoryContext) {
    super(context);
  }

  private async prepare(
    movements: InventoryMovement[],
  ): Promise<PreparedMovement[]> {
    return Promise.all(movements.map(async (movement, sourceIndex) => ({
      record: canonicalInventoryMovement(movement),
      hash: await hashInventoryMovement(movement),
      sourceIndex,
    })));
  }

  private async rows(
    database: SQLiteConnection = this.database,
  ): Promise<MovementRow[]> {
    return database.getAllAsync<MovementRow>(
      `SELECT * FROM inventory_movements
       WHERE tenant_id = ?
       ORDER BY source_index ASC`,
      this.tenantId,
    );
  }

  async list(query: InventoryMovementQuery = {}): Promise<InventoryMovement[]> {
    const conditions = ["tenant_id = ?"];
    const parameters: string[] = [this.tenantId];
    if (query.productId) {
      conditions.push("product_id = ?");
      parameters.push(query.productId);
    }
    if (query.operationId) {
      conditions.push("inventory_operation_id = ?");
      parameters.push(query.operationId);
    }
    if (query.saleId) {
      conditions.push("sale_id = ?");
      parameters.push(query.saleId);
    }
    if (query.createdFrom) {
      conditions.push("created_at >= ?");
      parameters.push(query.createdFrom);
    }
    if (query.createdTo) {
      conditions.push("created_at <= ?");
      parameters.push(query.createdTo);
    }
    if (query.movementType) {
      conditions.push("movement_type = ?");
      parameters.push(query.movementType);
    }
    const search = query.search?.trim().toLowerCase();
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(`(
        LOWER(COALESCE(product_name, '')) LIKE ? OR
        LOWER(COALESCE(reason, '')) LIKE ? OR
        LOWER(COALESCE(reference, '')) LIKE ? OR
        LOWER(COALESCE(movement_type, '')) LIKE ?
      )`);
      parameters.push(pattern, pattern, pattern, pattern);
    }
    const rows = await this.database.getAllAsync<MovementRow>(
      `SELECT * FROM inventory_movements
       WHERE ${conditions.join(" AND ")}
       ORDER BY source_index ASC`,
      ...parameters,
    );
    return rows.map(movementFromRow);
  }

  async checkLightweightIntegrity(
    expectedCount: number,
    expectedMetrics: InventoryMovementMetrics,
    sales: Sale[],
    products: Product[],
  ): Promise<{
    valid: boolean;
    rowCount: number;
    metrics: InventoryMovementMetrics;
    differences: string[];
  }> {
    const rows = await this.rows();
    const actualMetrics = calculateInventoryMovementMetrics(
      rows.map(rowRecord), sales, products,
    );
    const differences: string[] = [];
    if (rows.length !== expectedCount) differences.push("COUNT_MISMATCH");
    for (const key of Object.keys(expectedMetrics) as Array<
      keyof InventoryMovementMetrics
    >) {
      if (JSON.stringify(actualMetrics[key]) !==
          JSON.stringify(expectedMetrics[key])) {
        differences.push(`AGGREGATE_MISMATCH:${key}`);
      }
    }
    return {
      valid: differences.length === 0,
      rowCount: rows.length,
      metrics: actualMetrics,
      differences,
    };
  }

  private compare(
    prepared: PreparedMovement[],
    rows: MovementRow[],
    sales: Sale[],
    products: Product[],
  ): InventoryMovementsParityResult {
    const differences: string[] = [];
    if (new Set(prepared.map(({ record }) => record.id)).size !==
        prepared.length) {
      differences.push("DUPLICATE_SOURCE_IDS");
    }
    if (rows.length !== prepared.length) differences.push("COUNT_MISMATCH");
    let comparedHashes = 0;
    prepared.forEach((expected, index) => {
      const actual = rows[index];
      if (!actual) {
        differences.push(`MISSING_SOURCE_INDEX:${index}`);
        return;
      }
      if (Number(actual.source_index) !== index) {
        differences.push(`SOURCE_ORDER_MISMATCH:${index}`);
      }
      if (actual.id !== expected.record.id) {
        differences.push(`ID_MISMATCH:${index}`);
      }
      if (actual.record_hash !== expected.hash) {
        differences.push(`HASH_MISMATCH:${expected.record.id}`);
      }
      if (JSON.stringify(rowRecord(actual)) !==
          JSON.stringify(expected.record)) {
        differences.push(`RECORD_MISMATCH:${expected.record.id}`);
      }
      comparedHashes += 1;
    });
    const expectedMetrics = calculateInventoryMovementMetrics(
      prepared.map(({ record }) => record), sales, products,
    );
    const actualMetrics = calculateInventoryMovementMetrics(
      rows.map(rowRecord), sales, products,
    );
    for (const key of Object.keys(expectedMetrics) as Array<
      keyof InventoryMovementMetrics
    >) {
      if (JSON.stringify(expectedMetrics[key]) !==
          JSON.stringify(actualMetrics[key])) {
        differences.push(`AGGREGATE_MISMATCH:${key}`);
      }
    }
    return {
      equal: differences.length === 0,
      jsonCount: prepared.length,
      sqliteCount: rows.length,
      comparedHashes,
      metrics: actualMetrics,
      differences,
    };
  }

  async migrateMirror(
    movements: InventoryMovement[],
    sales: Sale[],
    products: Product[],
    receipt: CatalogMirrorReceiptInput,
  ): Promise<InventoryMovementsMigrationResult> {
    const startedAt = Date.now();
    const prepared = await this.prepare(movements);
    let parity: InventoryMovementsParityResult | null = null;
    await this.database.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync(
        "DELETE FROM inventory_movements WHERE tenant_id = ?",
        this.tenantId,
      );
      for (const item of prepared) {
        const record = item.record;
        await transaction.runAsync(
          `INSERT INTO inventory_movements (
            tenant_id, id, source_index, product_id, product_name,
            movement_type, quantity_micros, stock_before_micros,
            stock_after_micros, reason, reference, sale_id,
            inventory_operation_id, inventory_operation_type, user_id,
            created_at, compatibility_json, record_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          this.tenantId, record.id, item.sourceIndex, record.productId,
          record.productName, record.movementType, record.quantityMicros,
          record.stockBeforeMicros, record.stockAfterMicros, record.reason,
          record.reference, record.saleId, record.inventoryOperationId,
          record.inventoryOperationType, record.userId, record.createdAt,
          JSON.stringify({
            presentFields: record.presentFields,
            unknown: record.compatibility,
          }),
          item.hash,
        );
      }
      parity = this.compare(
        prepared,
        await this.rows(transaction),
        sales,
        products,
      );
      if (!parity.equal) {
        throw new Error(
          `La migración de inventario no alcanzó paridad: ${
            parity.differences.join(", ")
          }`,
        );
      }
      if (!(await receipt.confirmCanonical())) {
        throw new Error("STALE_SNAPSHOT_GENERATION");
      }
      await new CatalogValidationReceiptRepository({
        database: transaction,
        tenantId: this.tenantId,
      }).saveValidatedWithinTransaction(transaction, {
        catalogType: "inventory_movements",
        snapshotGeneration: receipt.snapshotGeneration,
        sourceHash: receipt.sourceHash,
        rowCount: movements.length,
        schemaVersion: receipt.schemaVersion,
        validationDetails: {
          ...parity.metrics,
          theoreticalStock: "DIAGNOSTIC_ONLY",
        },
      });
    });
    const result = parity as InventoryMovementsParityResult | null;
    if (!result) throw new Error("No se validó el espejo de inventario.");
    return {
      ...result,
      durationMs: Date.now() - startedAt,
      snapshotHash: receipt.sourceHash,
    };
  }
}
