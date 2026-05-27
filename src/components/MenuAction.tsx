import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export function MenuAction({ icon, label, tone = "default", onPress }: { icon: React.ReactNode; label: string; tone?: "default" | "danger"; onPress: () => void }) {
  const danger = tone === "danger";
  return (
    <Pressable style={styles.menuAction} onPress={onPress}>
      <View style={[styles.menuActionIcon, danger && styles.menuActionIconDanger]}>{icon}</View>
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
    width: 24,
    height: 24,
    borderRadius: 8,
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
  }
});
