import React from "react";
import { StyleSheet, Text, View } from "react-native";

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
  const pendingStyle = infoOnly ? styles.checkInfo : styles.checkPending;
  const pendingTextStyle = infoOnly ? styles.checkInfoText : styles.checkPendingText;

  return (
    <View style={[styles.checkRow, item.ok ? styles.checkOk : pendingStyle]}>
      <Text style={[styles.checkText, item.ok ? styles.checkOkText : pendingTextStyle]}>{item.ok ? "OK" : pendingLabel} | {item.label}</Text>
    </View>
  );
}

export function ProductionChecklist({ checklist }: ProductionChecklistProps) {
  return (
    <>
      <Text style={styles.groupTitle}>Listo para trabajar</Text>
      {checklist.baseChecks.map((item) => (
        <CheckRow key={item.label} item={item} pendingLabel="REVISAR" />
      ))}
      <Text style={styles.groupTitle}>Conexion y firma</Text>
      <Text style={styles.paragraph}>Use Probar conexion cuando cambie servidor, certificado o ambiente. No es obligatorio tocarlo cada vez que entra a la app.</Text>
      {checklist.connectionChecks.map((item) => (
        <CheckRow key={item.label} item={item} pendingLabel={item.pendingLabel || "PENDIENTE"} infoOnly />
      ))}
      <Text style={styles.groupTitle}>Pendiente solo para produccion</Text>
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
