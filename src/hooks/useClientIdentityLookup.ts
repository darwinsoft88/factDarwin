import React, { useState } from "react";
import { Alert } from "react-native";
import { lookupIdentityData } from "../services/backend";
import { AppData, Client } from "../types";
import { normalizeClientIdentification } from "../validation";

type ClientFormValues = {
  name: string;
  identification: string;
  email: string;
  phone: string;
  address: string;
  identificationType: Client["identificationType"];
};

type UseClientIdentityLookupParams = {
  backendToken: string;
  data: AppData;
  form: ClientFormValues;
  getBackendToken: (backendUrl: string) => Promise<string>;
  setClientSearch: React.Dispatch<React.SetStateAction<string>>;
  setEditModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setEditingId: React.Dispatch<React.SetStateAction<string>>;
  setForm: React.Dispatch<React.SetStateAction<ClientFormValues>>;
};

export function useClientIdentityLookup({
  backendToken,
  data,
  form,
  getBackendToken,
  setClientSearch,
  setEditModalVisible,
  setEditingId,
  setForm
}: UseClientIdentityLookupParams) {
  const [lookingUpClient, setLookingUpClient] = useState(false);

  const lookupClientIdentification = async () => {
    const identification = normalizeClientIdentification(form.identification);
    if (!identification) {
      Alert.alert("Identificacion requerida", "Ingrese una cedula o RUC para consultar.");
      return;
    }
    const existingClient = data.clients.find((client) => normalizeClientIdentification(client.identification) === identification);
    if (existingClient) {
      setEditingId(existingClient.id);
      setForm({
        name: existingClient.name,
        identification: existingClient.identification,
        email: existingClient.email,
        phone: existingClient.phone || "",
        address: existingClient.address,
        identificationType: existingClient.identificationType
      });
      setEditModalVisible(true);
      setClientSearch(existingClient.identification);
      Alert.alert("Cliente ya existe", `Se cargo el cliente guardado: ${existingClient.name}.`);
      return;
    }
    setLookingUpClient(true);
    try {
      const token = backendToken || await getBackendToken(data.backendUrl);
      if (!token) {
        Alert.alert("Sesion requerida", "Inicie sesion con conexion al servidor para consultar cedula o RUC.");
        return;
      }
      const result = await lookupIdentityData(data.backendUrl, identification, token);
      setForm((current) => ({
        ...current,
        identification: result.identification || identification,
        identificationType: (result.identificationType || (identification.length === 13 ? "04" : "05")) as Client["identificationType"],
        name: result.name || result.businessName || current.name,
        address: result.address || current.address
      }));
      Alert.alert("Datos encontrados", `${result.name || result.businessName}\n${result.status ? `Estado: ${result.status}` : ""}`.trim());
    } catch (error) {
      Alert.alert("No se pudo consultar", error instanceof Error ? error.message : "Intente nuevamente.");
    } finally {
      setLookingUpClient(false);
    }
  };

  return { lookingUpClient, lookupClientIdentification };
}
