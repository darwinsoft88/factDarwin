import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Client } from "../types";
import { useAppTheme } from "../theme/AppTheme";

type SelectedClientCardProps = {
  client?: Client;
  onEdit: () => void;
};

export function SelectedClientCard({ client, onEdit }: SelectedClientCardProps) {
  const { theme } = useAppTheme();
  if (!client) return null;

  return (
    <View style={[styles.inlineCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
      <View style={styles.flex}>
        <Text style={[styles.clientName, { color: theme.colors.text }]} numberOfLines={1}>{client.name}</Text>
        <Text style={[styles.inlineInfo, { color: theme.colors.textMuted }]} numberOfLines={1}>{client.identification} | {client.email || "sin email"}</Text>
        {client.address ? <Text style={[styles.inlineInfo, { color: theme.colors.textMuted }]} numberOfLines={1}>{client.address}</Text> : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Editar cliente" style={[styles.quickEditButton, { backgroundColor: theme.colors.primary }]} onPress={onEdit}>
        <MaterialCommunityIcons name="account-edit-outline" size={20} color={theme.colors.onPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  inlineCard: {
    borderWidth: 1,
    borderColor: "#dbe4ee",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  flex: {
    flex: 1,
    minWidth: 130
  },
  clientName: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 16,
    marginBottom: 1
  },
  inlineInfo: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 14
  },
  quickEditButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f766e"
  }
});
