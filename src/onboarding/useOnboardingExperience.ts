import { useCallback, useEffect, useMemo, useState } from "react";
import type { OnboardingCoachMarkId, OnboardingExperience, OnboardingStepId } from "./onboardingTypes";
import { defaultOnboardingExperience, loadOnboardingExperience, saveOnboardingExperience } from "./onboardingProgressStorage";

export function useOnboardingExperience(userId: string, companyId: string) {
  const [experience, setExperience] = useState<OnboardingExperience>(defaultOnboardingExperience);
  const [loadedScope, setLoadedScope] = useState("");
  const scope = useMemo(() => userId && companyId ? `${userId}:${companyId}` : "", [companyId, userId]);

  useEffect(() => {
    let active = true;
    setLoadedScope("");
    setExperience(defaultOnboardingExperience());
    if (!scope) return () => { active = false; };
    void loadOnboardingExperience(userId, companyId).then((loaded) => {
      if (!active) return;
      setExperience(loaded);
      setLoadedScope(scope);
    });
    return () => { active = false; };
  }, [companyId, scope, userId]);

  const update = useCallback((mutation: (current: OnboardingExperience) => OnboardingExperience) => {
    if (!scope || loadedScope !== scope) return;
    setExperience((current) => {
      const next = mutation(current);
      void saveOnboardingExperience(userId, companyId, next).catch(() => undefined);
      return next;
    });
  }, [companyId, loadedScope, scope, userId]);

  return {
    experience,
    ready: Boolean(scope && loadedScope === scope),
    markWelcomeSeen: () => update((current) => ({ ...current, welcomeSeen: true })),
    setCenterMinimized: (centerMinimized: boolean) => update((current) => ({ ...current, centerMinimized })),
    acknowledgeCompletion: () => update((current) => ({ ...current, completionAcknowledged: true, centerMinimized: true })),
    skipOptionalStep: (stepId: OnboardingStepId) => update((current) => ({ ...current, skippedOptionalSteps: Array.from(new Set([...current.skippedOptionalSteps, stepId])) })),
    markCoachSeen: (coachId: OnboardingCoachMarkId) => update((current) => ({ ...current, seenCoachMarks: Array.from(new Set([...current.seenCoachMarks, coachId])) }))
  };
}

