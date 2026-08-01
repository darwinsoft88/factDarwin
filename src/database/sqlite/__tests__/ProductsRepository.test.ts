jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: jest.fn(
    async (_algorithm: string, value: string) => `hash:${value}`,
  ),
}));

import type { Product } from "../../../types";
import { ProductsRepository } from "../ProductsRepository";
import type {
  SQLiteBindValue,
  SQLiteConnection,
  SQLiteRunResult,
} from "../types";

interface StoredProduct {
  tenant_id: string;
  id: string;
  item_type: string;
  code: string;
  barcode: string | null;
  name: string;
  unit_price_micros: number;
  cost_micros: number;
  tax_rate_basis_points: number;
  stock_micros: number;
  min_stock_micros: number;
  unit_measure: string | null;
  active: number;
  deleted: number;
  updated_at: string | null;
  compatibility_json: string;
  record_hash: string;
}

class ProductsDatabase implements SQLiteConnection {
  rows: StoredProduct[] = [];
  corruptSelect = false;

  async execAsync(): Promise<void> {
    return undefined;
  }

  async runAsync(
    source: string,
    ...params: SQLiteBindValue[]
  ): Promise<SQLiteRunResult> {
    if (source.includes("DELETE FROM products")) {
      const tenantId = String(params[0]);
      this.rows = this.rows.filter((row) => row.tenant_id !== tenantId);
    } else if (source.includes("INSERT INTO products")) {
      this.rows.push({
        tenant_id: String(params[0]),
        id: String(params[1]),
        item_type: String(params[2]),
        code: String(params[3]),
        barcode: params[4] === null ? null : String(params[4]),
        name: String(params[5]),
        unit_price_micros: Number(params[6]),
        cost_micros: Number(params[7]),
        tax_rate_basis_points: Number(params[8]),
        stock_micros: Number(params[9]),
        min_stock_micros: Number(params[10]),
        unit_measure: params[11] === null ? null : String(params[11]),
        active: Number(params[12]),
        deleted: Number(params[13]),
        updated_at: params[14] === null ? null : String(params[14]),
        compatibility_json: String(params[15]),
        record_hash: String(params[16]),
      });
    }
    return { changes: 1, lastInsertRowId: 0 };
  }

  async getFirstAsync<T>(): Promise<T | null> {
    return null;
  }

  async getAllAsync<T>(
    source: string,
    ...params: SQLiteBindValue[]
  ): Promise<T[]> {
    if (!source.includes("FROM products")) return [];
    const tenantId = String(params[0]);
    const term = String(params[1] ?? "")
      .replace(/^%|%$/g, "")
      .replace(/\\([\\%_])/g, "$1")
      .toLowerCase();
    return this.rows
      .filter((row) => row.tenant_id === tenantId)
      .filter((row) => !source.includes("name LIKE") ||
        row.name.toLowerCase().includes(term))
      .filter((row) => !source.includes("code LIKE") ||
        row.code.toLowerCase().includes(term) ||
        (row.barcode || "").toLowerCase().includes(term))
      .map((row) => ({
        ...row,
        stock_micros: this.corruptSelect
          ? row.stock_micros + 1
          : row.stock_micros,
      }) as T)
      .sort((left, right) =>
        (left as { id: string }).id.localeCompare(
          (right as { id: string }).id,
        ));
  }

  async withExclusiveTransactionAsync(
    task: (transaction: SQLiteConnection) => Promise<void>,
  ): Promise<void> {
    const before = this.rows.map((row) => ({ ...row }));
    try {
      await task(this);
    } catch (error) {
      this.rows = before;
      throw error;
    }
  }

  async closeAsync(): Promise<void> {
    return undefined;
  }
}

const products: Product[] = [
  {
    id: "product-decimal",
    itemType: "product",
    code: "P-001",
    name: "Producto decimal",
    price: 12.345678,
    cost: 7.123456,
    ivaRate: 0.15,
    stock: 2.75,
    minStock: 0.5,
    updatedAt: "2026-07-28T10:00:00.000Z",
  },
  {
    id: "service",
    itemType: "service",
    code: "SERV-1",
    name: "Servicio",
    price: 20,
    cost: 0,
    ivaRate: 0.12,
    stock: 0,
    minStock: 0,
  },
  {
    id: "without-code",
    itemType: "product",
    code: "",
    name: "Registro antiguo sin código",
    price: 1.5,
    ivaRate: 0,
    stock: 1.25,
  },
  {
    id: "duplicate-code",
    itemType: "product",
    code: "P-001",
    name: "Código repetido antiguo",
    price: 2,
    ivaRate: 0.08,
    stock: 3,
  },
  {
    id: "legacy",
    itemType: "product",
    code: "LEGACY",
    name: "Producto antiguo",
    price: 3,
    cost: 1,
    ivaRate: 0.15,
    stock: 4,
    minStock: 1,
    barcode: "7861234567890",
    unitMeasure: "unidad",
    active: false,
    deleted: true,
    otherTaxes: [{ code: "ICE", rate: 0.1 }],
  } as Product,
];

describe("ProductsRepository", () => {
  it("valida productos, servicios, decimales y compatibilidad antigua", async () => {
    const database = new ProductsDatabase();
    const repository = new ProductsRepository({
      database,
      tenantId: "company-1",
    });

    const result = await repository.migrateMirror(
      products,
      "snapshot-hash",
    );

    expect(result).toMatchObject({
      equal: true,
      jsonCount: 5,
      sqliteCount: 5,
      comparedHashes: 5,
      differences: [],
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(database.rows.find(({ id }) => id === "product-decimal"))
      .toMatchObject({
        unit_price_micros: 12_345_678,
        stock_micros: 2_750_000,
        min_stock_micros: 500_000,
        tax_rate_basis_points: 1500,
      });
    expect(database.rows.find(({ id }) => id === "service"))
      .toMatchObject({ item_type: "service", stock_micros: 0 });
    expect(database.rows.find(({ id }) => id === "legacy"))
      .toMatchObject({
        barcode: "7861234567890",
        unit_measure: "unidad",
        active: 0,
        deleted: 1,
      });
    expect(
      database.rows.find(({ id }) => id === "legacy")
        ?.compatibility_json,
    ).toContain("otherTaxes");
  });

  it("detecta cambios de código, nombre, precio, IVA, stock y hash", async () => {
    const database = new ProductsDatabase();
    const repository = new ProductsRepository({
      database,
      tenantId: "company-1",
    });
    await repository.migrateMirror(products, "snapshot-hash");

    const changed = products.map((product, index) => index === 0
      ? {
          ...product,
          code: "CAMBIADO",
          name: "Nombre cambiado",
          price: 99.25,
          ivaRate: 0,
          stock: 100.5,
        }
      : product);
    const parity = await repository.compareWithFileProducts(changed);

    expect(parity.equal).toBe(false);
    expect(parity.differences).toContain(
      "RECORD_MISMATCH:product-decimal",
    );
    expect(parity.differences).toContain(
      "HASH_MISMATCH:product-decimal",
    );
  });

  it("restaura el espejo anterior ante cualquier diferencia", async () => {
    const database = new ProductsDatabase();
    database.rows = [{
      tenant_id: "company-1",
      id: "previous",
      item_type: "product",
      code: "OLD",
      barcode: null,
      name: "Espejo anterior",
      unit_price_micros: 1_000_000,
      cost_micros: 0,
      tax_rate_basis_points: 0,
      stock_micros: 0,
      min_stock_micros: 0,
      unit_measure: null,
      active: 1,
      deleted: 0,
      updated_at: null,
      compatibility_json: "{}",
      record_hash: "previous-hash",
    }];
    database.corruptSelect = true;
    const repository = new ProductsRepository({
      database,
      tenantId: "company-1",
    });

    await expect(
      repository.migrateMirror(products, "snapshot-hash"),
    ).rejects.toThrow("no alcanzó paridad");

    expect(database.rows).toHaveLength(1);
    expect(database.rows[0]?.id).toBe("previous");
    expect(database.rows[0]?.record_hash).toBe("previous-hash");
  });

  it("mantiene aislamiento completo entre empresas", async () => {
    const database = new ProductsDatabase();
    const first = new ProductsRepository({
      database,
      tenantId: "company-1",
    });
    const second = new ProductsRepository({
      database,
      tenantId: "company-2",
    });

    await first.migrateMirror(products, "hash-1");
    await second.migrateMirror([
      { ...products[0]!, id: "other-company-product" },
    ], "hash-2");

    await expect(
      first.compareWithFileProducts(products),
    ).resolves.toMatchObject({
      equal: true,
      jsonCount: 5,
      sqliteCount: 5,
    });
    expect(
      database.rows.filter(({ tenant_id }) => tenant_id === "company-2"),
    ).toHaveLength(1);
  });

  it("busca por nombre, código principal y código de barras", async () => {
    const database = new ProductsDatabase();
    const repository = new ProductsRepository({
      database,
      tenantId: "company-1",
    });
    await repository.migrateMirror(products, "snapshot-hash");

    await expect(repository.searchByName("servicio")).resolves.toMatchObject([
      { id: "service", itemType: "service" },
    ]);
    await expect(
      repository.searchByCodeOrBarcode("P-001"),
    ).resolves.toHaveLength(2);
    await expect(
      repository.searchByCodeOrBarcode("67890"),
    ).resolves.toMatchObject([
      { id: "legacy", barcode: "7861234567890" },
    ]);
  });
});
