import React from "react";
import { StyleSheet, Text, View } from "react-native";

export function OnboardingStep({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <View style={styles.onboardingStep}>
      <Text style={styles.onboardingStepNumber}>{number}</Text>
      <View style={styles.flex}>
        <Text style={styles.onboardingStepTitle}>{title}</Text>
        <Text style={styles.onboardingStepText}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    minWidth: 130
  },
  onboardingStep: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#f8fafc"
  },
  onboardingStepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: "hidden",
    color: "#ffffff",
    backgroundColor: "#0f766e",
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 24,
    textAlign: "center"
  },
  onboardingStepTitle: {
    color: "#1f2937",
    fontSize: 13,
    fontWeight: "900"
  },
  onboardingStepText: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700"
  }
});
