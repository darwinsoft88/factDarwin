import React from "react";
import { StyleSheet, Text, View } from "react-native";

export function CameraIcon() {
  return (
    <View style={styles.cameraIconBody}>
      <View style={styles.cameraIconTop} />
      <View style={styles.cameraIconLens} />
    </View>
  );
}

export function MenuIcon() {
  return (
    <View style={styles.menuIcon}>
      <View style={styles.menuIconLine} />
      <View style={styles.menuIconLine} />
      <View style={styles.menuIconLine} />
    </View>
  );
}

export function PencilIcon() {
  return <Text style={styles.editEmojiIcon}>✎</Text>;
}

const styles = StyleSheet.create({
  menuIcon: {
    width: 16,
    gap: 3
  },
  menuIconLine: {
    height: 2,
    borderRadius: 2,
    backgroundColor: "#64748b"
  },
  editEmojiIcon: {
    color: "#ffffff",
    fontSize: 18,
    lineHeight: 20,
    fontWeight: "900",
    textAlign: "center"
  },
  cameraIconBody: {
    width: 18,
    height: 14,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center"
  },
  cameraIconTop: {
    position: "absolute",
    top: -5,
    width: 8,
    height: 4,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    backgroundColor: "#ffffff"
  },
  cameraIconLens: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#ffffff"
  }
});
