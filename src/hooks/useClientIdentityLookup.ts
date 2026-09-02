import React, { useState } from "react";
import {
  showError,
  showInfo,
  showWarning
} from "../utils/dialogs";
import { lookupIdentityData } from "../services/backend";
import { AppData, Client } from "../types";
import type { ClientFormValues } from "../components/ClientForm";
import { normalizeClientIdentification } from "../validation";

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
      showWarning("Identificacion requerida", "Ingrese una cedula o RUC para consultar.");
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
        identificationType: existingClient.identificationType,
        defaultSalePriceTier: existingClient.defaultSalePriceTier || "pvp1"
      });
      setEditModalVisible(true);
      setClientSearch(existingClient.identification);
      showInfo("Cliente ya existe", `Se cargo el cliente guardado: ${existingClient.name}.`);
      return;
    }
    setLookingUpClient(true);
    try {
      const token = backendToken || await getBackendToken(data.backendUrl);
      if (!token) {
        showWarning("Sesion requerida", "Inicie sesion con conexion al servidor para consultar cedula o RUC.");
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
      showInfo("Datos encontrados", `${result.name || result.businessName}\n${result.status ? `Estado: ${result.status}` : ""}`.trim());
    } catch (error) {
      showError("No se pudo consultar", error instanceof Error ? error.message : "Intente nuevamente.");
    } finally {
      setLookingUpClient(false);
    }
  };

  return { lookingUpClient, lookupClientIdentification };
}
