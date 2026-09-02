import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { useAppTheme } from "../theme/AppTheme";

export type AccentCardTone = "primary" | "success" | "warning" | "danger" | "info";

type ThemedAccentCardProps = {
  children: React.ReactNode;
  tone?: AccentCardTone;
  style?: StyleProp<ViewStyle>;
};

export function ThemedAccentCard({ children, tone = "primary", style }: ThemedAccentCardProps) {
  const { theme } = useAppTheme();
  const accentColor = theme.colors[tone];

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surfaceMuted,
          borderColor: theme.colors.border,
          borderLeftColor: accentColor,
          shadowColor: theme.colors.shadow
        },
        style
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 10,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1
  }
});
