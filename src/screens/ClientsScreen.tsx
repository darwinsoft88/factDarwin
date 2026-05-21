import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Empty, Input, LoadMoreButton, PrimaryButton, Section, Select } from "../components/common";
import { InlineInputButton } from "../components/inputActions";
import { LIST_BATCH_SIZE } from "../constants/app";
import { lookupIdentityData } from "../services/backend";
import { AppData, Client, User } from "../types";
import { canDeleteCatalog, canEditCatalog } from "../utils/appAccess";
import { appendAudit } from "../utils/audit";
import { confirmAction, showMessage } from "../utils/dialogs";
import { generateId } from "../utils/id";
import { syncPatchToBackend } from "../utils/sync";
import { findDuplicateClient, normalizeClientIdentification } from "../validation";

type ClientsListItemProps = {
  title: string;
  meta: string;
  editLabel?: string;
  onEdit?: () => void;
  onDelete?: () => void;
};

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
  ListItemComponent: React.ComponentType<ClientsListItemProps>;
}) {
  const emptyForm = { name: "", identification: "", email: "", phone: "", address: "", identificationType: "05" as Client["identificationType"] };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [visibleClientCount, setVisibleClientCount] = useState(LIST_BATCH_SIZE);
  const [lookingUpClient, setLookingUpClient] = useState(false);
  const filteredClients = useMemo(() => {
    const search = clientSearch.trim().toLowerCase();
    if (!search) return data.clients;
    return data.clients.filter((client) =>
      [client.name, client.identification, client.email, client.phone].some((value) => value.toLowerCase().includes(search))
    );
  }, [clientSearch, data.clients]);
  const visibleClients = filteredClients.slice(0, visibleClientCount);
  const canDelete = canDeleteCatalog(user.role);
  const canEdit = canEditCatalog(user.role);

  useEffect(() => {
    setVisibleClientCount(LIST_BATCH_SIZE);
  }, [clientSearch]);

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
    setForm(emptyForm);
  };

  const edit = (client: Client) => {
    if (!canEdit) {
      Alert.alert("Acceso restringido", "Su usuario no tiene permiso para modificar clientes.");
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
  };

  return (
    <View style={styles.stack}>
      {canEdit ? (
        <Section title={editingId ? "Editar cliente" : "Nuevo cliente"}>
          <Input label="Nombre / razon social" value={form.name} onChangeText={(name) => setForm({ ...form, name })} />
          <Input
            label="Identificacion"
            value={form.identification}
            onChangeText={(identification) => setForm({ ...form, identification })}
            keyboardType="number-pad"
            rightElement={<InlineInputButton label={lookingUpClient ? "..." : "Consultar"} onPress={() => { void lookupClientIdentification(); }} />}
          />
          <Select
            label="Tipo"
            value={form.identificationType}
            onChange={(identificationType) => setForm({ ...form, identificationType: identificationType as Client["identificationType"] })}
            options={[
              { label: "RUC", value: "04" },
              { label: "Cedula", value: "05" },
              { label: "Pasaporte", value: "06" },
              { label: "Consumidor final", value: "07" },
              { label: "Exterior", value: "08" }
            ]}
          />
          <Input label="Email" value={form.email} onChangeText={(email) => setForm({ ...form, email })} autoCapitalize="none" />
          <Input label="Telefono WhatsApp" value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} keyboardType="phone-pad" />
          <Input label="Direccion" value={form.address} onChangeText={(address) => setForm({ ...form, address })} />
          {editingId ? (
            <Pressable style={styles.smallButton} onPress={() => { setEditingId(""); setForm(emptyForm); }}>
              <Text style={styles.smallButtonText}>Cancelar edicion</Text>
            </Pressable>
          ) : null}
          <PrimaryButton label="Guardar cliente" onPress={save} />
        </Section>
      ) : null}

      <Section title="Clientes guardados">
        <Input label="Buscar clientes guardados" value={clientSearch} onChangeText={setClientSearch} placeholder="Nombre, identificacion, email o telefono" autoCapitalize="none" />
        {data.clients.length === 0 ? <Empty text="Aun no hay clientes." /> : null}
        {data.clients.length > 0 && filteredClients.length === 0 ? <Empty text="No hay clientes con esa busqueda." /> : null}
        {visibleClients.map((client) => {
          const clientInUse =
            data.sales.some((sale) => sale.clientId === client.id) ||
            (data.guides || []).some((guide) => guide.clientId === client.id) ||
            (data.receivedRetentions || []).some((retention) => retention.clientId === client.id);
          return (
            <ListItemComponent
              key={client.id}
              title={client.name}
              meta={`${client.identification} | ${client.email} | ${client.phone || "sin telefono"}`}
              editLabel={canEdit ? "Editar" : undefined}
              onEdit={() => edit(client)}
              onDelete={canDelete ? () => {
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
              } : undefined}
            />
          );
        })}
        {visibleClients.length < filteredClients.length ? <LoadMoreButton label="Cargar mas clientes" onPress={() => setVisibleClientCount((count) => count + LIST_BATCH_SIZE)} /> : null}
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12
  },
  smallButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  smallButtonText: {
    color: "#0f5f59",
    fontWeight: "900"
  }
});
