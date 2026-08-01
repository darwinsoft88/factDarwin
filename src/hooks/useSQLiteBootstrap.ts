import { useEffect, useMemo, useState } from "react";
import {
  closeFactuDarwinDatabase,
} from "../database/sqlite/client";
import { initializeSQLiteMetadata } from "../database/sqlite/bootstrap";
import {
  ensureCatalogMirrorsCurrent,
  subscribeCatalogMirrorUpdates,
} from "../database/sqlite/catalogMirrorCoordinator";
import {
  validateCatalogParity,
  type CatalogParityDiagnostic,
} from "../database/sqlite/catalogReadGateway";
import type { AppData, User } from "../types";
import {
  ensureSalesMirrorCurrent,
} from "../database/sqlite/salesMirrorCoordinator";
import {
  ensureInventoryMovementsMirrorCurrent,
} from "../database/sqlite/inventoryMovementsMirrorCoordinator";
import {
  ensureReceivedRetentionsMirrorCurrent,
} from "../database/sqlite/receivedRetentionsMirrorCoordinator";
import {
  ensureRemissionGuidesMirrorCurrent,
} from "../database/sqlite/remissionGuidesMirrorCoordinator";
import {
  ensurePendingSyncMirrorCurrent,
} from "../database/sqlite/pendingSyncMirrorCoordinator";
import {
  ensureCreditLedgerMirrorCurrent,
} from "../database/sqlite/creditLedgerMirrorCoordinator";

function resolveTenantId(data: AppData, session: User | null): string {
  return String(
    session?.companyId ||
      data.users.find((user) => user.companyId)?.companyId ||
      "",
  ).trim();
}

async function measureMirror(
  tenantId: string,
  mirror: string,
  operation: () => Promise<boolean>,
): Promise<boolean> {
  const startedAt = Date.now();
  try {
    const ready = await operation();
    // eslint-disable-next-line no-console
    console.info(JSON.stringify({
      event: "sqlite_mirror_stabilization",
      tenantId,
      mirror,
      ready,
      durationMs: Date.now() - startedAt,
    }));
    return ready;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.info(JSON.stringify({
      event: "sqlite_mirror_stabilization",
      tenantId,
      mirror,
      ready: false,
      durationMs: Date.now() - startedAt,
      errorName: error instanceof Error ? error.name : "UnknownError",
    }));
    return false;
  }
}

export function useSQLiteBootstrap(
  ready: boolean,
  data: AppData,
  session: User | null,
): CatalogParityDiagnostic | null {
  const [catalogDiagnostic, setCatalogDiagnostic] =
    useState<CatalogParityDiagnostic | null>(null);
  const [mirrorRevision, setMirrorRevision] = useState(0);
  const tenantId = useMemo(
    () => resolveTenantId(data, session),
    [data, session],
  );

  useEffect(() => {
    if (!ready) return undefined;
    let active = true;
    setCatalogDiagnostic(null);

    void (async () => {
      const metadata = await initializeSQLiteMetadata(tenantId);
      if (!active || metadata.status !== "ready") return;
      const catalogsReady = await measureMirror(
        tenantId,
        "clients_products",
        () => ensureCatalogMirrorsCurrent(tenantId),
      );
      if (!active || !catalogsReady) return;
      const diagnostic = await validateCatalogParity(tenantId);
      if (active) setCatalogDiagnostic(diagnostic);
      void measureMirror(
        tenantId, "sales", () => ensureSalesMirrorCurrent(tenantId),
      );
      void measureMirror(
        tenantId,
        "inventory_movements",
        () => ensureInventoryMovementsMirrorCurrent(tenantId),
      );
      void measureMirror(
        tenantId,
        "credit_ledger",
        () => ensureCreditLedgerMirrorCurrent(tenantId),
      );
      void measureMirror(
        tenantId,
        "received_retentions",
        () => ensureReceivedRetentionsMirrorCurrent(tenantId),
      );
      void measureMirror(
        tenantId,
        "remission_guides",
        () => ensureRemissionGuidesMirrorCurrent(tenantId),
      );
      void measureMirror(
        tenantId,
        "pending_sync_operations",
        () => ensurePendingSyncMirrorCurrent(tenantId),
      );
    })();

    return () => {
      active = false;
    };
  }, [mirrorRevision, ready, tenantId]);

  useEffect(
    () => subscribeCatalogMirrorUpdates((updatedTenantId) => {
      if (updatedTenantId === tenantId) {
        setMirrorRevision((current) => current + 1);
      }
    }),
    [tenantId],
  );

  useEffect(
    () => () => {
      void closeFactuDarwinDatabase().catch(() => undefined);
    },
    [],
  );

  return catalogDiagnostic;
}
