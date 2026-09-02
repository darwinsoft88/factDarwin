import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { Issuer } from "../types";
import { ProductionChecklist, ProductionChecklistValue } from "./ProductionChecklist";
import { useAppTheme } from "../theme/AppTheme";

type ProductionStatusSectionProps = {
  issuer: Issuer;
  checklist: ProductionChecklistValue;
  changingEnvironment: boolean;
  onReturnToTests: () => void;
};

export function ProductionStatusSection({ issuer, checklist, changingEnvironment, onReturnToTests }: ProductionStatusSectionProps) {
  const { theme } = useAppTheme();
  return (
    <>
      <Text style={[styles.paragraph, { color: theme.colors.textMuted }]}>Estado actual: {issuer.environment === "1" ? "Modo de prueba" : "Facturación real activa"}. {issuer.environment === "1" ? "Los avisos de producción son informativos mientras preparas la empresa." : "Los comprobantes electrónicos pueden enviarse oficialmente al SRI."}</Text>
      <ProductionChecklist checklist={checklist} />
      {issuer.environment === "2" ? <Pressable disabled={changingEnvironment} onPress={onReturnToTests} style={[styles.returnButton, { borderColor: theme.colors.warning }]}><Text style={[styles.returnButtonText, { color: theme.colors.warning }]}>{changingEnvironment ? "Confirmando..." : "Volver a modo de prueba"}</Text></Pressable> : null}
    </>
  );
}

const styles = StyleSheet.create({
  paragraph: {
    color: "#4b5563",
    lineHeight: 20
  },
  returnButton: { alignItems: "center", borderRadius: 10, borderWidth: 1, justifyContent: "center", minHeight: 42, paddingHorizontal: 12 },
  returnButtonText: { fontSize: 12, fontWeight: "900" }
});
