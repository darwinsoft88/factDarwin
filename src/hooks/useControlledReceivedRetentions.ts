import { useEffect, useMemo, useState } from "react";
import {
  readReceivedRetentionsControlled,
} from "../database/sqlite/receivedRetentionsReadGateway";
import {
  sqliteReceivedRetentionsReadsEnabled,
} from "../database/sqlite/receivedRetentionsReadFeature";
import {
  subscribeReceivedRetentionsMirrorUpdates,
} from "../database/sqlite/receivedRetentionsMirrorCoordinator";
import type { AppData, ReceivedRetention, User } from "../types";

export function useControlledReceivedRetentions(
  data: AppData,
  user: User,
): ReceivedRetention[] {
  const canonical = useMemo(
    () => data.receivedRetentions || [],
    [data.receivedRetentions],
  );
  const tenantId = String(
    user.companyId ||
      data.users.find((candidate) => candidate.companyId)?.companyId ||
      "",
  ).trim();
  const enabled = sqliteReceivedRetentionsReadsEnabled();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    basis: ReceivedRetention[];
    tenantId: string;
    retentions: ReceivedRetention[];
    source: "file" | "sqlite";
  } | null>(null);

  useEffect(() => subscribeReceivedRetentionsMirrorUpdates((updated) => {
    if (updated === tenantId) setRevision((value) => value + 1);
  }), [tenantId]);

  useEffect(() => {
    setState(null);
    if (!enabled) return undefined;
    let mounted = true;
    const basis = canonical;
    void readReceivedRetentionsControlled(tenantId, basis, {
      enabled: true,
    }).then((result) => {
      if (mounted) {
        setState({
          basis,
          tenantId,
          retentions: result.retentions,
          source: result.source,
        });
      }
    });
    return () => {
      mounted = false;
    };
  }, [canonical, enabled, revision, tenantId]);

  return useMemo(() =>
    state?.basis === canonical &&
    state.tenantId === tenantId &&
    state.source === "sqlite"
      ? state.retentions
      : canonical,
  [canonical, state, tenantId]);
}
