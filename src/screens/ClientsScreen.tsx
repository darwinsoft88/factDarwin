import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ClientEditModal } from "../components/ClientEditModal";
import type { ClientFormValues } from "../components/ClientForm";
import { ClientListItemProps, ClientListSection } from "../components/ClientListSection";
import { LIST_BATCH_SIZE } from "../constants/app";
import { useClientIdentityLookup } from "../hooks/useClientIdentityLookup";
import type { PersistMutation } from "../hooks/useSyncAndBackup";
import { AppData, Client, User } from "../types";
import { canDeleteCatalog, canEditCatalog } from "../utils/appAccess";
import { appendAudit } from "../utils/audit";
import {
  confirmAction,
  showError,
  showSuccess,
  showWarning
} from "../utils/dialogs";
import { generateId } from "../utils/id";
import { paginateItems } from "../utils/pagination";
import { syncPatchToBackend } from "../utils/sync";
import { findDuplicateClient, isConsumerFinalClient, normalizeClientIdentification } from "../validation";

export function ClientsScreen({
  data,
  user,
  backendToken,
  getBackendToken,
  persistMutation,
  ListItemComponent
}: {
  data: AppData;
  user: User;
  backendToken: string;
  getBackendToken: (backendUrl: string) => Promise<string>;
  persistMutation: PersistMutation;
  ListItemComponent: React.ComponentType<ClientListItemProps>;
}) {
  const emptyForm: ClientFormValues = { name: "", identification: "", email: "", phone: "", address: "", identificationType: "05", defaultSalePriceTier: "pvp1" };
  const [form, setForm] = useState<ClientFormValues>(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
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
    if (savingClient) return;

    if (!canEdit) {
      showWarning("Acceso restringido", "Su usuario no tiene permiso para modificar clientes.");
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
      showWarning("Datos incompletos", "Ingrese nombre e identificacion.");
      return;
    }

    const duplicate = findDuplicateClient(data.clients, clientData.identification, editingId);
    if (duplicate) {
      showWarning("Cliente duplicado", `Ya existe un cliente con esa identificacion: ${duplicate.name}.`);
      return;
    }

    setSavingClient(true);
    try {
      const successMessage = editingId
        ? (["Cliente actualizado", "Los datos del cliente se editaron con exito."] as const)
        : (["Cliente guardado", "El cliente se guardo con exito."] as const);

      if (editingId) {
        const currentClient = data.clients.find((client) => client.id === editingId);
        if (isConsumerFinalClient(currentClient)) {
          showWarning("Consumidor Final protegido", "Este cliente fiscal es del sistema y no debe editarse. Cree o edite el cliente real aparte.");
          return;
        }
        const updatedClient = { ...currentClient, ...clientData, id: editingId } as Client;
        const nextData = appendAudit({ ...data, clients: data.clients.map((client) => (client.id === editingId ? updatedClient : client)) }, user, "CLIENT_UPDATED", "client", editingId, `Cliente actualizado: ${clientData.name}`);
        await persistMutation(() => nextData, { skipAutoBackup: true, syncState: "pending" });
        const synced = await syncPatchToBackend(data.backendUrl, backendToken, { baseData: data, clients: [updatedClient], auditLogs: nextData.auditLogs.slice(0, 1) }, "Cliente pendiente de sincronizar", { persistMutation });
        if (!synced) return;
      } else {
        const client = { id: generateId(), ...clientData };
        const nextData = appendAudit({ ...data, clients: [client, ...data.clients] }, user, "CLIENT_CREATED", "client", client.id, `Cliente creado: ${client.name}`);
        await persistMutation(() => nextData, { skipAutoBackup: true, syncState: "pending" });
        const synced = await syncPatchToBackend(data.backendUrl, backendToken, { baseData: data, clients: [client], auditLogs: nextData.auditLogs.slice(0, 1) }, "Cliente pendiente de sincronizar", { persistMutation });
        if (!synced) return;
      }

      setEditingId("");
      setEditModalVisible(false);
      setForm(emptyForm);
      showSuccess(successMessage[0], successMessage[1]);
    } catch (error) {
      showError("Error al guardar", error instanceof Error ? error.message : "No se pudo guardar el cliente.");
    } finally {
      setSavingClient(false);
    }
  };

  const edit = (client: Client) => {
    if (!canEdit) {
      showWarning("Acceso restringido", "Su usuario no tiene permiso para modificar clientes.");
      return;
    }
    if (isConsumerFinalClient(client)) {
      showWarning("Consumidor Final protegido", "Este cliente fiscal es del sistema y no debe editarse. Cree el cliente real con su cedula/RUC.");
      return;
    }

    setEditingId(client.id);
    setForm({
      name: client.name,
      identification: client.identification,
      email: client.email,
      phone: client.phone || "",
      address: client.address,
      identificationType: client.identificationType,
      defaultSalePriceTier: client.defaultSalePriceTier || "pvp1"
    });
    setEditModalVisible(true);
  };

  const openCreate = () => {
    if (!canEdit) {
      showWarning("Acceso restringido", "Su usuario no tiene permiso para crear clientes.");
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
      showWarning("Cliente protegido", "Este cliente ya tiene documentos asociados. Para conservar el historial fiscal no se puede eliminar.");
      return;
    }

    confirmAction("Eliminar cliente", `Seguro que desea eliminar a ${client.name}? Esta accion quedara registrada en auditoria.`, () => {
      void (async () => {
        const nextData = appendAudit({ ...data, clients: data.clients.filter((item) => item.id !== client.id), deletedIds: { ...(data.deletedIds || {}), clients: Array.from(new Set([...(data.deletedIds?.clients || []), client.id])) } }, user, "CLIENT_DELETED", "client", client.id, `Cliente eliminado: ${client.name}`);
        await persistMutation(() => nextData, { skipAutoBackup: true, syncState: "pending" });
        await syncPatchToBackend(data.backendUrl, backendToken, { baseData: data, deletions: { clients: [client.id] }, auditLogs: nextData.auditLogs.slice(0, 1) }, "Cliente eliminado pendiente de sincronizar", { persistMutation });
        showSuccess("Cliente eliminado", "El cliente se elimino con exito.");
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
          saving={savingClient}
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
