import { compareAppVersions, evaluateAppUpdate, normalizeUpdatePolicy } from "../appUpdate";

const policy = {
  enabled: true,
  latestVersion: "1.0.18",
  minimumVersion: "1.0.16",
  message: "Mejoras disponibles.",
  storeUrl: "https://play.google.com/store/apps/details?id=com.facturasri.mobile"
};

test("compara versiones numericamente y no como texto", () => {
  expect(compareAppVersions("1.0.9", "1.0.10")).toBe(-1);
  expect(compareAppVersions("1.2", "1.2.0")).toBe(0);
  expect(compareAppVersions("2.0.0", "1.99.99")).toBe(1);
});

test("distingue actualización opcional y obligatoria", () => {
  expect(evaluateAppUpdate("1.0.17", policy)).toEqual({ available: true, required: false });
  expect(evaluateAppUpdate("1.0.15", policy)).toEqual({ available: true, required: true });
  expect(evaluateAppUpdate("1.0.18", policy)).toEqual({ available: false, required: false });
});

test("rechaza políticas incompletas o enlaces inseguros", () => {
  expect(normalizeUpdatePolicy({ ...policy, storeUrl: "http://play.google.com" })).toBeNull();
  expect(normalizeUpdatePolicy(policy)).toEqual(policy);
});
