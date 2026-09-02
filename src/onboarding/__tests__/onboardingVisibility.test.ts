import { shouldHideCompletedOnboarding } from "../onboardingVisibility";
import type { OnboardingEvaluation, OnboardingExperience } from "../onboardingTypes";

const evaluation = (completedRequired: number, totalRequired = 4): OnboardingEvaluation => ({
  steps: [],
  completedRequired,
  totalRequired,
  canWork: true,
  hasPriorActivity: false,
  sri: { status: "pending", label: "Modo de prueba", detail: "", actionable: true }
});

const experience = (changes: Partial<OnboardingExperience> = {}): OnboardingExperience => ({
  version: 1,
  welcomeSeen: true,
  centerMinimized: false,
  completionAcknowledged: false,
  skippedOptionalSteps: [],
  seenCoachMarks: [],
  ...changes
});

describe("onboarding visibility", () => {
  it("mantiene visibles los primeros pasos mientras existan pendientes", () => {
    expect(shouldHideCompletedOnboarding(evaluation(3), experience({ centerMinimized: true }))).toBe(false);
  });

  it("oculta el centro completado cuando se minimiza o reconoce", () => {
    expect(shouldHideCompletedOnboarding(evaluation(4), experience({ centerMinimized: true }))).toBe(true);
    expect(shouldHideCompletedOnboarding(evaluation(4), experience({ completionAcknowledged: true }))).toBe(true);
  });

  it("permite mostrar el mensaje final antes de cerrarlo", () => {
    expect(shouldHideCompletedOnboarding(evaluation(4), experience())).toBe(false);
  });
});
