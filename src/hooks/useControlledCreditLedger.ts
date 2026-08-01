import { useEffect, useMemo, useRef, useState } from "react";
import {
  invalidateCreditLedgerReadContext,
  readCreditLedgerControlled,
  type ControlledCreditLedgerRead,
} from "../database/sqlite/creditLedgerReadGateway";
import { sqliteCreditLedgerReadsEnabled } from
  "../database/sqlite/creditLedgerReadFeature";
import { subscribeCreditLedgerMirrorUpdates } from
  "../database/sqlite/creditLedgerMirrorCoordinator";
import type {
  AppData,
  CreditAdjustment,
  CreditPayment,
  User,
} from "../types";

function tenantIdFor(data: AppData, user: User): string {
  return String(
    user.companyId ||
      data.users.find((candidate) => candidate.companyId)?.companyId ||
      "",
  ).trim();
}

export function useControlledCreditLedger(
  data: AppData,
  user: User,
): {
  creditPayments: CreditPayment[];
  creditAdjustments: CreditAdjustment[];
  source: "file" | "sqlite";
} {
  const [state, setState] = useState<{
    paymentBasis: CreditPayment[];
    adjustmentBasis: CreditAdjustment[];
    tenantId: string;
    result: ControlledCreditLedgerRead;
  } | null>(null);
  const [mirrorRevision, setMirrorRevision] = useState(0);
  const previousTenantRef = useRef("");
  const enabled = sqliteCreditLedgerReadsEnabled();
  const tenantId = tenantIdFor(data, user);
  const canonicalPayments = useMemo(
    () => data.creditPayments || [],
    [data.creditPayments],
  );
  const canonicalAdjustments = useMemo(
    () => data.creditAdjustments || [],
    [data.creditAdjustments],
  );

  useEffect(() => subscribeCreditLedgerMirrorUpdates((updatedTenantId) => {
    if (updatedTenantId === tenantId) {
      setMirrorRevision((value) => value + 1);
    }
  }), [tenantId]);

  useEffect(() => {
    const previousTenantId = previousTenantRef.current;
    if (previousTenantId && previousTenantId !== tenantId) {
      invalidateCreditLedgerReadContext(previousTenantId);
    }
    previousTenantRef.current = tenantId;
    setState(null);
    if (!enabled) return undefined;
    let mounted = true;
    const paymentBasis = canonicalPayments;
    const adjustmentBasis = canonicalAdjustments;
    void readCreditLedgerControlled(
      tenantId,
      paymentBasis,
      adjustmentBasis,
      data.sales,
      data.clients,
      {},
      { enabled: true },
    ).then((result) => {
      if (mounted) {
        setState({
          paymentBasis,
          adjustmentBasis,
          tenantId,
          result,
        });
      }
    });
    return () => {
      mounted = false;
    };
  }, [
    canonicalAdjustments,
    canonicalPayments,
    data.clients,
    data.sales,
    enabled,
    mirrorRevision,
    tenantId,
  ]);

  return useMemo(() => {
    const usesSQLite =
      state?.paymentBasis === canonicalPayments &&
      state.adjustmentBasis === canonicalAdjustments &&
      state.tenantId === tenantId &&
      state.result.source === "sqlite";
    return {
      creditPayments: usesSQLite
        ? state.result.payments
        : canonicalPayments,
      creditAdjustments: usesSQLite
        ? state.result.adjustments
        : canonicalAdjustments,
      source: usesSQLite ? "sqlite" : "file",
    };
  }, [canonicalAdjustments, canonicalPayments, state, tenantId]);
}
