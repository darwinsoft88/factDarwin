import { useState } from "react";
import { Alert } from "react-native";
import { checkBackendHealth } from "../services/backend";
import { Issuer } from "../types";
import { formatBackendHealth } from "../utils/support";

export function useSriConnectionTest({ backendUrl, issuer }: { backendUrl: string; issuer: Issuer }) {
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState("");

  const testConnection = async ({ showAlert = true }: { showAlert?: boolean } = {}) => {
    setCheckingConnection(true);
    setConnectionResult("");

    try {
      const health = await checkBackendHealth(backendUrl);
      const expectedEnv = issuer.environment === "1" ? "test" : "production";
      const backendEnv = health.sriEnv || "desconocido";
      const envMatches = backendEnv === expectedEnv;
      const lines = formatBackendHealth(health, backendUrl, expectedEnv, envMatches);

      setConnectionResult(lines);
      if (showAlert) Alert.alert(envMatches ? "Conexion OK" : "Revise ambiente", lines);
      return { ok: true as const, result: lines };
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo probar la conexion.";
      const result = `ERROR DE CONEXION\n${message}`;
      setConnectionResult(result);
      if (showAlert) Alert.alert("Servidor no disponible", message);
      return { ok: false as const, result, message };
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
