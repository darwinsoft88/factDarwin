const store = new Map<string, string>();

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async (key: string) => store.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { store.set(key, value); })
}));

import { defaultOnboardingExperience, loadOnboardingExperience, onboardingStorageKey, saveOnboardingExperience } from "../onboardingProgressStorage";

describe("onboarding experience storage", () => {
  beforeEach(() => store.clear());

  it("aísla empresa A/B y usuario A/B", () => {
    expect(onboardingStorageKey("user-a", "company-a")).not.toBe(onboardingStorageKey("user-a", "company-b"));
    expect(onboardingStorageKey("user-a", "company-a")).not.toBe(onboardingStorageKey("user-b", "company-a"));
  });

  it("persiste solo experiencia y coach marks una vez", async () => {
    const experience = { ...defaultOnboardingExperience(), welcomeSeen: true, seenCoachMarks: ["product-create" as const], skippedOptionalSteps: ["own-client" as const] };
    await saveOnboardingExperience("user-a", "company-a", experience);
    expect(await loadOnboardingExperience("user-a", "company-a")).toEqual(experience);
    expect(await loadOnboardingExperience("user-a", "company-b")).toEqual(defaultOnboardingExperience());
    expect([...store.values()][0]).not.toContain("hasProduct");
  });

  it("un cambio de versión o datos corruptos inicia experiencia segura", async () => {
    store.set(onboardingStorageKey("user-a", "company-a")!, JSON.stringify({ version: 999, welcomeSeen: true }));
    expect(await loadOnboardingExperience("user-a", "company-a")).toEqual(defaultOnboardingExperience());
    store.set(onboardingStorageKey("user-a", "company-a")!, "{mal");
    expect(await loadOnboardingExperience("user-a", "company-a")).toEqual(defaultOnboardingExperience());
  });

  it("rechaza scopes inválidos sin escribir", async () => {
    await saveOnboardingExperience("", "company-a", defaultOnboardingExperience());
    expect(store.size).toBe(0);
  });
});

