import { useState } from "react";
import { Alert } from "react-native";
import { sendTestEmail } from "../services/backend";
import { Issuer } from "../types";

type UseSriEmailTestParams = {
  backendToken: string;
  backendUrl: string;
  issuer: Issuer;
};

export function useSriEmailTest({ backendToken, backendUrl, issuer }: UseSriEmailTestParams) {
  const [testingEmail, setTestingEmail] = useState(false);

  const testCompanyEmail = async () => {
    if (!issuer.email?.trim()) {
      Alert.alert("Correo requerido", "Ingrese y guarde un correo de contacto para la empresa.");
      return;
    }
    setTestingEmail(true);
    try {
      const result = await sendTestEmail(backendUrl, { to: issuer.email.trim() }, backendToken);
      Alert.alert("Correo probado", `Se envio una prueba a ${result.to || issuer.email}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo enviar el correo de prueba.";
      Alert.alert("Correo no disponible", message);
    } finally {
      setTestingEmail(false);
    }
  };

  return { testingEmail, testCompanyEmail };
}
