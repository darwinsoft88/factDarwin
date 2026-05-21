import React from "react";
import { StyleSheet, Text } from "react-native";

type ConnectionResultTextProps = {
  value: string;
};

export function ConnectionResultText({ value }: ConnectionResultTextProps) {
  if (!value) return null;
  return <Text selectable style={styles.xml}>{value}</Text>;
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
