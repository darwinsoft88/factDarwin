import type { ProductionChecklistValue } from "../components/ProductionChecklist";
import { getCompanySriEnvironment, updateCompanySriEnvironment } from "../services/backend";
import type { AppData, Environment } from "../types";
import { applyCanonicalSriEnvironment, type CanonicalSriEnvironment } from "./sriEnvironmentAuthority";

export type RealBillingRequirement = { id: string; label: string; ok: boolean };

export function realBillingRequirements(checklist: ProductionChecklistValue): RealBillingRequirement[] {
  return [
    ...checklist.baseChecks.map((item, index) => ({ id: `base-${index}`, label: item.label, ok: item.ok })),
    ...checklist.connectionChecks.map((item, index) => ({ id: `connection-${index}`, label: item.label, ok: item.ok })),
    ...checklist.productionChecks.filter((item) => item.label !== "Ambiente app en produccion").map((item, index) => ({ id: `production-${index}`, label: item.label, ok: item.ok }))
  ];
}

export function canActivateRealBilling(checklist: ProductionChecklistValue): boolean {
  const requirements = realBillingRequirements(checklist);
  return requirements.length > 0 && requirements.every((item) => item.ok);
}

export async function changeSriEnvironmentAuthoritatively({
  data,
  target,
  backendToken,
  commit,
  readCanonical = getCompanySriEnvironment,
  updateCanonical = updateCompanySriEnvironment
}: {
  data: AppData;
  target: Environment;
  backendToken: string;
  commit: (next: AppData, canonical: CanonicalSriEnvironment) => Promise<void>;
  readCanonical?: typeof getCompanySriEnvironment;
  updateCanonical?: typeof updateCompanySriEnvironment;
}): Promise<CanonicalSriEnvironment> {
  const current = await readCanonical(data.backendUrl, backendToken);
  const canonical = current.environment === target
    ? current
    : await updateCanonical(data.backendUrl, target, current.environmentVersion, backendToken);
  const next = applyCanonicalSriEnvironment(data, canonical);
  await commit(next, canonical);
  return canonical;
}

