import { useState } from "react";
import { Alert } from "react-native";
import { syncPatchToBackend } from "../utils/sync";
import { AppData, Client, User } from "../types";
import { appendAudit } from "../utils/audit";
import { showMessage } from "../utils/dialogs";
import { findDuplicateClient, isConsumerFinalClient, normalizeClientIdentification } from "../validation";

export type QuickClientForm = {
  name: string;
  identification: string;
  email: string;
  phone: string;
  address: string;
  identificationType: Client["identificationType"];
};

type RemoteClientResults = { items: Client[]; total: number } | null;

type UseQuickSaleClientEditorParams = {
  backendToken: string;
  data: AppData;
  persist: (data: AppData) => Promise<void>;
  selectedClient?: Client;
  user: User;
  setClientId: React.Dispatch<React.SetStateAction<string>>;
  setIssueNotice: React.Dispatch<React.SetStateAction<string>>;
  setRemoteClientResults: React.Dispatch<React.SetStateAction<RemoteClientResults>>;
  setSelectedRemoteClient: React.Dispatch<React.SetStateAction<Client | null>>;
};

const emptyQuickClientForm: QuickClientForm = {
  name: "",
  identification: "",
  email: "",
  phone: "",
  address: "",
  identificationType: "05"
};

export function useQuickSaleClientEditor({
  backendToken,
  data,
  persist,
  selectedClient,
  setClientId,
  setIssueNotice,
  setRemoteClientResults,
  setSelectedRemoteClient,
  user
}: UseQuickSaleClientEditorParams) {
  const [quickClientVisible, setQuickClientVisible] = useState(false);
  const [quickClientForm, setQuickClientForm] = useState<QuickClientForm>(emptyQuickClientForm);

  const openQuickClientEditor = () => {
    if (!selectedClient) {
      Alert.alert("Cliente requerido", "Seleccione un cliente para editarlo.");
      return;
    }
    if (isConsumerFinalClient(selectedClient)) {
      Alert.alert("Consumidor Final protegido", "Este cliente fiscal no se edita. Seleccione o cree el cliente real con su cedula/RUC.");
      return;
    }
    setQuickClientForm({
      name: selectedClient.name,
      identification: selectedClient.identification,
      email: selectedClient.email,
      phone: selectedClient.phone || "",
      address: selectedClient.address,
      identificationType: selectedClient.identificationType
    });
    setQuickClientVisible(true);
  };

  const saveQuickClient = async () => {
    if (!selectedClient) return;
    if (isConsumerFinalClient(selectedClient)) {
      Alert.alert("Consumidor Final protegido", "Este cliente fiscal no se puede modificar.");
      return;
    }
    const clientData = {
      ...quickClientForm,
      name: quickClientForm.name.trim(),
      identification: normalizeClientIdentification(quickClientForm.identification),
      email: quickClientForm.email.trim(),
      phone: quickClientForm.phone.trim(),
      address: quickClientForm.address.trim(),
      updatedAt: new Date().toISOString()
    };
    if (!clientData.name || !clientData.identification) {
      Alert.alert("Datos incompletos", "Ingrese nombre e identificacion del cliente.");
      return;
    }
    const duplicate = findDuplicateClient(data.clients, clientData.identification, selectedClient.id);
    if (duplicate) {
      Alert.alert("Cliente duplicado", `Ya existe un cliente con esa identificacion: ${duplicate.name}.`);
      return;
    }
    const updatedClient = { ...selectedClient, ...clientData };
    const existingClient = data.clients.some((client) => client.id === selectedClient.id);
    const nextClients = existingClient
      ? data.clients.map((client) => client.id === selectedClient.id ? updatedClient : client)
      : [updatedClient, ...data.clients];
    const nextData = appendAudit({
      ...data,
      clients: nextClients
    }, user, "CLIENT_UPDATED_FROM_SALE", "client", selectedClient.id, `Cliente actualizado desde venta: ${updatedClient.name}`);

    setClientId(updatedClient.id);
    setSelectedRemoteClient(updatedClient);
    setRemoteClientResults((current) => current ? {
      ...current,
      items: current.items.some((client) => client.id === updatedClient.id)
        ? current.items.map((client) => client.id === updatedClient.id ? updatedClient : client)
        : [updatedClient, ...current.items]
    } : current);
    await persist(nextData);
    await syncPatchToBackend(data.backendUrl, backendToken, { baseData: data, clients: [updatedClient], auditLogs: nextData.auditLogs.slice(0, 1) }, "Cliente pendiente de sincronizar", nextData, persist);
    setQuickClientVisible(false);
    setIssueNotice("Cliente actualizado. Puede continuar con la venta.");
    showMessage("Cliente actualizado", "Datos corregidos. Puede continuar sin perder el detalle de la venta.");
  };

  return {
    openQuickClientEditor,
    quickClientForm,
    quickClientVisible,
    saveQuickClient,
    setQuickClientForm,
    setQuickClientVisible
  };
}
