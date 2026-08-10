import type { AppData, Environment } from "../types";

export type CanonicalSriEnvironment = {
  environment: Environment;
  environmentVersion: number;
};

export function applyCanonicalSriEnvironment(data: AppData, canonical: CanonicalSriEnvironment): AppData {
  return { ...data, issuer: { ...data.issuer, environment: canonical.environment, environmentVersion: canonical.environmentVersion } };
}
