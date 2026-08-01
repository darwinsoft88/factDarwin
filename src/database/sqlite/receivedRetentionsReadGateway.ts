import type { ReceivedRetention } from "../../types";
import { readMainSnapshotFastDescriptor } from "../mainSnapshotStorage";
import { AppMetadataRepository } from "./appMetadataRepository";
import { CatalogValidationReceiptRepository } from
  "./CatalogValidationReceiptRepository";
import { openFactuDarwinDatabase } from "./client";
import {
  canonicalReceivedRetention,
} from "./receivedRetentionRecord";
import { ReceivedRetentionsRepository } from
  "./ReceivedRetentionsRepository";
import { sqliteReceivedRetentionsReadsEnabled } from
  "./receivedRetentionsReadFeature";
import { SQLITE_SCHEMA_VERSION } from "./schema";
import type { SQLiteConnection } from "./types";

export type ReceivedRetentionsFallbackReason =
  | "FEATURE_DISABLED"
  | "WEB_USES_FILE"
  | "TENANT_MISSING"
  | "TENANT_MISMATCH"
  | "SCHEMA_NOT_READY"
  | "RECEIPT_MISSING"
  | "RECEIPT_NOT_VALIDATED"
  | "MIRROR_DIRTY"
  | "SNAPSHOT_GENERATION_MISMATCH"
  | "SOURCE_HASH_MISMATCH"
  | "ROW_COUNT_MISMATCH"
  | "CONTENT_MISMATCH"
  | "SQLITE_OPEN_FAILED"
  | "SQLITE_READ_FAILED";

export interface ControlledReceivedRetentionsRead {
  source: "file" | "sqlite";
  retentions: ReceivedRetention[];
  diagnostic: {
    reason: ReceivedRetentionsFallbackReason | null;
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
  ) => Pick<ReceivedRetentionsRepository, "list">;
}

function fallback(
  tenantId: string,
  retentions: ReceivedRetention[],
  startedAt: number,
  reason: ReceivedRetentionsFallbackReason,
  sqliteCount = 0,
): ControlledReceivedRetentionsRead {
  // eslint-disable-next-line no-console
  console.info(JSON.stringify({
    event: "sqlite_received_retentions_fallback",
    tenantId,
    reason,
    fileCount: retentions.length,
    sqliteCount,
  }));
  return {
    source: "file",
    retentions,
    diagnostic: {
      reason,
      tenantId,
      fileCount: retentions.length,
      sqliteCount,
      durationMs: Date.now() - startedAt,
    },
  };
}

function sameContent(
  file: ReceivedRetention[],
  sqlite: ReceivedRetention[],
): boolean {
  return file.length === sqlite.length && file.every((item, index) =>
    JSON.stringify(canonicalReceivedRetention(item)) ===
      JSON.stringify(canonicalReceivedRetention(sqlite[index]!))
  );
}

function markDirty(
  database: SQLiteConnection,
  tenantId: string,
  reason: string,
): void {
  void new CatalogValidationReceiptRepository({
    database,
    tenantId,
  }).markDirty("received_retentions", reason, reason)
    .catch(() => undefined);
}

export async function readReceivedRetentionsControlled(
  tenantValue: string,
  fileRetentions: ReceivedRetention[],
  options: {
    enabled?: boolean;
    dependencies?: Dependencies;
  } = {},
): Promise<ControlledReceivedRetentionsRead> {
  const startedAt = Date.now();
  const tenantId = tenantValue.trim();
  const enabled = options.enabled ??
    sqliteReceivedRetentionsReadsEnabled();
  const platform = options.dependencies?.platform ??
    (await import("react-native")).Platform.OS;
  if (platform !== "android" && platform !== "ios") {
    return fallback(tenantId, fileRetentions, startedAt, "WEB_USES_FILE");
  }
  if (!enabled) {
    return fallback(tenantId, fileRetentions, startedAt, "FEATURE_DISABLED");
  }
  if (!tenantId) {
    return fallback(tenantId, fileRetentions, startedAt, "TENANT_MISSING");
  }
  let database: SQLiteConnection | null;
  try {
    database = await (
      options.dependencies?.openDatabase ?? openFactuDarwinDatabase
    )();
  } catch {
    return fallback(
      tenantId, fileRetentions, startedAt, "SQLITE_OPEN_FAILED",
    );
  }
  if (!database) {
    return fallback(
      tenantId, fileRetentions, startedAt, "SQLITE_OPEN_FAILED",
    );
  }
  const descriptor = await (
    options.dependencies?.readDescriptor ?? readMainSnapshotFastDescriptor
  )();
  if (!descriptor || descriptor.companyId !== tenantId) {
    return fallback(tenantId, fileRetentions, startedAt, "TENANT_MISMATCH");
  }
  const metadata = await new AppMetadataRepository({
    database,
    tenantId,
  }).read();
  if (
    !metadata ||
    metadata.tenantId !== tenantId ||
    metadata.schemaVersion !== SQLITE_SCHEMA_VERSION
  ) {
    return fallback(tenantId, fileRetentions, startedAt, "SCHEMA_NOT_READY");
  }
  const receipt = await new CatalogValidationReceiptRepository({
    database,
    tenantId,
  }).read("received_retentions");
  if (!receipt) {
    return fallback(tenantId, fileRetentions, startedAt, "RECEIPT_MISSING");
  }
  if (receipt.status === "dirty") {
    return fallback(tenantId, fileRetentions, startedAt, "MIRROR_DIRTY");
  }
  if (receipt.status !== "validated") {
    return fallback(
      tenantId, fileRetentions, startedAt, "RECEIPT_NOT_VALIDATED",
    );
  }
  if (receipt.schemaVersion !== SQLITE_SCHEMA_VERSION) {
    return fallback(tenantId, fileRetentions, startedAt, "SCHEMA_NOT_READY");
  }
  if (receipt.snapshotGeneration !== descriptor.snapshotGeneration) {
    return fallback(
      tenantId, fileRetentions, startedAt,
      "SNAPSHOT_GENERATION_MISMATCH",
    );
  }
  if (
    receipt.sourceHash !== descriptor.catalogHashes.receivedRetentions
  ) {
    return fallback(
      tenantId, fileRetentions, startedAt, "SOURCE_HASH_MISMATCH",
    );
  }
  if (receipt.rowCount !== fileRetentions.length) {
    markDirty(database, tenantId, "ROW_COUNT_MISMATCH");
    return fallback(
      tenantId, fileRetentions, startedAt, "ROW_COUNT_MISMATCH",
      receipt.rowCount,
    );
  }
  let sqliteRetentions: ReceivedRetention[];
  try {
    const repository = options.dependencies?.createRepository?.(
      database,
      tenantId,
    ) ?? new ReceivedRetentionsRepository({ database, tenantId });
    sqliteRetentions = await repository.list();
  } catch {
    return fallback(
      tenantId, fileRetentions, startedAt, "SQLITE_READ_FAILED",
    );
  }
  if (!sameContent(fileRetentions, sqliteRetentions)) {
    markDirty(database, tenantId, "CONTENT_MISMATCH");
    return fallback(
      tenantId, fileRetentions, startedAt, "CONTENT_MISMATCH",
      sqliteRetentions.length,
    );
  }
  // eslint-disable-next-line no-console
  console.info(JSON.stringify({
    event: "sqlite_received_retentions_read",
    tenantId,
    generation: descriptor.snapshotGeneration,
    rowCount: sqliteRetentions.length,
    durationMs: Date.now() - startedAt,
  }));
  return {
    source: "sqlite",
    retentions: sqliteRetentions,
    diagnostic: {
      reason: null,
      tenantId,
      fileCount: fileRetentions.length,
      sqliteCount: sqliteRetentions.length,
      durationMs: Date.now() - startedAt,
    },
  };
}
