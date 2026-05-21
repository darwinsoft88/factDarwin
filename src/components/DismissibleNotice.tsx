import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

type DismissibleNoticeProps = {
  message: string;
  tone?: "success" | "warning";
  title?: string;
  onDismiss: () => void;
};

export function DismissibleNotice({ message, tone = "warning", title, onDismiss }: DismissibleNoticeProps) {
  if (!message) return null;

  const boxStyle = tone === "success" ? styles.successBox : styles.warningBox;
  const textStyle = tone === "success" ? styles.successText : styles.warningText;

  return (
    <Pressable style={[styles.box, boxStyle]} onPress={onDismiss}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <Text style={textStyle}>{message}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10
  },
  warningBox: {
    borderColor: "#fbbf24",
    backgroundColor: "#fffbeb"
  },
  successBox: {
    borderColor: "#86efac",
    backgroundColor: "#f0fdf4"
  },
  title: {
    color: "#166534",
    fontWeight: "900"
  },
  warningText: {
    color: "#92400e",
    fontWeight: "800",
    lineHeight: 18
  },
  successText: {
    color: "#166534",
    marginTop: 3,
    lineHeight: 18
  }
});
