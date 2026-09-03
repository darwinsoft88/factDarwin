import React from "react";
import { StyleSheet, Text } from "react-native";
import { Issuer } from "../types";
import { ProductionChecklist, ProductionChecklistValue } from "./ProductionChecklist";
import { useAppTheme } from "../theme/AppTheme";

type ProductionStatusSectionProps = {
  issuer: Issuer;
  checklist: ProductionChecklistValue;
};

export function ProductionStatusSection({ issuer, checklist }: ProductionStatusSectionProps) {
  const { theme } = useAppTheme();
  return (
    <>
      <Text style={[styles.paragraph, { color: theme.colors.textMuted }]}>Estado actual: {issuer.environment === "1" ? "Modo de prueba" : "Facturación real activa"}. {issuer.environment === "1" ? "Los avisos de producción son informativos mientras preparas la empresa." : "Los comprobantes electrónicos pueden enviarse oficialmente al SRI."}</Text>
      <ProductionChecklist checklist={checklist} />
    </>
  );
}

const styles = StyleSheet.create({
  paragraph: {
    color: "#4b5563",
    lineHeight: 20
  }
});
