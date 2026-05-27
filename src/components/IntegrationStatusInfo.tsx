import React from "react";
import { StyleSheet, Text } from "react-native";
import { Issuer } from "../types";
import { taxRegimeDisplayName } from "../utils/taxRegime";

type IntegrationStatusInfoProps = {
  issuer: Issuer;
};

export function IntegrationStatusInfo({ issuer }: IntegrationStatusInfoProps) {
  return (
    <>
      <Text style={styles.paragraph}>La app genera la factura y el servidor confirma la autorizacion del SRI.</Text>
      <Text style={styles.paragraph}>Ambiente actual: {issuer.environment === "1" ? "Pruebas" : "Produccion"}</Text>
      <Text style={styles.paragraph}>Regimen: {taxRegimeDisplayName(issuer.taxRegime)} | Tipo: {issuer.taxpayerType === "natural" ? "Persona natural" : "Persona juridica"} | Contabilidad: {issuer.accountingRequired} | Especial: {issuer.specialTaxpayer} | Agente retencion: {issuer.retentionAgent || "NO"}</Text>
      <Text style={styles.paragraph}>Para produccion, el ambiente de la app y del servidor deben estar en Produccion.</Text>
    </>
  );
}

const styles = StyleSheet.create({
  paragraph: {
    color: "#4b5563",
    lineHeight: 20
  }
});
