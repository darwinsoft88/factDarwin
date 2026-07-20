import React, { useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { ClientEditModal } from "../components/ClientEditModal";
import { ClientListItemProps, ClientListSection } from "../components/ClientListSection";
import { LIST_BATCH_SIZE } from "../constants/app";
import { useClientIdentityLookup } from "../hooks/useClientIdentityLookup";
import { AppData, Client, User } from "../types";
import { canDeleteCatalog, canEditCatalog } from "../utils/appAccess";
import { appendAudit } from "../utils/audit";
import { confirmAction, showMessage } from "../utils/dialogs";
import { generateId } from "../utils/id";
import { paginateItems } from "../utils/pagination";
import { syncPatchToBackend } from "../utils/sync";
import { findDuplicateClient, isConsumerFinalClient, normalizeClientIdentification } from "../validation";

export function ClientsScreen({
  data,
  user,
  backendToken,
  getBackendToken,
  persist,
  ListItemComponent
}: {
  data: AppData;
  user: User;
  backendToken: string;
  getBackendToken: (backendUrl: string) => Promise<string>;
  persist: (data: AppData) => Promise<void>;
  ListItemComponent: React.ComponentType<ClientListItemProps>;
}) {
  const emptyForm = { name: "", identification: "", email: "", phone: "", address: "", identificationType: "05" as Client["identificationType"] };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [clientPage, setClientPage] = useState(1);
  const { lookingUpClient, lookupClientIdentification } = useClientIdentityLookup({
    backendToken,
    data,
    form,
    getBackendToken,
    setClientSearch,
    setEditModalVisible,
    setEditingId,
    setForm
  });
  const filteredClients = useMemo(() => {
    const search = clientSearch.trim().toLowerCase();
    if (!search) return data.clients;
    return data.clients.filter((client) =>
      [client.name, client.identification, client.email, client.phone].some((value) => value.toLowerCase().includes(search))
    );
  }, [clientSearch, data.clients]);
  const clientPagination = paginateItems(filteredClients, clientPage, LIST_BATCH_SIZE);
  const visibleClients = clientPagination.items;
  const canDelete = canDeleteCatalog(user.role);
  const canEdit = canEditCatalog(user.role);

  useEffect(() => {
    setClientPage(1);
  }, [clientSearch]);

  const save = async () => {
    if (!canEdit) {
      Alert.alert("Acceso restringido", "Su usuario no tiene permiso para modificar clientes.");
      return;
    }

    const clientData = {
      ...form,
      name: form.name.trim(),
      identification: normalizeClientIdentification(form.identification),
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      updatedAt: new Date().toISOString()
    };

    if (!clientData.name || !clientData.identification) {
      Alert.alert("Datos incompletos", "Ingrese nombre e identificacion.");
      return;
    }

    const duplicate = findDuplicateClient(data.clients, clientData.identification, editingId);
    if (duplicate) {
      Alert.alert("Cliente duplicado", `Ya existe un cliente con esa identificacion: ${duplicate.name}.`);
      return;
    }

    if (editingId) {
      const currentClient = data.clients.find((client) => client.id === editingId);
      if (isConsumerFinalClient(currentClient)) {
        Alert.alert("Consumidor Final protegido", "Este cliente fiscal es del sistema y no debe editarse. Cree o edite el cliente real aparte.");
        return;
      }
      const updatedClient = { ...data.clients.find((client) => client.id === editingId), ...clientData, id: editingId } as Client;
      const nextData = appendAudit({ ...data, clients: data.clients.map((client) => (client.id === editingId ? updatedClient : client)) }, user, "CLIENT_UPDATED", "client", editingId, `Cliente actualizado: ${clientData.name}`);
      await persist(nextData);
      await syncPatchToBackend(data.backendUrl, backendToken, { baseData: data, clients: [updatedClient], auditLogs: nextData.auditLogs.slice(0, 1) }, "Cliente pendiente de sincronizar", nextData, persist);
      showMessage("Cliente actualizado", "Los datos del cliente se editaron con exito.");
    } else {
      const client = { id: generateId(), ...clientData };
      const nextData = appendAudit({ ...data, clients: [client, ...data.clients] }, user, "CLIENT_CREATED", "client", client.id, `Cliente creado: ${client.name}`);
      await persist(nextData);
      await syncPatchToBackend(data.backendUrl, backendToken, { baseData: data, clients: [client], auditLogs: nextData.auditLogs.slice(0, 1) }, "Cliente pendiente de sincronizar", nextData, persist);
      showMessage("Cliente guardado", "El cliente se guardo con exito.");
    }

    setEditingId("");
    setEditModalVisible(false);
    setForm(emptyForm);
  };

  const edit = (client: Client) => {
    if (!canEdit) {
      Alert.alert("Acceso restringido", "Su usuario no tiene permiso para modificar clientes.");
      return;
    }
    if (isConsumerFinalClient(client)) {
      Alert.alert("Consumidor Final protegido", "Este cliente fiscal es del sistema y no debe editarse. Cree el cliente real con su cedula/RUC.");
      return;
    }

    setEditingId(client.id);
    setForm({
      name: client.name,
      identification: client.identification,
      email: client.email,
      phone: client.phone || "",
      address: client.address,
      identificationType: client.identificationType
    });
    setEditModalVisible(true);
  };

  const openCreate = () => {
    if (!canEdit) {
      Alert.alert("Acceso restringido", "Su usuario no tiene permiso para crear clientes.");
      return;
    }
    setEditingId("");
    setForm(emptyForm);
    setEditModalVisible(true);
  };

  const cancelEdit = () => {
    setEditingId("");
    setEditModalVisible(false);
    setForm(emptyForm);
  };

  const editingClientName = data.clients.find((client) => client.id === editingId)?.name || "Cliente";

  const deleteClient = (client: Client) => {
    const clientInUse =
      data.sales.some((sale) => sale.clientId === client.id) ||
      (data.guides || []).some((guide) => guide.clientId === client.id) ||
      (data.receivedRetentions || []).some((retention) => retention.clientId === client.id);

    if (clientInUse) {
      Alert.alert("Cliente protegido", "Este cliente ya tiene documentos asociados. Para conservar el historial fiscal no se puede eliminar.");
      return;
    }

    confirmAction("Eliminar cliente", `Seguro que desea eliminar a ${client.name}? Esta accion quedara registrada en auditoria.`, () => {
      void (async () => {
        const nextData = appendAudit({ ...data, clients: data.clients.filter((item) => item.id !== client.id), deletedIds: { ...(data.deletedIds || {}), clients: Array.from(new Set([...(data.deletedIds?.clients || []), client.id])) } }, user, "CLIENT_DELETED", "client", client.id, `Cliente eliminado: ${client.name}`);
        await persist(nextData);
        await syncPatchToBackend(data.backendUrl, backendToken, { baseData: data, deletions: { clients: [client.id] }, auditLogs: nextData.auditLogs.slice(0, 1) }, "Cliente eliminado pendiente de sincronizar", nextData, persist);
        showMessage("Cliente eliminado", "El cliente se elimino con exito.");
      })();
    });
  };

  return (
    <View style={styles.stack}>
      <ClientListSection
        canDelete={canDelete}
        canEdit={canEdit}
        clientPage={clientPagination.currentPage}
        clientSearch={clientSearch}
        data={data}
        filteredClients={filteredClients}
        ListItemComponent={ListItemComponent}
        onCreate={openCreate}
        onDelete={deleteClient}
        onEdit={edit}
        setClientPage={setClientPage}
        setClientSearch={setClientSearch}
        visibleClients={visibleClients}
      />
      {canEdit ? (
        <ClientEditModal
          editingClientName={editingClientName}
          editingId={editingId}
          form={form}
          lookingUpClient={lookingUpClient}
          onChange={setForm}
          onClose={cancelEdit}
          onLookupIdentification={() => { void lookupClientIdentification(); }}
          onSave={() => { void save(); }}
          visible={editModalVisible}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12
  }
});
