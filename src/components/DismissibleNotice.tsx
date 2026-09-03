import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useAppTheme } from "../theme/AppTheme";

type DismissibleNoticeProps = {
  message: string;
  tone?: "success" | "warning";
  title?: string;
  onDismiss: () => void;
  autoDismissMs?: number;
};

export function DismissibleNotice({ message, tone = "warning", title, onDismiss, autoDismissMs = 4500 }: DismissibleNoticeProps) {
  const { theme } = useAppTheme();
  const onDismissRef = React.useRef(onDismiss);

  React.useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  React.useEffect(() => {
    if (!message || autoDismissMs <= 0) return undefined;
    const timer = setTimeout(() => onDismissRef.current(), autoDismissMs);
    return () => clearTimeout(timer);
  }, [autoDismissMs, message]);

  if (!message) return null;

  const toneColor = tone === "success" ? theme.colors.success : theme.colors.warning;
  const toneBackground = tone === "success" ? theme.colors.successSoft : theme.colors.warningSoft;

  return (
    <Pressable style={[styles.box, { borderColor: toneColor, backgroundColor: toneBackground }]} onPress={onDismiss}>
      {title ? <Text style={[styles.title, { color: toneColor }]}>{title}</Text> : null}
      <Text style={[tone === "success" ? styles.successText : styles.warningText, { color: toneColor }]}>{message}</Text>
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
