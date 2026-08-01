import { useEffect, useMemo, useState } from "react";
import {
  readInventoryMovementsControlled,
  type ControlledInventoryMovementsRead,
} from "../database/sqlite/inventoryMovementsReadGateway";
import { sqliteInventoryMovementReadsEnabled } from
  "../database/sqlite/inventoryMovementsReadFeature";
import { subscribeInventoryMovementsMirrorUpdates } from
  "../database/sqlite/inventoryMovementsMirrorCoordinator";
import type { AppData, InventoryMovement, User } from "../types";

function tenantIdFor(data: AppData, user: User): string {
  return String(
    user.companyId ||
      data.users.find((candidate) => candidate.companyId)?.companyId ||
      "",
  ).trim();
}

export function useControlledInventoryMovements(
  data: AppData,
  user: User,
): {
  movements: InventoryMovement[];
  source: "file" | "sqlite";
} {
  const [state, setState] = useState<{
    basis: InventoryMovement[];
    tenantId: string;
    result: ControlledInventoryMovementsRead;
  } | null>(null);
  const [mirrorRevision, setMirrorRevision] = useState(0);
  const enabled = sqliteInventoryMovementReadsEnabled();
  const tenantId = tenantIdFor(data, user);
  const canonicalMovements = useMemo(
    () => data.inventoryMovements || [],
    [data.inventoryMovements],
  );

  useEffect(() => subscribeInventoryMovementsMirrorUpdates(
    (updatedTenantId) => {
      if (updatedTenantId === tenantId) {
        setMirrorRevision((value) => value + 1);
      }
    },
  ), [tenantId]);

  useEffect(() => {
    setState(null);
    if (!enabled) return undefined;
    let mounted = true;
    const basis = canonicalMovements;
    void readInventoryMovementsControlled(
      tenantId,
      basis,
      data.sales,
      data.products,
      {},
      { enabled: true },
    ).then((readResult) => {
      if (mounted) setState({ basis, tenantId, result: readResult });
    });
    return () => {
      mounted = false;
    };
  }, [
    canonicalMovements,
    data.products,
    data.sales,
    enabled,
    mirrorRevision,
    tenantId,
  ]);

  return useMemo(() => {
    const usesSQLite =
      state?.basis === canonicalMovements &&
      state.tenantId === tenantId &&
      state.result.source === "sqlite";
    return {
      movements: usesSQLite
        ? state.result.movements
        : canonicalMovements,
      source: usesSQLite ? "sqlite" : "file",
    };
  }, [canonicalMovements, state, tenantId]);
}
