import type { AppTab } from "../utils/appAccess";

export const ONBOARDING_VERSION = 1;

export type OnboardingStepId = "business" | "product" | "first-sale" | "own-client";
export type OnboardingCoachMarkId = "product-create" | "sale-create" | "certificate-upload";

export type OnboardingStepState = {
  id: OnboardingStepId;
  title: string;
  description: string;
  completed: boolean;
  optional: boolean;
  actionable: boolean;
  route?: AppTab;
  unavailableReason?: string;
};

export type SriOnboardingState = {
  status: "pending" | "ready-tests" | "ready-production";
  label: string;
  detail: string;
  actionable: boolean;
};

export type OnboardingEvaluation = {
  steps: OnboardingStepState[];
  completedRequired: number;
  totalRequired: number;
  canWork: boolean;
  hasPriorActivity: boolean;
  sri: SriOnboardingState;
};

export type OnboardingExperience = {
  version: number;
  welcomeSeen: boolean;
  centerMinimized: boolean;
  completionAcknowledged: boolean;
  skippedOptionalSteps: OnboardingStepId[];
  seenCoachMarks: OnboardingCoachMarkId[];
};

