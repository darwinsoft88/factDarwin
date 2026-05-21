import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Client } from "../types";
import { PencilIcon } from "./icons";

type SelectedClientCardProps = {
  client?: Client;
  onEdit: () => void;
};

export function SelectedClientCard({ client, onEdit }: SelectedClientCardProps) {
  if (!client) return null;

  return (
    <View style={styles.inlineCard}>
      <View style={styles.flex}>
        <Text style={styles.inlineInfo}>{client.identification} | {client.email || "sin email"}</Text>
        <Text style={styles.inlineInfo}>{client.address || "sin direccion"}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Editar cliente" style={styles.quickEditButton} onPress={onEdit}>
        <PencilIcon />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  inlineCard: {
    borderWidth: 1,
    borderColor: "#dbe4ee",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  flex: {
    flex: 1,
    minWidth: 130
  },
  inlineInfo: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18
  },
  quickEditButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f766e"
  }
});
