import React, { useState } from "react";
import { Alert } from "react-native";
import { lookupIdentityData } from "../services/backend";
import { AppData, Issuer } from "../types";
import { activeEstablishment, applyIdentityToIssuer } from "../utils/establishments";

type EstablishmentStatus = { tone: "info" | "success" | "error"; message: string };

type UseSriIssuerLookupParams = {
  backendToken: string;
  backendUrl: string;
  data: AppData;
  getBackendToken: (backendUrl: string) => Promise<string>;
  issuer: Issuer;
  setCreditNoteSequentialText: React.Dispatch<React.SetStateAction<string>>;
  setEstablishmentStatus: React.Dispatch<React.SetStateAction<EstablishmentStatus | null>>;
  setIssuer: React.Dispatch<React.SetStateAction<Issuer>>;
  setRemissionSequentialText: React.Dispatch<React.SetStateAction<string>>;
  setSequentialText: React.Dispatch<React.SetStateAction<string>>;
};

export function useSriIssuerLookup({
  backendToken,
  backendUrl,
  data,
  getBackendToken,
  issuer,
  setCreditNoteSequentialText,
  setEstablishmentStatus,
  setIssuer,
  setRemissionSequentialText,
  setSequentialText
}: UseSriIssuerLookupParams) {
  const [lookingUpIssuer, setLookingUpIssuer] = useState(false);

  const lookupIssuerRuc = async () => {
    const ruc = issuer.ruc.replace(/\D/g, "");
    if (!/^\d{13}$/.test(ruc)) {
      Alert.alert("RUC requerido", "Ingrese un RUC de 13 digitos para consultar.");
      return;
    }
    const savedRuc = data.issuer.ruc.replace(/\D/g, "");
    if (savedRuc && ruc === savedRuc) {
      const current = activeEstablishment(data.issuer);
      setIssuer(data.issuer);
      setSequentialText(String(data.issuer.sequential));
      setRemissionSequentialText(String(data.issuer.remissionSequential || 1));
      setCreditNoteSequentialText(String(data.issuer.creditNoteSequential || 1));
      setEstablishmentStatus({
        tone: "info",
        message: `Este RUC ya esta configurado para ${data.issuer.businessName}. No se consulto WebServices ni se creo otro establecimiento.`
      });
      Alert.alert("RUC ya configurado", `${data.issuer.businessName}\nEstablecimiento activo: ${current.establishment}-${current.emissionPoint}`);
      return;
    }
    setLookingUpIssuer(true);
    try {
      const token = backendToken || await getBackendToken(backendUrl);
      if (!token) {
        Alert.alert("Sesion requerida", "Inicie sesion con conexion al servidor para consultar datos del RUC.");
        return;
      }
      const result = await lookupIdentityData(backendUrl, ruc, token);
      const nextIssuer = applyIdentityToIssuer(issuer, result);
      setIssuer(nextIssuer);
      setEstablishmentStatus({
        tone: "success",
        message: `Datos encontrados: ${result.businessName || result.name || ruc}${result.status ? ` (${result.status})` : ""}.`
      });
      Alert.alert("RUC encontrado", `${result.businessName || result.name || ruc}\n${result.status ? `Estado: ${result.status}` : ""}`.trim());
    } catch (error) {
      setEstablishmentStatus({ tone: "error", message: error instanceof Error ? error.message : "No se pudo consultar el RUC." });
      Alert.alert("No se pudo consultar", error instanceof Error ? error.message : "Intente nuevamente.");
    } finally {
      setLookingUpIssuer(false);
    }
  };

  return { lookingUpIssuer, lookupIssuerRuc };
}
