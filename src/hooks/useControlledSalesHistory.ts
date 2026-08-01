import { useEffect, useMemo, useState } from "react";
import {
  loadSaleDetailControlled,
  loadSaleXmlControlled,
  readSalesControlled,
  type ControlledSalesRead,
} from "../database/sqlite/salesReadGateway";
import { sqliteSalesReadsEnabled } from
  "../database/sqlite/salesReadFeature";
import { subscribeSalesMirrorUpdates } from
  "../database/sqlite/salesMirrorCoordinator";
import type { AppData, Sale, User } from "../types";

function tenantIdFor(data: AppData, session: User | null): string {
  return String(
    session?.companyId ||
      data.users.find((user) => user.companyId)?.companyId ||
      "",
  ).trim();
}

export interface ControlledSalesHistory {
  sales: Sale[];
  source: "file" | "sqlite";
  loadDetail: (saleId: string) => Promise<Sale | null>;
  loadXml: (saleId: string) => Promise<Pick<
    Sale, "signedXml" | "authorizedXml"
  > | null>;
}

export function useControlledSalesHistory(
  active: boolean,
  data: AppData,
  session: User | null,
): ControlledSalesHistory {
  const [state, setState] = useState<{
    basis: Sale[];
    result: ControlledSalesRead;
  } | null>(null);
  const [mirrorRevision, setMirrorRevision] = useState(0);
  const enabled = sqliteSalesReadsEnabled();
  const tenantId = tenantIdFor(data, session);

  useEffect(() => subscribeSalesMirrorUpdates((updatedTenantId) => {
    if (updatedTenantId === tenantId) {
      setMirrorRevision((value) => value + 1);
    }
  }), [tenantId]);

  useEffect(() => {
    setState(null);
    if (!active || !enabled) return undefined;
    let mounted = true;
    const basis = data.sales;
    void readSalesControlled(tenantId, basis, { enabled: true }).then(
      (readResult) => {
        if (mounted) setState({ basis, result: readResult });
      },
    );
    return () => {
      mounted = false;
    };
  }, [active, data.sales, enabled, mirrorRevision, tenantId]);

  return useMemo(() => {
    const usesSQLite =
      state?.basis === data.sales && state.result.source === "sqlite";
    return {
      sales: usesSQLite ? state.result.sales : data.sales,
      source: usesSQLite ? "sqlite" : "file",
      loadDetail: async (saleId: string) => {
        const canonical = data.sales.find((sale) => sale.id === saleId);
        if (!canonical) return null;
        return usesSQLite
          ? loadSaleDetailControlled(tenantId, saleId, canonical)
          : canonical;
      },
      loadXml: async (saleId: string) => {
        const canonical = data.sales.find((sale) => sale.id === saleId);
        if (!canonical) return null;
        return usesSQLite
          ? loadSaleXmlControlled(tenantId, saleId, canonical)
          : canonical;
      },
    };
  }, [data.sales, state, tenantId]);
}
