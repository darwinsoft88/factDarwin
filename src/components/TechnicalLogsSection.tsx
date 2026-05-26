import React from "react";
import { StyleSheet, Text } from "react-native";
import { TechnicalLog } from "../services/backend";
import { PrimaryButton } from "./common";
import { TechnicalLogsList } from "./TechnicalLogsList";

type TechnicalLogsSectionProps = {
  logs: TechnicalLog[];
  loading: boolean;
  onLoad: () => void;
};

export function TechnicalLogsSection({ logs, loading, onLoad }: TechnicalLogsSectionProps) {
  return (
    <>
      <Text style={styles.paragraph}>Para soporte: muestra errores, reintentos, login, correo, SRI y respuestas lentas del servidor. No guarda claves ni documentos completos.</Text>
      <PrimaryButton label={loading ? "Cargando..." : "Cargar logs tecnicos"} onPress={loading ? () => undefined : onLoad} />
      <TechnicalLogsList logs={logs} />
    </>
  );
}

const styles = StyleSheet.create({
  paragraph: {
    color: "#4b5563",
    lineHeight: 20
  }
});
