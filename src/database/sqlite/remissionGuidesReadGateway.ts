import type { RemissionGuide } from "../../types";
import { readMainSnapshotFastDescriptor } from "../mainSnapshotStorage";
import { AppMetadataRepository } from "./appMetadataRepository";
import { CatalogValidationReceiptRepository } from
  "./CatalogValidationReceiptRepository";
import { openFactuDarwinDatabase } from "./client";
import { canonicalRemissionGuide } from "./remissionGuideRecord";
import { RemissionGuidesRepository } from "./RemissionGuidesRepository";
import { sqliteRemissionGuideReadsEnabled } from
  "./remissionGuidesReadFeature";
import { SQLITE_SCHEMA_VERSION } from "./schema";
import type { SQLiteConnection } from "./types";

export type RemissionGuidesFallbackReason =
  | "FEATURE_DISABLED" | "WEB_USES_FILE" | "TENANT_MISSING"
  | "TENANT_MISMATCH" | "SCHEMA_NOT_READY" | "RECEIPT_MISSING"
  | "RECEIPT_NOT_VALIDATED" | "MIRROR_DIRTY"
  | "SNAPSHOT_GENERATION_MISMATCH" | "SOURCE_HASH_MISMATCH"
  | "ROW_COUNT_MISMATCH" | "CONTENT_MISMATCH"
  | "SQLITE_OPEN_FAILED" | "SQLITE_READ_FAILED";

export interface ControlledRemissionGuidesRead {
  source: "file" | "sqlite";
  guides: RemissionGuide[];
  diagnostic: {
    reason: RemissionGuidesFallbackReason | null;
    tenantId: string;
    fileCount: number;
    sqliteCount: number;
    durationMs: number;
  };
}

interface Dependencies {
  platform?: string;
  openDatabase?: () => Promise<SQLiteConnection | null>;
  readDescriptor?: typeof readMainSnapshotFastDescriptor;
  createRepository?: (
    database: SQLiteConnection,
    tenantId: string,
  ) => Pick<RemissionGuidesRepository, "list">;
}

function fallback(
  tenantId: string,
  guides: RemissionGuide[],
  startedAt: number,
  reason: RemissionGuidesFallbackReason,
  sqliteCount = 0,
): ControlledRemissionGuidesRead {
  // eslint-disable-next-line no-console
  console.info(JSON.stringify({
    event: "sqlite_remission_guides_fallback",
    tenantId, reason, fileCount: guides.length, sqliteCount,
  }));
  return {
    source: "file",
    guides,
    diagnostic: {
      reason, tenantId, fileCount: guides.length, sqliteCount,
      durationMs: Date.now() - startedAt,
    },
  };
}

function sameContent(file: RemissionGuide[], sqlite: RemissionGuide[]) {
  return file.length === sqlite.length && file.every((guide, index) =>
    JSON.stringify(canonicalRemissionGuide(guide)) ===
      JSON.stringify(canonicalRemissionGuide(sqlite[index]!))
  );
}

function markDirty(
  database: SQLiteConnection,
  tenantId: string,
  reason: string,
) {
  void new CatalogValidationReceiptRepository({
    database, tenantId,
  }).markDirty("remission_guides", reason, reason).catch(() => undefined);
}

export async function readRemissionGuidesControlled(
  tenantValue: string,
  fileGuides: RemissionGuide[],
  options: { enabled?: boolean; dependencies?: Dependencies } = {},
): Promise<ControlledRemissionGuidesRead> {
  const startedAt = Date.now();
  const tenantId = tenantValue.trim();
  const platform = options.dependencies?.platform ??
    (await import("react-native")).Platform.OS;
  if (platform !== "android" && platform !== "ios") {
    return fallback(tenantId, fileGuides, startedAt, "WEB_USES_FILE");
  }
  if (!(options.enabled ?? sqliteRemissionGuideReadsEnabled())) {
    return fallback(tenantId, fileGuides, startedAt, "FEATURE_DISABLED");
  }
  if (!tenantId) {
    return fallback(tenantId, fileGuides, startedAt, "TENANT_MISSING");
  }
  let database: SQLiteConnection | null;
  try {
    database = await (
      options.dependencies?.openDatabase ?? openFactuDarwinDatabase
    )();
  } catch {
    return fallback(tenantId, fileGuides, startedAt, "SQLITE_OPEN_FAILED");
  }
  if (!database) {
    return fallback(tenantId, fileGuides, startedAt, "SQLITE_OPEN_FAILED");
  }
  const descriptor = await (
    options.dependencies?.readDescriptor ?? readMainSnapshotFastDescriptor
  )();
  if (!descriptor || descriptor.companyId !== tenantId) {
    return fallback(tenantId, fileGuides, startedAt, "TENANT_MISMATCH");
  }
  const metadata = await new AppMetadataRepository({
    database, tenantId,
  }).read();
  if (
    !metadata || metadata.tenantId !== tenantId ||
    metadata.schemaVersion !== SQLITE_SCHEMA_VERSION
  ) return fallback(tenantId, fileGuides, startedAt, "SCHEMA_NOT_READY");
  const receipt = await new CatalogValidationReceiptRepository({
    database, tenantId,
  }).read("remission_guides");
  if (!receipt) {
    return fallback(tenantId, fileGuides, startedAt, "RECEIPT_MISSING");
  }
  if (receipt.status === "dirty") {
    return fallback(tenantId, fileGuides, startedAt, "MIRROR_DIRTY");
  }
  if (
    receipt.status !== "validated" ||
    receipt.schemaVersion !== SQLITE_SCHEMA_VERSION
  ) return fallback(
    tenantId, fileGuides, startedAt, "RECEIPT_NOT_VALIDATED",
  );
  if (receipt.snapshotGeneration !== descriptor.snapshotGeneration) {
    return fallback(
      tenantId, fileGuides, startedAt, "SNAPSHOT_GENERATION_MISMATCH",
    );
  }
  if (receipt.sourceHash !== descriptor.catalogHashes.guides) {
    return fallback(
      tenantId, fileGuides, startedAt, "SOURCE_HASH_MISMATCH",
    );
  }
  if (receipt.rowCount !== fileGuides.length) {
    markDirty(database, tenantId, "ROW_COUNT_MISMATCH");
    return fallback(
      tenantId, fileGuides, startedAt, "ROW_COUNT_MISMATCH", receipt.rowCount,
    );
  }
  let sqliteGuides: RemissionGuide[];
  try {
    const repository = options.dependencies?.createRepository?.(
      database, tenantId,
    ) ?? new RemissionGuidesRepository({ database, tenantId });
    sqliteGuides = await repository.list();
  } catch {
    return fallback(tenantId, fileGuides, startedAt, "SQLITE_READ_FAILED");
  }
  if (!sameContent(fileGuides, sqliteGuides)) {
    markDirty(database, tenantId, "CONTENT_MISMATCH");
    return fallback(
      tenantId, fileGuides, startedAt, "CONTENT_MISMATCH", sqliteGuides.length,
    );
  }
  // eslint-disable-next-line no-console
  console.info(JSON.stringify({
    event: "sqlite_remission_guides_read",
    tenantId,
    generation: descriptor.snapshotGeneration,
    rowCount: sqliteGuides.length,
    durationMs: Date.now() - startedAt,
  }));
  return {
    source: "sqlite",
    guides: sqliteGuides,
    diagnostic: {
      reason: null, tenantId, fileCount: fileGuides.length,
      sqliteCount: sqliteGuides.length, durationMs: Date.now() - startedAt,
    },
  };
}
