import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { OnboardingEvaluation, OnboardingExperience, OnboardingStepState } from "../onboarding/onboardingTypes";
import { shouldHideCompletedOnboarding } from "../onboarding/onboardingVisibility";
import { useAppTheme } from "../theme/AppTheme";

export function GettingStartedCard({ evaluation, experience, onOpenStep, onMinimize, onExpand, onSkipOptional, onAcknowledge }: {
  evaluation: OnboardingEvaluation;
  experience: OnboardingExperience;
  onOpenStep: (step: OnboardingStepState) => void;
  onMinimize: () => void;
  onExpand: () => void;
  onSkipOptional: (step: OnboardingStepState) => void;
  onAcknowledge: () => void;
}) {
  const { theme } = useAppTheme();
  const allRequiredComplete = evaluation.completedRequired === evaluation.totalRequired;
  if (shouldHideCompletedOnboarding(evaluation, experience)) {
    return null;
  }
  if (experience.centerMinimized) {
    return (
      <Pressable onPress={onExpand} style={[styles.compact, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}> 
        <MaterialCommunityIcons name="rocket-launch-outline" size={19} color={theme.colors.primary} />
        <Text style={[styles.compactText, { color: theme.colors.text }]}>Primeros pasos</Text>
        <Text style={[styles.progress, { color: theme.colors.primary }]}>{evaluation.completedRequired}/{evaluation.totalRequired}</Text>
        <MaterialCommunityIcons name="chevron-down" size={20} color={theme.colors.textMuted} />
      </Pressable>
    );
  }
  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}> 
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: theme.colors.text }]}>Primeros pasos</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{evaluation.completedRequired} de {evaluation.totalRequired} esenciales completados</Text>
        </View>
        <Pressable accessibilityLabel="Minimizar primeros pasos" onPress={onMinimize} style={styles.iconButton}><MaterialCommunityIcons name="chevron-up" size={22} color={theme.colors.textMuted} /></Pressable>
      </View>
      <View style={[styles.track, { backgroundColor: theme.colors.surfaceMuted }]}><View style={[styles.fill, { backgroundColor: theme.colors.primary, width: `${Math.round((evaluation.completedRequired / evaluation.totalRequired) * 100)}%` }]} /></View>
      {evaluation.steps.map((step) => {
        const skipped = step.optional && experience.skippedOptionalSteps.includes(step.id);
        return (
          <View key={step.id} style={styles.row}>
            <MaterialCommunityIcons name={step.completed ? "check-circle" : skipped ? "minus-circle-outline" : "circle-outline"} size={20} color={step.completed ? theme.colors.success : theme.colors.textMuted} />
            <Pressable disabled={step.completed || !step.actionable} onPress={() => onOpenStep(step)} style={styles.stepText}>
              <Text style={[styles.stepTitle, { color: theme.colors.text }, !step.completed && step.actionable && { color: theme.colors.primary }]}>{step.title}{step.optional ? " · Opcional" : ""}</Text>
              {!step.actionable && !step.completed ? <Text style={[styles.reason, { color: theme.colors.textMuted }]}>{step.unavailableReason}</Text> : null}
            </Pressable>
            {step.optional && !step.completed && !skipped ? <Pressable onPress={() => onSkipOptional(step)}><Text style={[styles.skip, { color: theme.colors.textMuted }]}>Omitir</Text></Pressable> : null}
          </View>
        );
      })}
      {allRequiredComplete && !experience.completionAcknowledged ? (
        <Pressable onPress={onAcknowledge} style={[styles.successButton, { backgroundColor: theme.colors.successSoft }]}><Text style={[styles.successText, { color: theme.colors.success }]}>Ya puedes trabajar con FactuDarwin · Entendido</Text></Pressable>
      ) : null}
      {allRequiredComplete ? <View style={[styles.sriBox, { backgroundColor: theme.colors.surfaceMuted }]}> 
        <View style={styles.sriText}><Text style={[styles.sriTitle, { color: theme.colors.text }]}>Facturación electrónica</Text><Text style={[styles.sriDetail, { color: theme.colors.textMuted }]}>{evaluation.sri.label} · {evaluation.sri.detail}</Text></View>
        {evaluation.sri.actionable ? <Pressable onPress={() => onOpenStep({ id: "business", title: "Preparar facturación", description: "", completed: false, optional: false, actionable: true, route: "sri" })}><Text style={[styles.prepare, { color: theme.colors.primary }]}>Preparar</Text></Pressable> : null}
      </View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, gap: 10, marginBottom: 14, padding: 14 },
  compact: { alignItems: "center", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 9, marginBottom: 14, padding: 12 },
  compactText: { flex: 1, fontSize: 13, fontWeight: "900" },
  progress: { fontSize: 12, fontWeight: "900" },
  header: { alignItems: "center", flexDirection: "row" },
  headerText: { flex: 1 },
  title: { fontSize: 16, fontWeight: "900" },
  subtitle: { fontSize: 12, marginTop: 2 },
  iconButton: { padding: 6 },
  track: { borderRadius: 8, height: 6, overflow: "hidden" },
  fill: { borderRadius: 8, height: "100%" },
  row: { alignItems: "center", flexDirection: "row", gap: 9, minHeight: 34 },
  stepText: { flex: 1 },
  stepTitle: { fontSize: 13, fontWeight: "800" },
  reason: { fontSize: 11, marginTop: 2 },
  skip: { fontSize: 11, fontWeight: "800", padding: 5 },
  successButton: { borderRadius: 10, padding: 10 },
  successText: { fontSize: 12, fontWeight: "900", textAlign: "center" },
  sriBox: { alignItems: "center", borderRadius: 12, flexDirection: "row", gap: 10, marginTop: 2, padding: 11 },
  sriText: { flex: 1 },
  sriTitle: { fontSize: 13, fontWeight: "900" },
  sriDetail: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  prepare: { fontSize: 12, fontWeight: "900", padding: 6 }
});
