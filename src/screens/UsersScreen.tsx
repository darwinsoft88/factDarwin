import React, { useEffect, useMemo, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { EntityEditModal } from "../components/EntityEditModal";
import { Empty, Input, LoadMoreButton, Section, Select } from "../components/common";
import { LIST_BATCH_SIZE } from "../constants/app";
import { roleOptions } from "../constants/options";
import { hashPassword } from "../services/security";
import { AppData, User, UserRole } from "../types";
import { roleLabel } from "../utils/appAccess";
import { appendAudit } from "../utils/audit";
import { confirmAction, showError, showSuccess, showWarning } from "../utils/dialogs";
import { generateId } from "../utils/id";
import { syncPatchToBackend } from "../utils/sync";

type UsersListItemProps = {
  title: string;
  meta: string;
  editLabel?: string;
  onEdit?: () => void;
  onDelete?: () => void;
};

export function UsersScreen({
  data,
  user: currentUser,
  backendToken,
  persist,
  ListItemComponent
}: {
  data: AppData;
  user: User;
  backendToken: string;
  persist: (data: AppData) => Promise<void>;
  ListItemComponent: React.ComponentType<UsersListItemProps>;
}) {
  const emptyForm = useMemo(() => ({ name: "", email: "", password: "", role: "vendedor" as UserRole }), []);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [visibleUserCount, setVisibleUserCount] = useState(LIST_BATCH_SIZE);
  const filteredUsers = useMemo(() => {
    const search = userSearch.trim().toLowerCase();
    if (!search) return data.users;
    return data.users.filter((user) => [user.name, user.email, user.role, roleLabel(user.role)].some((value) => value.toLowerCase().includes(search)));
  }, [data.users, userSearch]);
  const visibleUsers = filteredUsers.slice(0, visibleUserCount);

  useEffect(() => {
    setVisibleUserCount(LIST_BATCH_SIZE);
  }, [userSearch]);

  useEffect(() => {
    if (!editingId) setForm(emptyForm);
  }, [editingId, data.users.length, emptyForm]);

  const save = async () => {
    if (savingUser) return;

    if (!form.name || !form.email || (!editingId && !form.password)) {
      showWarning("Datos incompletos", editingId ? "Ingrese nombre y correo." : "Ingrese nombre, correo y contrasena.");
      return;
    }
    const email = form.email.trim().toLowerCase();
    if (data.users.some((user) => user.id !== editingId && user.email.trim().toLowerCase() === email)) {
      showWarning("Usuario duplicado", "Ya existe un usuario con ese correo.");
      return;
    }

    setSavingUser(true);
    try {
      const successTitle = editingId ? "Usuario actualizado" : "Usuario guardado";
      const successMessage = editingId ? "El usuario se edito con exito." : "El usuario se guardo con exito.";
      let synced = false;

      if (editingId) {
        const passwordHash = form.password ? await hashPassword(form.password) : undefined;
        const updatedUser = data.users.find((user) => user.id === editingId);
        const finalUser = {
          ...updatedUser,
          id: editingId,
          name: form.name.trim(),
          email,
          role: form.role,
          ...(passwordHash ? { password: undefined, passwordHash } : {})
        } as User;
        const nextData = appendAudit({
          ...data,
          users: data.users.map((user) => user.id === editingId ? finalUser : user)
        }, currentUser, "USER_UPDATED", "user", editingId, `Usuario actualizado: ${form.name.trim()}`);
        await persist(nextData);
        synced = await syncPatchToBackend(data.backendUrl, backendToken, { baseData: data, users: [finalUser], auditLogs: nextData.auditLogs.slice(0, 1) }, "Usuario pendiente de sincronizar", nextData, persist);
      } else {
        const passwordHash = await hashPassword(form.password);
        const createdUser: User = { id: generateId(), name: form.name.trim(), email, role: form.role, passwordHash };
        const nextData = appendAudit({ ...data, users: [createdUser, ...data.users] }, currentUser, "USER_CREATED", "user", createdUser.id, `Usuario creado: ${createdUser.name}`);
        await persist(nextData);
        synced = await syncPatchToBackend(data.backendUrl, backendToken, { baseData: data, users: [createdUser], auditLogs: nextData.auditLogs.slice(0, 1) }, "Usuario pendiente de sincronizar", nextData, persist);
      }

      if (!synced) return;
      setEditingId("");
      setEditModalVisible(false);
      setForm(emptyForm);
      showSuccess(successTitle, successMessage);
    } catch (error) {
      showError("Error al guardar", error instanceof Error ? error.message : "No se pudo guardar el usuario.");
    } finally {
      setSavingUser(false);
    }
  };

  const edit = (user: User) => {
    setEditingId(user.id);
    setForm({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role
    });
    setEditModalVisible(true);
  };

  const openCreate = () => {
    setEditingId("");
    setForm(emptyForm);
    setEditModalVisible(true);
  };

  const cancelEdit = () => {
    setEditingId("");
    setEditModalVisible(false);
    setForm(emptyForm);
  };

  const renderUserForm = (isEditing: boolean) => (
    <>
      <Input key={`user-name-${isEditing ? editingId : "new"}`} label="Nombre" value={form.name} onChangeText={(name) => setForm({ ...form, name })} autoComplete="off" />
      <Input key={`user-email-${isEditing ? editingId : "new"}`} label="Correo" value={form.email} onChangeText={(email) => setForm({ ...form, email })} autoCapitalize="none" autoComplete="off" textContentType="none" importantForAutofill="no" />
      <Input key={`user-password-${isEditing ? editingId : "new"}`} label={isEditing ? "Nueva contrasena (opcional)" : "Contrasena"} value={form.password} onChangeText={(password) => setForm({ ...form, password })} secureTextEntry autoComplete="new-password" textContentType="none" importantForAutofill="no" />
      <Select label="Rol" value={form.role} onChange={(role) => setForm({ ...form, role: role as UserRole })} options={roleOptions} />
    </>
  );

  const editingUserName = data.users.find((user) => user.id === editingId)?.name || "Usuario";

  const renderEditModal = () => (
    <EntityEditModal
      visible={editModalVisible}
      title={editingId ? "Editar usuario" : "Nuevo usuario"}
      subtitle={editingId ? editingUserName : "Cree el acceso del colaborador"}
      onClose={cancelEdit}
      onConfirm={() => { void save(); }}
      confirmLabel={editingId ? "Guardar cambios" : "Guardar usuario"}
      confirming={savingUser}
    >
      {renderUserForm(Boolean(editingId))}
    </EntityEditModal>
  );

  return (
    <View style={styles.stack}>
      <Section title="">
        <View style={styles.headerRow}>
          <Text style={styles.title}>Usuarios guardados</Text>
          <Pressable style={styles.addButton} onPress={openCreate}>
            <MaterialCommunityIcons name="account-plus-outline" size={15} color="#ffffff" />
            <Text style={styles.addButtonText}>Agregar</Text>
          </Pressable>
        </View>
        <Input label="Buscar usuarios" value={userSearch} onChangeText={setUserSearch} placeholder="Nombre, correo o rol" autoCapitalize="none" />
        {data.users.length === 0 ? <Empty text="Aun no hay usuarios." /> : null}
        {data.users.length > 0 && filteredUsers.length === 0 ? <Empty text="No hay usuarios con esa busqueda." /> : null}
        {visibleUsers.map((user) => (
          <ListItemComponent
            key={user.id}
            title={user.name}
            meta={`${user.email} | ${roleLabel(user.role)}`}
            editLabel="Editar"
            onEdit={() => edit(user)}
            onDelete={user.id === currentUser.id ? undefined : () => confirmAction("Eliminar usuario", `Seguro que desea eliminar a ${user.name}? Esta accion quedara registrada en auditoria.`, () => {
              void (async () => {
                if (user.role === "admin" && data.users.filter((item) => item.role === "admin").length <= 1) {
                  showWarning("Admin requerido", "Debe existir al menos un usuario administrador.");
                  return;
                }
                const nextData = appendAudit({ ...data, users: data.users.filter((item) => item.id !== user.id), deletedIds: { ...(data.deletedIds || {}), users: Array.from(new Set([...(data.deletedIds?.users || []), user.id])) } }, currentUser, "USER_DELETED", "user", user.id, `Usuario eliminado: ${user.name}`);
                await persist(nextData);
                await syncPatchToBackend(data.backendUrl, backendToken, { baseData: data, deletions: { users: [user.id] }, auditLogs: nextData.auditLogs.slice(0, 1) }, "Usuario eliminado pendiente de sincronizar", nextData, persist);
                showSuccess("Usuario eliminado", "El usuario se elimino con exito.");
              })();
            })}
          />
        ))}
        {visibleUsers.length < filteredUsers.length ? <LoadMoreButton label="Cargar mas usuarios" onPress={() => setVisibleUserCount((count) => count + LIST_BATCH_SIZE)} /> : null}
      </Section>
      {renderEditModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12
  },
  headerRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  title: {
    color: "#1f2937",
    flex: 1,
    fontSize: 17,
    fontWeight: "800"
  },
  addButton: {
    minHeight: 34,
    borderRadius: 8,
    backgroundColor: "#0f766e",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: 10
  },
  addButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900"
  }
});
