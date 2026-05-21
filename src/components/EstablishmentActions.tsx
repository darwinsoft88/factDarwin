import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type EstablishmentStatus = {
  tone: "info" | "error" | "success";
  message: string;
};

type EstablishmentActionsProps = {
  canManage: boolean;
  documentCount: number;
  status: EstablishmentStatus | null;
  onAdd: () => void;
  onDelete: () => void;
};

export function EstablishmentActions({ canManage, documentCount, status, onAdd, onDelete }: EstablishmentActionsProps) {
  return (
    <>
      {status ? <Text style={[styles.inlineInfo, status.tone === "success" && styles.successText, status.tone === "error" && styles.errorText]}>{status.message}</Text> : null}
      <View style={styles.row}>
        <View style={styles.flex}>
          <Pressable style={[styles.primaryButton, !canManage && styles.disabledButton]} onPress={onAdd}>
            <Text style={styles.primaryButtonText}>Agregar establecimiento</Text>
          </Pressable>
        </View>
        <View style={styles.flex}>
          <Pressable style={styles.establishmentDeleteButton} onPress={onDelete}>
            <Text style={styles.establishmentDeleteButtonText}>Eliminar establecimiento</Text>
          </Pressable>
        </View>
      </View>
      {documentCount > 0 ? <Text style={styles.inlineInfo}>Este establecimiento tiene {documentCount} documento(s); no se puede eliminar.</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
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
  successText: {
    color: "#047857"
  },
  errorText: {
    color: "#b91c1c"
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "800"
  },
  disabledButton: {
    backgroundColor: "#94a3b8"
  },
  establishmentDeleteButton: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fff1f2",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  establishmentDeleteButtonText: {
    color: "#991b1b",
    fontWeight: "900",
    textAlign: "center"
  }
});
