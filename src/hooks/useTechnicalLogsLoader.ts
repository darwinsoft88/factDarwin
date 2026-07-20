import { useState } from "react";
import { Alert } from "react-native";
import { TechnicalLog, getTechnicalLogs } from "../services/backend";

const TECHNICAL_LOGS_READ_LIMIT = 30;

export function useTechnicalLogsLoader({ backendToken, backendUrl }: { backendToken: string; backendUrl: string }) {
  const [loadingTechnicalLogs, setLoadingTechnicalLogs] = useState(false);
  const [technicalLogs, setTechnicalLogs] = useState<TechnicalLog[]>([]);

  const loadTechnicalLogs = async () => {
    setLoadingTechnicalLogs(true);
    try {
      const logs = await getTechnicalLogs(backendUrl, backendToken, TECHNICAL_LOGS_READ_LIMIT);
      setTechnicalLogs(logs);
      if (logs.length === 0) {
        Alert.alert("Sin logs tecnicos", "Aun no hay eventos tecnicos registrados en el backend.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudieron cargar los logs tecnicos.";
      Alert.alert("Logs no disponibles", message);
    } finally {
      setLoadingTechnicalLogs(false);
    }
  };

  return {
    loadingTechnicalLogs,
    loadTechnicalLogs,
    technicalLogs
  };
}
