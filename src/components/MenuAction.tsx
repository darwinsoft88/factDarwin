import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

export function MenuAction({ icon, label, tone = "default", onPress }: { icon: string; label: string; tone?: "default" | "danger"; onPress: () => void }) {
  const danger = tone === "danger";
  return (
    <Pressable style={styles.menuAction} onPress={onPress}>
      <Text style={[styles.menuActionIcon, danger && styles.menuActionIconDanger]}>{icon}</Text>
      <Text style={[styles.menuActionText, danger && styles.menuActionTextDanger]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  menuAction: {
    minHeight: 40,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  menuActionIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    overflow: "hidden",
    color: "#0f766e",
    backgroundColor: "#ecfdf5",
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 22,
    textAlign: "center"
  },
  menuActionIconDanger: {
    color: "#b91c1c",
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
  }
});
