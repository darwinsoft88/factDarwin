import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../theme/AppTheme";

export type ProductionChecklistItem = {
  label: string;
  ok: boolean;
  pendingLabel?: string;
};

export type ProductionChecklistValue = {
  baseChecks: ProductionChecklistItem[];
  connectionChecks: ProductionChecklistItem[];
  productionChecks: ProductionChecklistItem[];
};

type ProductionChecklistProps = {
  checklist: ProductionChecklistValue;
};

function CheckRow({ item, pendingLabel, infoOnly = false }: { item: ProductionChecklistItem; pendingLabel: string; infoOnly?: boolean }) {
  const { theme } = useAppTheme();
  const backgroundColor = item.ok ? theme.colors.successSoft : infoOnly ? theme.colors.infoSoft : theme.colors.warningSoft;
  const borderColor = item.ok ? theme.colors.success : infoOnly ? theme.colors.info : theme.colors.warning;
  const color = item.ok ? theme.colors.success : infoOnly ? theme.colors.info : theme.colors.warning;

  return (
    <View style={[styles.checkRow, { backgroundColor, borderColor }]}>
      <Text style={[styles.checkText, { color }]}>{item.ok ? "OK" : pendingLabel} | {item.label}</Text>
    </View>
  );
}

export function ProductionChecklist({ checklist }: ProductionChecklistProps) {
  const { theme } = useAppTheme();
  return (
    <>
      <Text style={[styles.groupTitle, { color: theme.colors.primary }]}>Listo para trabajar</Text>
      {checklist.baseChecks.map((item) => (
        <CheckRow key={item.label} item={item} pendingLabel="REVISAR" />
      ))}
      <Text style={[styles.groupTitle, { color: theme.colors.primary }]}>Conexion y firma</Text>
      <Text style={[styles.paragraph, { color: theme.colors.textMuted }]}>Use Probar conexion cuando cambie servidor, certificado o ambiente. No es obligatorio tocarlo cada vez que entra a la app.</Text>
      {checklist.connectionChecks.map((item) => (
        <CheckRow key={item.label} item={item} pendingLabel={item.pendingLabel || "PENDIENTE"} infoOnly />
      ))}
      <Text style={[styles.groupTitle, { color: theme.colors.primary }]}>Pendiente solo para produccion</Text>
      {checklist.productionChecks.map((item) => (
        <CheckRow key={item.label} item={item} pendingLabel={item.pendingLabel || "SOLO PRODUCCION"} infoOnly />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  groupTitle: {
    color: "#0f766e",
    fontWeight: "900",
    fontSize: 13,
    textTransform: "uppercase"
  },
  paragraph: {
    color: "#4b5563",
    lineHeight: 20
  },
  checkRow: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  checkOk: {
    backgroundColor: "#ecfdf5",
    borderColor: "#99f6e4"
  },
  checkPending: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa"
  },
  checkInfo: {
    backgroundColor: "#eff6ff",
    borderColor: "#bfdbfe"
  },
  checkText: {
    fontSize: 12,
    fontWeight: "900"
  },
  checkOkText: {
    color: "#047857"
  },
  checkPendingText: {
    color: "#9a3412"
  },
  checkInfoText: {
    color: "#1d4ed8"
  }
});
