import type { AppTab } from "../utils/appAccess";
import type { OnboardingCoachMarkId, OnboardingStepState } from "./onboardingTypes";

export function navigationForOnboardingStep(step: OnboardingStepState): { tab: AppTab; coachMark?: OnboardingCoachMarkId } | null {
  if (!step.actionable || !step.route) return null;
  const coachMark = step.id === "product" ? "product-create" : step.id === "first-sale" ? "sale-create" : undefined;
  return { tab: step.route, coachMark };
}

