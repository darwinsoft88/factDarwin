import { readMainSnapshotDescriptor } from "../mainSnapshotStorage";
import { AppMetadataRepository } from "./appMetadataRepository";
import { openFactuDarwinDatabase } from "./client";
import { SQLITE_SCHEMA_VERSION } from "./schema";

export type SQLiteBootstrapResult =
  | { status: "ready"; tenantId: string; snapshotHash: string | null }
  | { status: "skipped"; reason: "web" | "missing-tenant" }
  | { status: "failed"; error: unknown };

export async function initializeSQLiteMetadata(
  tenantIdValue: string,
): Promise<SQLiteBootstrapResult> {
  const tenantId = tenantIdValue.trim();
  if (!tenantId) {
    return { status: "skipped", reason: "missing-tenant" };
  }

  try {
    const database = await openFactuDarwinDatabase();
    if (!database) {
      return { status: "skipped", reason: "web" };
    }

    const snapshot = await readMainSnapshotDescriptor();
    if (
      snapshot?.companyId &&
      snapshot.companyId !== tenantId
    ) {
      throw new Error(
        "El snapshot local no pertenece a la empresa activa.",
      );
    }

    const repository = new AppMetadataRepository({
      database,
      tenantId,
    });
    await repository.save({
      tenantId,
      schemaVersion: SQLITE_SCHEMA_VERSION,
      migrationState: "not_started",
      snapshotHash: snapshot?.payloadHash ?? null,
    });

    return {
      status: "ready",
      tenantId,
      snapshotHash: snapshot?.payloadHash ?? null,
    };
  } catch (error) {
    return { status: "failed", error };
  }
}
