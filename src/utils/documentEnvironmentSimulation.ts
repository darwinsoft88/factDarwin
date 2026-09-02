import type { AppData, Environment } from "../types";

/** Proyección efímera de solo lectura; nunca debe entregarse a persistencia o sincronización. */
export function dataForDocumentEnvironmentView(data: AppData, environment: Environment | null): AppData {
  if (environment === null || environment === data.issuer.environment) return data;
  return { ...data, issuer: { ...data.issuer, environment } };
}

export function localDocumentSimulationAvailable(isDevelopment: boolean): boolean {
  return isDevelopment;
}
