import React from "react";
import { StyleSheet, Text } from "react-native";
import { Issuer } from "../types";
import { taxRegimeDisplayName } from "../utils/taxRegime";
import { useAppTheme } from "../theme/AppTheme";

type IntegrationStatusInfoProps = {
  issuer: Issuer;
};

export function IntegrationStatusInfo({ issuer }: IntegrationStatusInfoProps) {
  const { theme } = useAppTheme();
  const paragraphStyle = [styles.paragraph, { color: theme.colors.textMuted }];
  return (
    <>
      <Text style={paragraphStyle}>La app genera la factura y el servidor confirma la autorizacion del SRI.</Text>
      <Text style={paragraphStyle}>Estado actual: {issuer.environment === "1" ? "Modo de prueba" : "Facturación real"}</Text>
      <Text style={paragraphStyle}>Regimen: {taxRegimeDisplayName(issuer.taxRegime)} | Tipo: {issuer.taxpayerType === "natural" ? "Persona natural" : "Persona juridica"} | Contabilidad: {issuer.accountingRequired} | Especial: {issuer.specialTaxpayer} | Agente retencion: {issuer.retentionAgent || "NO"}</Text>
      <Text style={paragraphStyle}>El servidor enviara cada comprobante al ambiente indicado por el emisor.</Text>
    </>
  );
}

const styles = StyleSheet.create({
  paragraph: {
    color: "#4b5563",
    lineHeight: 20
  }
});
