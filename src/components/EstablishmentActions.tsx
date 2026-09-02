import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../theme/AppTheme";

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
  const { theme } = useAppTheme();
  const statusColor = status?.tone === "success" ? theme.colors.success : status?.tone === "error" ? theme.colors.danger : theme.colors.info;
  return (
    <View style={[styles.management, { borderTopColor: theme.colors.borderStrong }]}>
      <Text style={[styles.managementTitle, { color: theme.colors.text }]}>Administrar establecimientos</Text>
      <Text style={[styles.managementHint, { color: theme.colors.textMuted }]}>Agrega otra sucursal o administra el establecimiento seleccionado.</Text>
      {status ? <Text style={[styles.inlineInfo, { color: statusColor }]}>{status.message}</Text> : null}
      <View style={styles.row}>
        <View style={styles.flex}>
          <Pressable style={[styles.primaryButton, { backgroundColor: canManage ? theme.colors.primary : theme.colors.textSubtle }]} onPress={onAdd}>
            <Text style={[styles.primaryButtonText, { color: theme.colors.onPrimary }]}>Nuevo establecimiento</Text>
          </Pressable>
        </View>
        <View style={styles.flex}>
          <Pressable disabled={documentCount > 0} style={[styles.establishmentDeleteButton, { borderColor: theme.colors.danger, backgroundColor: theme.colors.dangerSoft }, documentCount > 0 && styles.disabledDelete]} onPress={onDelete}>
            <Text style={[styles.establishmentDeleteButtonText, { color: theme.colors.danger }]}>Eliminar seleccionado</Text>
          </Pressable>
        </View>
      </View>
      {documentCount > 0 ? <Text style={[styles.inlineInfo, { color: theme.colors.textMuted }]}>Este establecimiento tiene {documentCount} documento(s); no se puede eliminar.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  management: { borderTopWidth: 1, gap: 8, marginTop: 2, paddingTop: 12 },
  managementTitle: { fontSize: 13, fontWeight: "900" },
  managementHint: { fontSize: 11, lineHeight: 16 },
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
  },
  disabledDelete: { opacity: 0.45 }
});
