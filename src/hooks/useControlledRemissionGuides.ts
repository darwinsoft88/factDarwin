import { useEffect, useMemo, useState } from "react";
import { readRemissionGuidesControlled } from
  "../database/sqlite/remissionGuidesReadGateway";
import { sqliteRemissionGuideReadsEnabled } from
  "../database/sqlite/remissionGuidesReadFeature";
import { subscribeRemissionGuidesMirrorUpdates } from
  "../database/sqlite/remissionGuidesMirrorCoordinator";
import type { AppData, RemissionGuide, User } from "../types";

export function useControlledRemissionGuides(
  data: AppData,
  user: User,
): RemissionGuide[] {
  const canonical = useMemo(() => data.guides || [], [data.guides]);
  const tenantId = String(
    user.companyId ||
      data.users.find((candidate) => candidate.companyId)?.companyId ||
      "",
  ).trim();
  const enabled = sqliteRemissionGuideReadsEnabled();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    basis: RemissionGuide[];
    tenantId: string;
    guides: RemissionGuide[];
    source: "file" | "sqlite";
  } | null>(null);

  useEffect(() => subscribeRemissionGuidesMirrorUpdates((updated) => {
    if (updated === tenantId) setRevision((value) => value + 1);
  }), [tenantId]);

  useEffect(() => {
    setState(null);
    if (!enabled) return undefined;
    let mounted = true;
    const basis = canonical;
    void readRemissionGuidesControlled(tenantId, basis, {
      enabled: true,
    }).then((result) => {
      if (mounted) {
        setState({
          basis, tenantId, guides: result.guides, source: result.source,
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
      ? state.guides
      : canonical,
  [canonical, state, tenantId]);
}
