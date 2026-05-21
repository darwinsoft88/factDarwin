import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export function InlineInputButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.inlineInputButton} onPress={onPress}>
      <Text style={styles.inlineInputButtonText}>{label}</Text>
    </Pressable>
  );
}

export function PasswordVisibilityButton({ visible, onPress }: { visible: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={visible ? "Ocultar clave" : "Mostrar clave"}
      style={styles.passwordVisibilityButton}
      onPress={onPress}
    >
      <EyeIcon hidden={visible} />
    </Pressable>
  );
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <View style={styles.eyeIconWrap}>
      <View style={styles.eyeIcon}>
        <View style={styles.eyePupil} />
      </View>
      {hidden ? <View style={styles.eyeSlash} /> : null}
    </View>
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
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center"
  },
  eyeIconWrap: {
    width: 22,
    height: 16,
    alignItems: "center",
    justifyContent: "center"
  },
  eyeIcon: {
    width: 21,
    height: 13,
    borderWidth: 1.8,
    borderColor: "#64748b",
    borderRadius: 11,
    transform: [{ scaleY: 0.82 }],
    alignItems: "center",
    justifyContent: "center"
  },
  eyePupil: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#64748b"
  },
  eyeSlash: {
    position: "absolute",
    width: 25,
    height: 1.8,
    borderRadius: 1,
    backgroundColor: "#64748b",
    transform: [{ rotate: "-38deg" }]
  }
});
