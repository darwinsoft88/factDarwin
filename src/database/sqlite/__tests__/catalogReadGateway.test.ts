jest.mock("../appMetadataRepository", () => ({
  AppMetadataRepository: jest.fn(),
}));
jest.mock("../ClientsRepository", () => ({
  ClientsRepository: jest.fn(),
}));
jest.mock("../ProductsRepository", () => ({
  ProductsRepository: jest.fn(),
}));
jest.mock("../CatalogValidationReceiptRepository", () => ({
  CatalogValidationReceiptRepository: jest.fn(),
}));

import type { Client, Product } from "../../../types";
import { AppMetadataRepository } from "../appMetadataRepository";
import {
  getLastCatalogReadDiagnostic,
  readCatalogsControlled,
  validateCatalogParity,
} from "../catalogReadGateway";
import { ClientsRepository } from "../ClientsRepository";
import { ProductsRepository } from "../ProductsRepository";
import { SQLITE_SCHEMA_VERSION } from "../schema";
import { CatalogValidationReceiptRepository } from "../CatalogValidationReceiptRepository";
import type { SQLiteConnection } from "../types";

const metadataRepositoryMock = jest.mocked(AppMetadataRepository);
const clientsRepositoryMock = jest.mocked(ClientsRepository);
const productsRepositoryMock = jest.mocked(ProductsRepository);
const receiptsRepositoryMock = jest.mocked(
  CatalogValidationReceiptRepository,
);

const fileClients: Client[] = [{
  id: "client-file",
  name: "Cliente",
  identification: "1711111111",
  identificationType: "05",
  email: "",
  phone: "",
  address: "",
}];
const fileProducts: Product[] = [{
  id: "product-file",
  itemType: "product",
  code: "P1",
  name: "Producto",
  price: 1,
  ivaRate: 0.15,
  stock: 1,
}];
const sqliteClients = [{ ...fileClients[0]!, name: "Cliente SQLite" }];
const sqliteProducts = [{ ...fileProducts[0]!, name: "Producto SQLite" }];
const database = {} as SQLiteConnection;

function source(companyId = "company-1", payloadHash = "hash-1") {
  return {
    schemaVersion: 1,
    companyId,
    issuerRuc: "1723772099001",
    snapshotGeneration: "generation-1",
    payloadHash,
    catalogHashes: {
      clients: "clients-hash",
      products: "products-hash",
      sales: "sales-hash",
      inventoryMovements: "inventory-hash",
    },
    createdAt: "2026-07-28T00:00:00.000Z",
    clients: fileClients,
    products: fileProducts,
    sales: [],
    inventoryMovements: [],
  };
}

function configureReady() {
  receiptsRepositoryMock.mockImplementation(() => ({
    readAll: jest.fn().mockResolvedValue([
      {
        tenantId: "company-1",
        catalogType: "clients",
        snapshotGeneration: "generation-1",
        sourceHash: "clients-hash",
        rowCount: 1,
        status: "validated",
        schemaVersion: SQLITE_SCHEMA_VERSION,
      },
      {
        tenantId: "company-1",
        catalogType: "products",
        snapshotGeneration: "generation-1",
        sourceHash: "products-hash",
        rowCount: 1,
        status: "validated",
        schemaVersion: SQLITE_SCHEMA_VERSION,
      },
    ]),
  }) as never);
  metadataRepositoryMock.mockImplementation(() => ({
    read: jest.fn().mockResolvedValue({
      tenantId: "company-1",
      schemaVersion: SQLITE_SCHEMA_VERSION,
      migrationState: "products_validated",
      snapshotHash: "hash-1",
    }),
  }) as never);
  clientsRepositoryMock.mockImplementation(() => ({
    compareWithFileClients: jest.fn().mockResolvedValue({
      equal: true,
      jsonCount: 1,
      sqliteCount: 1,
      comparedHashes: 1,
      differences: [],
    }),
    listAll: jest.fn().mockResolvedValue(sqliteClients),
  }) as never);
  productsRepositoryMock.mockImplementation(() => ({
    compareWithFileProducts: jest.fn().mockResolvedValue({
      equal: true,
      jsonCount: 1,
      sqliteCount: 1,
      comparedHashes: 1,
      differences: [],
    }),
    listAll: jest.fn().mockResolvedValue(sqliteProducts),
  }) as never);
}

describe("catalogReadGateway", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureReady();
  });

  const dependencies = {
    openDatabase: jest.fn(async () => database),
    readSource: jest.fn(async () => source()),
  };

  it("usa SQLite solamente con paridad conjunta total", async () => {
    const result = await readCatalogsControlled(
      "company-1",
      fileClients,
      fileProducts,
      { enabled: true, dependencies },
    );

    expect(result.source).toBe("sqlite");
    expect(result.clients).toEqual(sqliteClients);
    expect(result.products).toEqual(sqliteProducts);
    expect(result.diagnostic).toMatchObject({
      ready: true,
      fallbackReason: null,
      clients: { fileCount: 1, sqliteCount: 1, comparedHashes: 0 },
      products: { fileCount: 1, sqliteCount: 1, comparedHashes: 0 },
    });
  });

  it("mantiene el archivo cuando el flag está apagado", async () => {
    const openDatabase = jest.fn(async () => database);
    const result = await readCatalogsControlled(
      "company-1",
      fileClients,
      fileProducts,
      { enabled: false, dependencies: { ...dependencies, openDatabase } },
    );

    expect(result.source).toBe("file");
    expect(result.clients).toBe(fileClients);
    expect(result.diagnostic.fallbackReason).toBe("FEATURE_DISABLED");
    expect(openDatabase).not.toHaveBeenCalled();
  });

  it("hace fallback inmediato ante hash incompatible", async () => {
    metadataRepositoryMock.mockImplementation(() => ({
      read: jest.fn().mockResolvedValue({
        tenantId: "company-1",
        schemaVersion: SQLITE_SCHEMA_VERSION,
        migrationState: "products_validated",
        snapshotHash: "hash-anterior",
      }),
    }) as never);

    const result = await readCatalogsControlled(
      "company-1",
      fileClients,
      fileProducts,
      { enabled: true, dependencies },
    );

    expect(result.source).toBe("file");
    expect(result.diagnostic.fallbackReason)
      .toBe("SNAPSHOT_HASH_MISMATCH");
  });

  it("hace fallback ante corrupción o diferencia de clientes", async () => {
    receiptsRepositoryMock.mockImplementation(() => ({
      readAll: jest.fn().mockResolvedValue([{
        tenantId: "company-1",
        catalogType: "clients",
        snapshotGeneration: "generation-1",
        sourceHash: "clients-hash",
        rowCount: 1,
        status: "dirty",
        schemaVersion: SQLITE_SCHEMA_VERSION,
      }]),
    }) as never);

    const result = await readCatalogsControlled(
      "company-1",
      fileClients,
      fileProducts,
      { enabled: true, dependencies },
    );

    expect(result.source).toBe("file");
    expect(result.diagnostic.fallbackReason)
      .toBe("CATALOG_RECEIPT_MISSING");
    expect(result.diagnostic.fallbackDetail)
      .toContain("recibo");
  });

  it("rechaza mezcla entre empresas", async () => {
    const diagnostic = await validateCatalogParity("company-1", {
      openDatabase: async () => database,
      readSource: async () => source("company-2"),
    });

    expect(diagnostic.ready).toBe(false);
    expect(diagnostic.fallbackReason).toBe("TENANT_MISMATCH");
  });

  it("funciona sin internet y registra errores SQLite sin bloquear", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(async () => {
      throw new Error("sin internet");
    }) as typeof fetch;
    try {
      const offlineResult = await readCatalogsControlled(
        "company-1",
        fileClients,
        fileProducts,
        { enabled: true, dependencies },
      );
      expect(offlineResult.source).toBe("sqlite");

      const failed = await readCatalogsControlled(
        "company-1",
        fileClients,
        fileProducts,
        {
          enabled: true,
          dependencies: {
            openDatabase: async () => {
              throw new Error("database disk image is malformed");
            },
            readSource: async () => source(),
          },
        },
      );
      expect(failed.source).toBe("file");
      expect(failed.diagnostic.fallbackReason).toBe("SQLITE_ERROR");
      expect(getLastCatalogReadDiagnostic()).toEqual(failed.diagnostic);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
