import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../theme/AppTheme";

export function MenuAction({ icon, label, badge, selected = false, statusColor, tone = "default", onPress }: {
  icon: React.ReactNode;
  label: string;
  badge?: string;
  selected?: boolean;
  statusColor?: string;
  tone?: "default" | "danger";
  onPress: () => void;
}) {
  const { theme } = useAppTheme();
  const danger = tone === "danger";
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.menuAction, selected && [styles.menuActionSelected, { backgroundColor: theme.colors.primarySoft, borderLeftColor: theme.colors.primary }], danger && [styles.menuActionDanger, { backgroundColor: theme.colors.dangerSoft }], pressed && styles.menuActionPressed]}
      onPress={onPress}
    >
      <View style={[styles.menuActionIcon, { backgroundColor: theme.colors.primarySoft }, danger && [styles.menuActionIconDanger, { backgroundColor: theme.colors.dangerSoft }]]}>{icon}</View>
      <Text style={[styles.menuActionText, { color: theme.colors.text }, danger && [styles.menuActionTextDanger, { color: theme.colors.danger }]]}>{label}</Text>
      {statusColor ? <View style={[styles.statusDot, { backgroundColor: statusColor }]} /> : null}
      {badge ? <Text style={[styles.badge, { backgroundColor: theme.colors.border, color: theme.colors.textMuted }]}>{badge}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  menuAction: {
    minHeight: 44,
    borderRadius: 9,
    backgroundColor: "transparent",
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  menuActionDanger: {
    backgroundColor: "#fff7f7"
  },
  menuActionSelected: {
    backgroundColor: "#ecfdf5",
    borderLeftWidth: 4,
    borderLeftColor: "#0f766e"
  },
  menuActionPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.99 }]
  },
  menuActionIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center"
  },
  menuActionIconDanger: {
    backgroundColor: "#fee2e2"
  },
  menuActionText: {
    flex: 1,
    color: "#334155",
    fontSize: 13,
    fontWeight: "800"
  },
  menuActionTextDanger: {
    color: "#b91c1c"
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5
  },
  badge: {
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
    paddingHorizontal: 8,
    paddingVertical: 3,
    color: "#475569",
    fontSize: 10,
    fontWeight: "900"
  }
});
