import { useState } from "react";
import { Alert } from "react-native";
import { lookupIdentityData } from "../services/backend";
import { syncPatchToBackend } from "../utils/sync";
import { AppData, Client, User } from "../types";
import type { ClientFormValues } from "../components/ClientForm";
import { canEditCatalog } from "../utils/appAccess";
import { appendAudit } from "../utils/audit";
import { showMessage } from "../utils/dialogs";
import { generateId } from "../utils/id";
import { findDuplicateClient, isConsumerFinalClient, normalizeClientIdentification } from "../validation";

export type QuickClientForm = ClientFormValues;

export type QuickClientMode = "create" | "edit";

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
  const [quickClientMode, setQuickClientMode] = useState<QuickClientMode>("edit");
  const [lookingUpQuickClient, setLookingUpQuickClient] = useState(false);

  const openQuickClientCreator = () => {
    if (!canEditCatalog(user.role)) {
      Alert.alert("Acceso restringido", "Su usuario no tiene permiso para crear clientes.");
      return;
    }
    setQuickClientMode("create");
    setQuickClientForm(emptyQuickClientForm);
    setQuickClientVisible(true);
  };

  const openQuickClientEditor = () => {
    if (!canEditCatalog(user.role)) {
      Alert.alert("Acceso restringido", "Su usuario no tiene permiso para modificar clientes.");
      return;
    }
    if (!selectedClient) {
      Alert.alert("Cliente requerido", "Seleccione un cliente para editarlo.");
      return;
    }
    if (isConsumerFinalClient(selectedClient)) {
      Alert.alert("Consumidor Final protegido", "Este cliente fiscal no se edita. Seleccione o cree el cliente real con su cedula/RUC.");
      return;
    }
    setQuickClientMode("edit");
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
    if (!canEditCatalog(user.role)) {
      Alert.alert("Acceso restringido", "Su usuario no tiene permiso para modificar clientes.");
      return;
    }

    const isCreating = quickClientMode === "create";
    if (!isCreating && !selectedClient) return;
    if (!isCreating && isConsumerFinalClient(selectedClient)) {
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
    const duplicate = findDuplicateClient(data.clients, clientData.identification, isCreating ? undefined : selectedClient?.id);
    if (duplicate) {
      Alert.alert("Cliente duplicado", `Ya existe un cliente con esa identificacion: ${duplicate.name}.`);
      return;
    }

    if (isCreating) {
      const createdClient: Client = { id: generateId(), ...clientData };
      const nextData = appendAudit({
        ...data,
        clients: [createdClient, ...data.clients]
      }, user, "CLIENT_CREATED_FROM_SALE", "client", createdClient.id, `Cliente creado desde venta: ${createdClient.name}`);

      setClientId(createdClient.id);
      setSelectedRemoteClient(createdClient);
      setRemoteClientResults((current) => current ? {
        ...current,
        total: current.total + 1,
        items: [createdClient, ...current.items.filter((client) => client.id !== createdClient.id)]
      } : current);
      await persist(nextData);
      await syncPatchToBackend(data.backendUrl, backendToken, { baseData: data, clients: [createdClient], auditLogs: nextData.auditLogs.slice(0, 1) }, "Cliente pendiente de sincronizar", nextData, persist);
      setQuickClientVisible(false);
      setQuickClientMode("edit");
      setIssueNotice("Cliente creado y seleccionado. Puede continuar con la venta.");
      showMessage("Cliente guardado", "El cliente se creo y quedo seleccionado para esta venta.");
      return;
    }

    const clientToUpdate = selectedClient as Client;
    const updatedClient: Client = { ...clientToUpdate, ...clientData };
    const existingClient = data.clients.some((client) => client.id === clientToUpdate.id);
    const nextClients = existingClient
      ? data.clients.map((client) => client.id === clientToUpdate.id ? updatedClient : client)
      : [updatedClient, ...data.clients];
    const nextData = appendAudit({
      ...data,
      clients: nextClients
    }, user, "CLIENT_UPDATED_FROM_SALE", "client", clientToUpdate.id, `Cliente actualizado desde venta: ${updatedClient.name}`);

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

  const lookupQuickClientIdentification = async () => {
    const identification = normalizeClientIdentification(quickClientForm.identification);
    if (!identification) {
      Alert.alert("Identificacion requerida", "Ingrese una cedula o RUC para consultar.");
      return;
    }

    const existingClient = data.clients.find((client) => normalizeClientIdentification(client.identification) === identification);
    if (existingClient) {
      setQuickClientMode("edit");
      setQuickClientForm({
        name: existingClient.name,
        identification: existingClient.identification,
        email: existingClient.email,
        phone: existingClient.phone || "",
        address: existingClient.address,
        identificationType: existingClient.identificationType
      });
      setClientId(existingClient.id);
      setSelectedRemoteClient(existingClient);
      Alert.alert("Cliente ya existe", `Se cargo el cliente guardado: ${existingClient.name}.`);
      return;
    }

    if (!backendToken) {
      Alert.alert("Sesion requerida", "Inicie sesion con conexion al servidor para consultar cedula o RUC.");
      return;
    }

    setLookingUpQuickClient(true);
    try {
      const result = await lookupIdentityData(data.backendUrl, identification, backendToken);
      setQuickClientForm((current) => ({
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
      setLookingUpQuickClient(false);
    }
  };

  return {
    lookingUpQuickClient,
    lookupQuickClientIdentification,
    openQuickClientCreator,
    openQuickClientEditor,
    quickClientForm,
    quickClientMode,
    quickClientVisible,
    saveQuickClient,
    setQuickClientForm,
    setQuickClientVisible
  };
}
