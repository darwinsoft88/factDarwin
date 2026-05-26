import React from "react";
import { StyleSheet, Text } from "react-native";
import { Issuer } from "../types";
import { ProductionChecklist, ProductionChecklistValue } from "./ProductionChecklist";

type ProductionStatusSectionProps = {
  issuer: Issuer;
  checklist: ProductionChecklistValue;
};

export function ProductionStatusSection({ issuer, checklist }: ProductionStatusSectionProps) {
  return (
    <>
      <Text style={styles.paragraph}>Modo actual: {issuer.environment === "1" ? "PRUEBAS" : "PRODUCCION"}. Los avisos de produccion son informativos mientras siga trabajando en pruebas.</Text>
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
