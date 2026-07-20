import { useState } from "react";
import { Alert } from "react-native";
import { checkBackendHealth } from "../services/backend";
import { Issuer } from "../types";
import { formatBackendHealth } from "../utils/support";

export function useSriConnectionTest({ backendUrl, issuer }: { backendUrl: string; issuer: Issuer }) {
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState("");

  const testConnection = async () => {
    setCheckingConnection(true);
    setConnectionResult("");

    try {
      const health = await checkBackendHealth(backendUrl);
      const expectedEnv = issuer.environment === "1" ? "test" : "production";
      const backendEnv = health.sriEnv || "desconocido";
      const envMatches = backendEnv === expectedEnv;
      const lines = formatBackendHealth(health, backendUrl, expectedEnv, envMatches);

      setConnectionResult(lines);
      Alert.alert(envMatches ? "Conexion OK" : "Revise ambiente", lines);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo probar la conexion.";
      setConnectionResult(`ERROR DE CONEXION\n${message}`);
      Alert.alert("Servidor no disponible", message);
    } finally {
      setCheckingConnection(false);
    }
  };

  return {
    checkingConnection,
    connectionResult,
    testConnection
  };
}
