import React from "react";
import { StyleSheet, Text } from "react-native";
import { AppData } from "../types";
import { formatAuditDate, formatBackupSummary, summarizeAppData } from "../utils/support";
import { useAppTheme } from "../theme/AppTheme";

type BackupStatusInfoProps = {
  data: AppData;
};

export function BackupStatusInfo({ data }: BackupStatusInfoProps) {
  const { theme } = useAppTheme();
  const paragraphStyle = [styles.paragraph, { color: theme.colors.textMuted }];
  return (
    <>
      <Text style={paragraphStyle}>Respalda o restaura usuarios, clientes, productos, ventas, guias, retenciones, inventario y configuracion.</Text>
      <Text style={paragraphStyle}>Automatico: {data.autoBackupEnabled === false ? "Inactivo" : "Activo"} | Ultimo: {data.autoBackupLastAt ? formatAuditDate(data.autoBackupLastAt) : "pendiente"}</Text>
      {data.autoBackupLastError ? <Text style={[styles.paragraph, { color: theme.colors.danger }]}>Ultimo error automatico: {data.autoBackupLastError}</Text> : null}
      <Text selectable style={[styles.inlineInfo, { color: theme.colors.textMuted }]}>{formatBackupSummary(summarizeAppData(data))}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  paragraph: {
    color: "#4b5563",
    lineHeight: 20
  },
  inlineInfo: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18
  }
});
