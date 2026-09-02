import React from "react";
import { StyleSheet, Text } from "react-native";
import { useAppTheme } from "../theme/AppTheme";

type ConnectionResultTextProps = {
  value: string;
};

export function ConnectionResultText({ value }: ConnectionResultTextProps) {
  const { theme } = useAppTheme();
  if (!value) return null;
  return <Text selectable style={[styles.xml, { color: theme.colors.text, backgroundColor: theme.colors.surfaceMuted }]}>{value}</Text>;
}

const styles = StyleSheet.create({
  xml: {
    fontFamily: "monospace",
    color: "#1f2937",
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    padding: 10,
    fontSize: 12,
    lineHeight: 18
  }
});
