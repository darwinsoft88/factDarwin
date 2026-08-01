import { readMainSnapshotProductsSource } from "../mainSnapshotStorage";
import { AppMetadataRepository } from "./appMetadataRepository";
import { openFactuDarwinDatabase } from "./client";
import { ProductsRepository } from "./ProductsRepository";
import { SQLITE_SCHEMA_VERSION } from "./schema";

export type ProductsMirrorResult =
  | {
      status: "validated";
      tenantId: string;
      jsonCount: number;
      sqliteCount: number;
      comparedHashes: number;
      durationMs: number;
      migrated: boolean;
    }
  | {
      status: "skipped";
      reason: "web" | "missing-tenant" | "missing-snapshot";
    }
  | { status: "failed"; error: unknown };

export async function initializeProductsMirror(
  tenantIdValue: string,
): Promise<ProductsMirrorResult> {
  const tenantId = tenantIdValue.trim();
  if (!tenantId) {
    return { status: "skipped", reason: "missing-tenant" };
  }

  try {
    const database = await openFactuDarwinDatabase();
    if (!database) return { status: "skipped", reason: "web" };

    const source = await readMainSnapshotProductsSource();
    if (!source) {
      return { status: "skipped", reason: "missing-snapshot" };
    }
    if (source.companyId && source.companyId !== tenantId) {
      throw new Error(
        "El snapshot de productos no pertenece a la empresa activa.",
      );
    }

    const repository = new ProductsRepository({ database, tenantId });
    const currentParity = await repository.compareWithFileProducts(
      source.products,
    );
    if (currentParity.equal) {
      const metadata = new AppMetadataRepository({ database, tenantId });
      await metadata.save({
        tenantId,
        schemaVersion: SQLITE_SCHEMA_VERSION,
        migrationState: "products_validated",
        snapshotHash: source.payloadHash,
      });
      return {
        status: "validated",
        tenantId,
        jsonCount: currentParity.jsonCount,
        sqliteCount: currentParity.sqliteCount,
        comparedHashes: currentParity.comparedHashes,
        durationMs: 0,
        migrated: false,
      };
    }

    const migration = await repository.migrateMirror(
      source.products,
      source.payloadHash,
    );
    return {
      status: "validated",
      tenantId,
      jsonCount: migration.jsonCount,
      sqliteCount: migration.sqliteCount,
      comparedHashes: migration.comparedHashes,
      durationMs: migration.durationMs,
      migrated: true,
    };
  } catch (error) {
    return { status: "failed", error };
  }
}
