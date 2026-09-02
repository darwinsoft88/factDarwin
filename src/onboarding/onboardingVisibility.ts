import type { OnboardingEvaluation, OnboardingExperience } from "./onboardingTypes";

export function shouldHideCompletedOnboarding(
  evaluation: OnboardingEvaluation,
  experience: OnboardingExperience
): boolean {
  const allRequiredComplete = evaluation.completedRequired === evaluation.totalRequired;
  return allRequiredComplete && (experience.completionAcknowledged || experience.centerMinimized);
}
