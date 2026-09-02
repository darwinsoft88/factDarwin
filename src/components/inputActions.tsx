import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text } from "react-native";
import { useAppTheme } from "../theme/AppTheme";

export function InlineInputButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { theme } = useAppTheme();
  return (
    <Pressable style={[styles.inlineInputButton, { backgroundColor: theme.colors.primary }]} onPress={onPress}>
      <Text style={[styles.inlineInputButtonText, { color: theme.colors.onPrimary }]}>{label}</Text>
    </Pressable>
  );
}

export function PasswordVisibilityButton({ visible, onPress }: { visible: boolean; onPress: () => void }) {
  const { theme } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={visible ? "Ocultar clave" : "Mostrar clave"}
      accessibilityState={{ selected: visible }}
      style={({ pressed }) => [
        styles.passwordVisibilityButton,
        { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border },
        visible && { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primary },
        pressed && styles.passwordVisibilityButtonPressed
      ]}
      onPress={onPress}
    >
      <MaterialCommunityIcons name={visible ? "eye-off-outline" : "eye-outline"} size={19} color={visible ? theme.colors.primary : theme.colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  inlineInputButton: {
    minWidth: 78,
    minHeight: 26,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    backgroundColor: "#0f766e"
  },
  inlineInputButtonText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900"
  },
  passwordVisibilityButton: {
    width: 34,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eef4fb",
    borderWidth: 1,
    borderColor: "#d7e2ee"
  },
  passwordVisibilityButtonActive: {
    backgroundColor: "#b7f000",
    borderColor: "#8fcb00"
  },
  passwordVisibilityButtonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.96 }]
  }
});
