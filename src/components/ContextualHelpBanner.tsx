import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../theme/AppTheme";

export function ContextualHelpBanner({ title, text, onDismiss }: { title: string; text: string; onDismiss: () => void }) {
  const { theme } = useAppTheme();
  return (
    <View accessibilityRole="summary" style={[styles.card, { backgroundColor: theme.colors.infoSoft, borderColor: theme.colors.info }]}> 
      <MaterialCommunityIcons name="lightbulb-on-outline" size={21} color={theme.colors.info} />
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
        <Text style={[styles.text, { color: theme.colors.textMuted }]}>{text}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Entendido" onPress={onDismiss} style={styles.button}>
        <Text style={[styles.buttonText, { color: theme.colors.primary }]}>Entendido</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: "center", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 10, marginBottom: 12, padding: 12 },
  content: { flex: 1 },
  title: { fontSize: 13, fontWeight: "900" },
  text: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  button: { paddingHorizontal: 6, paddingVertical: 8 },
  buttonText: { fontSize: 12, fontWeight: "900" }
});

