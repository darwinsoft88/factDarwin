import { readMainSnapshotClientsSource } from "../mainSnapshotStorage";
import { AppMetadataRepository } from "./appMetadataRepository";
import { ClientsRepository } from "./ClientsRepository";
import { openFactuDarwinDatabase } from "./client";
import { SQLITE_SCHEMA_VERSION } from "./schema";

export type ClientsMirrorResult =
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

export async function initializeClientsMirror(
  tenantIdValue: string,
): Promise<ClientsMirrorResult> {
  const tenantId = tenantIdValue.trim();
  if (!tenantId) {
    return { status: "skipped", reason: "missing-tenant" };
  }

  try {
    const database = await openFactuDarwinDatabase();
    if (!database) return { status: "skipped", reason: "web" };

    const source = await readMainSnapshotClientsSource();
    if (!source) {
      return { status: "skipped", reason: "missing-snapshot" };
    }
    if (source.companyId && source.companyId !== tenantId) {
      throw new Error(
        "El snapshot de clientes no pertenece a la empresa activa.",
      );
    }

    const repository = new ClientsRepository({ database, tenantId });
    const currentParity = await repository.compareWithFileClients(
      source.clients,
    );
    if (currentParity.equal) {
      const metadata = new AppMetadataRepository({ database, tenantId });
      await metadata.save({
        tenantId,
        schemaVersion: SQLITE_SCHEMA_VERSION,
        migrationState: "clients_validated",
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
      source.clients,
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
