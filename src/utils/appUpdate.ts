export type AppUpdatePolicy = {
  enabled: boolean;
  latestVersion: string;
  minimumVersion: string;
  message: string;
  storeUrl: string;
};

export type AppUpdateDecision = {
  available: boolean;
  required: boolean;
};

function versionParts(value: string): number[] {
  return String(value || "")
    .trim()
    .replace(/^v/i, "")
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) && part >= 0 ? part : 0));
}

export function compareAppVersions(left: string, right: string): number {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

export function evaluateAppUpdate(currentVersion: string, policy: AppUpdatePolicy): AppUpdateDecision {
  if (!policy.enabled || !policy.latestVersion) return { available: false, required: false };
  return {
    available: compareAppVersions(currentVersion, policy.latestVersion) < 0,
    required: Boolean(policy.minimumVersion) && compareAppVersions(currentVersion, policy.minimumVersion) < 0
  };
}

export function normalizeUpdatePolicy(value: unknown): AppUpdatePolicy | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<AppUpdatePolicy>;
  const latestVersion = String(source.latestVersion || "").trim();
  const storeUrl = String(source.storeUrl || "").trim();
  if (!latestVersion || !/^https:\/\//i.test(storeUrl)) return null;
  return {
    enabled: source.enabled === true,
    latestVersion,
    minimumVersion: String(source.minimumVersion || "").trim(),
    message: String(source.message || "").trim(),
    storeUrl
  };
}
