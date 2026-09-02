import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Empty, Input, Section } from "./common";
import { PaginationControls } from "./PaginationControls";
import { LIST_BATCH_SIZE } from "../constants/app";
import { AppData, Client } from "../types";
import { useAppTheme } from "../theme/AppTheme";
import { clientSalePriceTier } from "../utils/productPrices";

export type ClientListItemProps = {
  title: string;
  meta: string;
  accentTone?: "primary" | "success" | "warning" | "danger" | "info";
  editLabel?: string;
  onEdit?: () => void;
  onDelete?: () => void;
};

type ClientListSectionProps = {
  canDelete: boolean;
  canEdit: boolean;
  clientPage: number;
  clientSearch: string;
  data: AppData;
  filteredClients: Client[];
  ListItemComponent: React.ComponentType<ClientListItemProps>;
  onDelete: (client: Client) => void;
  onEdit: (client: Client) => void;
  onCreate?: () => void;
  setClientPage: (page: number) => void;
  setClientSearch: (value: string) => void;
  visibleClients: Client[];
};

export function ClientListSection({
  canDelete,
  canEdit,
  clientPage,
  clientSearch,
  data,
  filteredClients,
  ListItemComponent,
  onDelete,
  onEdit,
  onCreate,
  setClientPage,
  setClientSearch,
  visibleClients
}: ClientListSectionProps) {
  const { theme } = useAppTheme();
  return (
    <Section title="">
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Clientes guardados</Text>
        {canEdit && onCreate ? (
          <Pressable style={[styles.addButton, { backgroundColor: theme.colors.primary }]} onPress={onCreate}>
            <MaterialCommunityIcons name="account-plus-outline" size={15} color={theme.colors.onPrimary} />
            <Text style={[styles.addButtonText, { color: theme.colors.onPrimary }]}>Agregar</Text>
          </Pressable>
        ) : null}
      </View>
      <Input label="Buscar clientes guardados" value={clientSearch} onChangeText={setClientSearch} placeholder="Nombre, identificacion, email o telefono" autoCapitalize="none" />
      {data.clients.length === 0 ? <Empty text="Aun no hay clientes." /> : null}
      {data.clients.length > 0 && filteredClients.length === 0 ? <Empty text="No hay clientes con esa busqueda." /> : null}
      {visibleClients.map((client) => (
        <ListItemComponent
          key={client.id}
          title={client.name}
          meta={`${client.identification} | ${client.email || "sin email"} | ${client.phone || "sin telefono"} | ${clientSalePriceTier(client).toUpperCase()}`}
          accentTone="primary"
          editLabel={canEdit ? "Editar" : undefined}
          onEdit={() => onEdit(client)}
          onDelete={canDelete ? () => onDelete(client) : undefined}
        />
      ))}
      <PaginationControls page={clientPage} pageSize={LIST_BATCH_SIZE} totalItems={filteredClients.length} onPageChange={setClientPage} />
    </Section>
  );
}

const styles = StyleSheet.create({
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
