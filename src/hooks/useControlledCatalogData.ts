import { useEffect, useMemo, useState } from "react";
import {
  readCatalogsControlled,
  type CatalogParityDiagnostic,
  type ControlledCatalogRead,
} from "../database/sqlite/catalogReadGateway";
import { sqliteCatalogReadsEnabled } from "../database/sqlite/catalogReadFeature";
import type { AppData, Client, Product, User } from "../types";

interface CatalogReadState {
  basisClients: Client[];
  basisProducts: Product[];
  result: ControlledCatalogRead;
}

function tenantIdFor(data: AppData, session: User | null): string {
  return String(
    session?.companyId ||
      data.users.find((user) => user.companyId)?.companyId ||
      "",
  ).trim();
}

export function useControlledCatalogData(
  ready: boolean,
  data: AppData,
  session: User | null,
  diagnostic: CatalogParityDiagnostic | null,
): AppData {
  const [readState, setReadState] = useState<CatalogReadState | null>(null);
  const enabled = sqliteCatalogReadsEnabled();
  const tenantId = tenantIdFor(data, session);

  useEffect(() => {
    if (!ready || !enabled || !diagnostic?.ready) {
      setReadState(null);
      return undefined;
    }
    let active = true;
    const basisClients = data.clients;
    const basisProducts = data.products;

    void readCatalogsControlled(
      tenantId,
      basisClients,
      basisProducts,
      { enabled: true },
    ).then((result) => {
      if (!active) return;
      setReadState({ basisClients, basisProducts, result });
    });

    return () => {
      active = false;
    };
  }, [
    data.clients,
    data.products,
    diagnostic,
    enabled,
    ready,
    tenantId,
  ]);

  return useMemo(() => {
    if (
      readState?.result.source !== "sqlite" ||
      readState.basisClients !== data.clients ||
      readState.basisProducts !== data.products
    ) {
      return data;
    }
    return {
      ...data,
      clients: readState.result.clients,
      products: readState.result.products,
    };
  }, [data, readState]);
}
