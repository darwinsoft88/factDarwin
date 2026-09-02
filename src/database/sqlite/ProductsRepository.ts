import type { Product } from "../../types";
import { AppMetadataRepository } from "./appMetadataRepository";
import {
  canonicalProductRecord,
  hashProductRecord,
} from "./productRecord";
import {
  TenantRepository,
  type TenantRepositoryContext,
} from "./repository";
import { SQLITE_SCHEMA_VERSION } from "./schema";
import type { SQLiteConnection } from "./types";
import type { CatalogMirrorReceiptInput } from "./ClientsRepository";
import {
  CatalogValidationReceiptRepository,
} from "./CatalogValidationReceiptRepository";

interface ProductRow {
  id: string;
  item_type: string | null;
  code: string | null;
  barcode: string | null;
  name: string;
  unit_price_micros: number;
  cost_micros: number;
  tax_rate_basis_points: number;
  stock_micros: number;
  min_stock_micros: number;
  image_key: string | null;
  image_version: string | null;
  image_updated_at: string | null;
  image_mime_type: string | null;
  unit_measure: string | null;
  active: number;
  deleted: number;
  updated_at: string | null;
  compatibility_json: string | null;
  record_hash: string | null;
}

export interface ProductsParityResult {
  equal: boolean;
  jsonCount: number;
  sqliteCount: number;
  comparedHashes: number;
  differences: string[];
}

export interface ProductsMigrationResult extends ProductsParityResult {
  durationMs: number;
  snapshotHash: string;
}

interface PreparedProduct {
  product: Product;
  hash: string;
}

export class ProductsRepository extends TenantRepository {
  constructor(context: TenantRepositoryContext) {
    super(context);
  }

  private rows(
    database: SQLiteConnection = this.database,
  ): Promise<ProductRow[]> {
    return database.getAllAsync<ProductRow>(
      `SELECT
        id, item_type, code, barcode, name, unit_price_micros,
        cost_micros, tax_rate_basis_points, stock_micros,
        min_stock_micros, image_key, image_version, image_updated_at,
        image_mime_type, unit_measure, active, deleted, updated_at,
        compatibility_json, record_hash
       FROM products
       WHERE tenant_id = ?
       ORDER BY id ASC`,
      this.tenantId,
    );
  }

  private productsFromRows(rows: ProductRow[]): Product[] {
    return rows.map((row) => {
      const compatibility = row.compatibility_json
        ? JSON.parse(row.compatibility_json) as Record<string, unknown>
        : {};
      return {
        ...compatibility,
        id: row.id,
        itemType: row.item_type === "service" ? "service" : "product",
        code: row.code ?? "",
        ...(row.barcode ? { barcode: row.barcode } : {}),
        name: row.name,
        price: Number(row.unit_price_micros) / 1_000_000,
        cost: Number(row.cost_micros) / 1_000_000,
        ivaRate: Number(row.tax_rate_basis_points) / 10_000,
        stock: Number(row.stock_micros) / 1_000_000,
        minStock: Number(row.min_stock_micros) / 1_000_000,
        ...(row.image_key ? { imageKey: row.image_key } : {}),
        ...(row.image_version ? { imageVersion: row.image_version } : {}),
        ...(row.image_updated_at ? { imageUpdatedAt: row.image_updated_at } : {}),
        ...(row.image_mime_type ? { imageMimeType: row.image_mime_type as "image/webp" } : {}),
        ...(row.unit_measure ? { unitMeasure: row.unit_measure } : {}),
        ...(Number(row.active) === 0 ? { active: false } : {}),
        ...(Number(row.deleted) === 1 ? { deleted: true } : {}),
        ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
      } as Product;
    });
  }

  async listAll(): Promise<Product[]> {
    return this.productsFromRows(await this.rows());
  }

  async searchByName(search: string): Promise<Product[]> {
    const term = `%${search.trim().replace(/[\\%_]/g, "\\$&")}%`;
    const rows = await this.database.getAllAsync<ProductRow>(
      `SELECT
        id, item_type, code, barcode, name, unit_price_micros,
        cost_micros, tax_rate_basis_points, stock_micros,
        min_stock_micros, image_key, image_version, image_updated_at,
        image_mime_type, unit_measure, active, deleted, updated_at,
        compatibility_json, record_hash
       FROM products
       WHERE tenant_id = ? AND name LIKE ? ESCAPE '\\' COLLATE NOCASE
       ORDER BY name ASC, id ASC`,
      this.tenantId,
      term,
    );
    return this.productsFromRows(rows);
  }

  async searchByCodeOrBarcode(search: string): Promise<Product[]> {
    const term = `%${search.trim().replace(/[\\%_]/g, "\\$&")}%`;
    const rows = await this.database.getAllAsync<ProductRow>(
      `SELECT
        id, item_type, code, barcode, name, unit_price_micros,
        cost_micros, tax_rate_basis_points, stock_micros,
        min_stock_micros, image_key, image_version, image_updated_at,
        image_mime_type, unit_measure, active, deleted, updated_at,
        compatibility_json, record_hash
       FROM products
       WHERE tenant_id = ?
         AND (code LIKE ? ESCAPE '\\' OR barcode LIKE ? ESCAPE '\\')
       ORDER BY code ASC, id ASC`,
      this.tenantId,
      term,
      term,
    );
    return this.productsFromRows(rows);
  }

  private comparePrepared(
    prepared: PreparedProduct[],
    rows: ProductRow[],
  ): ProductsParityResult {
    const expected = new Map(
      prepared.map(({ product, hash }) => {
        const record = canonicalProductRecord(product);
        return [record.id, { record, hash }] as const;
      }),
    );
    const differences: string[] = [];

    if (expected.size !== prepared.length) {
      differences.push("DUPLICATE_JSON_IDS");
    }
    if (rows.length !== prepared.length) {
      differences.push("COUNT_MISMATCH");
    }

    for (const row of rows) {
      const source = expected.get(row.id);
      if (!source) {
        differences.push(`UNEXPECTED_ID:${row.id}`);
        continue;
      }
      let compatibility: Record<string, unknown> = {};
      try {
        compatibility = row.compatibility_json
          ? JSON.parse(row.compatibility_json) as Record<string, unknown>
          : {};
      } catch {
        differences.push(`INVALID_COMPATIBILITY:${row.id}`);
      }
      const databaseRecord = {
        id: row.id,
        itemType: row.item_type === "service" ? "service" : "product",
        code: row.code ?? "",
        barcode: row.barcode,
        name: row.name,
        priceMicros: Number(row.unit_price_micros),
        costMicros: Number(row.cost_micros),
        ivaRateBasisPoints: Number(row.tax_rate_basis_points),
        stockMicros: Number(row.stock_micros),
        minStockMicros: Number(row.min_stock_micros),
        imageKey: row.image_key,
        imageVersion: row.image_version,
        imageUpdatedAt: row.image_updated_at,
        imageMimeType: row.image_mime_type,
        unitMeasure: row.unit_measure,
        active: Number(row.active) === 1,
        deleted: Number(row.deleted) === 1,
        updatedAt: row.updated_at,
        compatibility,
      };
      if (JSON.stringify(databaseRecord) !== JSON.stringify(source.record)) {
        differences.push(`RECORD_MISMATCH:${row.id}`);
      }
      if (row.record_hash !== source.hash) {
        differences.push(`HASH_MISMATCH:${row.id}`);
      }
      expected.delete(row.id);
    }

    for (const missingId of expected.keys()) {
      differences.push(`MISSING_ID:${missingId}`);
    }

    return {
      equal: differences.length === 0,
      jsonCount: prepared.length,
      sqliteCount: rows.length,
      comparedHashes: prepared.length - expected.size,
      differences,
    };
  }

  private prepare(products: Product[]): Promise<PreparedProduct[]> {
    return Promise.all(
      products.map(async (product) => ({
        product,
        hash: await hashProductRecord(product),
      })),
    );
  }

  async compareWithFileProducts(
    products: Product[],
  ): Promise<ProductsParityResult> {
    const prepared = await this.prepare(products);
    return this.comparePrepared(prepared, await this.rows());
  }

  async migrateMirror(
    products: Product[],
    snapshotHash: string,
  ): Promise<ProductsMigrationResult> {
    const startedAt = Date.now();
    const prepared = await this.prepare(products);
    let parity: ProductsParityResult | null = null;

    await this.database.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync(
        "DELETE FROM products WHERE tenant_id = ?",
        this.tenantId,
      );

      for (const { product, hash } of prepared) {
        const record = canonicalProductRecord(product);
        await transaction.runAsync(
          `INSERT INTO products (
            tenant_id, id, item_type, code, barcode, name,
            unit_price_micros, cost_micros, tax_rate_basis_points,
            stock_micros, min_stock_micros, image_key, image_version,
            image_updated_at, image_mime_type, unit_measure, active,
            deleted, updated_at, compatibility_json, record_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          this.tenantId,
          record.id,
          record.itemType,
          record.code,
          record.barcode,
          record.name,
          record.priceMicros,
          record.costMicros,
          record.ivaRateBasisPoints,
          record.stockMicros,
          record.minStockMicros,
          record.imageKey,
          record.imageVersion,
          record.imageUpdatedAt,
          record.imageMimeType,
          record.unitMeasure,
          record.active ? 1 : 0,
          record.deleted ? 1 : 0,
          record.updatedAt,
          JSON.stringify(record.compatibility),
          hash,
        );
      }

      parity = this.comparePrepared(prepared, await this.rows(transaction));
      if (!parity.equal) {
        throw new Error(
          `La migración de productos no alcanzó paridad: ${parity.differences.join(", ")}`,
        );
      }

      const metadata = new AppMetadataRepository({
        database: transaction,
        tenantId: this.tenantId,
      });
      await metadata.saveWithinTransaction(transaction, {
        tenantId: this.tenantId,
        schemaVersion: SQLITE_SCHEMA_VERSION,
        migrationState: "products_validated",
        snapshotHash,
      });
    });

    const result = parity as ProductsParityResult | null;
    if (!result) {
      throw new Error("No se obtuvo el resultado de paridad de productos.");
    }
    return {
      ...result,
      durationMs: Date.now() - startedAt,
      snapshotHash,
    };
  }

  async synchronizeIncremental(
    products: Product[],
    receipt: CatalogMirrorReceiptInput,
  ): Promise<ProductsParityResult> {
    const prepared = await this.prepare(products);
    let parity: ProductsParityResult | null = null;
    await this.database.withExclusiveTransactionAsync(async (transaction) => {
      const existing = await transaction.getAllAsync<{
        id: string;
        record_hash: string | null;
      }>(
        "SELECT id, record_hash FROM products WHERE tenant_id = ?",
        this.tenantId,
      );
      const expectedIds = new Set(
        prepared.map(({ product }) => String(product.id)),
      );
      for (const row of existing) {
        if (!expectedIds.has(row.id)) {
          await transaction.runAsync(
            "DELETE FROM products WHERE tenant_id = ? AND id = ?",
            this.tenantId,
            row.id,
          );
        }
      }
      const hashes = new Map(existing.map((row) => [row.id, row.record_hash]));
      for (const { product, hash } of prepared) {
        const record = canonicalProductRecord(product);
        if (hashes.get(record.id) === hash) continue;
        await transaction.runAsync(
          `INSERT INTO products (
            tenant_id, id, item_type, code, barcode, name,
            unit_price_micros, cost_micros, tax_rate_basis_points,
            stock_micros, min_stock_micros, image_key, image_version,
            image_updated_at, image_mime_type, unit_measure, active,
            deleted, updated_at, compatibility_json, record_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(tenant_id, id) DO UPDATE SET
            item_type = excluded.item_type,
            code = excluded.code,
            barcode = excluded.barcode,
            name = excluded.name,
            unit_price_micros = excluded.unit_price_micros,
            cost_micros = excluded.cost_micros,
            tax_rate_basis_points = excluded.tax_rate_basis_points,
            stock_micros = excluded.stock_micros,
            min_stock_micros = excluded.min_stock_micros,
            image_key = excluded.image_key,
            image_version = excluded.image_version,
            image_updated_at = excluded.image_updated_at,
            image_mime_type = excluded.image_mime_type,
            unit_measure = excluded.unit_measure,
            active = excluded.active,
            deleted = excluded.deleted,
            updated_at = excluded.updated_at,
            compatibility_json = excluded.compatibility_json,
            record_hash = excluded.record_hash`,
          this.tenantId,
          record.id,
          record.itemType,
          record.code,
          record.barcode,
          record.name,
          record.priceMicros,
          record.costMicros,
          record.ivaRateBasisPoints,
          record.stockMicros,
          record.minStockMicros,
          record.imageKey,
          record.imageVersion,
          record.imageUpdatedAt,
          record.imageMimeType,
          record.unitMeasure,
          record.active ? 1 : 0,
          record.deleted ? 1 : 0,
          record.updatedAt,
          JSON.stringify(record.compatibility),
          hash,
        );
      }
      parity = this.comparePrepared(prepared, await this.rows(transaction));
      if (!parity.equal) {
        throw new Error(parity.differences.join(", "));
      }
      if (!(await receipt.confirmCanonical())) {
        throw new Error("STALE_SNAPSHOT_GENERATION");
      }
      await new CatalogValidationReceiptRepository({
        database: transaction,
        tenantId: this.tenantId,
      }).saveValidatedWithinTransaction(transaction, {
        catalogType: "products",
        snapshotGeneration: receipt.snapshotGeneration,
        sourceHash: receipt.sourceHash,
        rowCount: products.length,
        schemaVersion: receipt.schemaVersion,
      });
    });
    if (!parity) throw new Error("No se validó el espejo de productos.");
    return parity;
  }
}
