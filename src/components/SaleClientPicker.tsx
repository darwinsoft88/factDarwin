import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Client } from "../types";
import { Empty, Input, LoadMoreButton } from "./common";
import { SelectedClientCard } from "./SelectedClientCard";

type SaleClientPickerProps = {
  search: string;
  selectedClientId: string;
  visibleClients: Client[];
  filteredClientCount: number;
  selectedClient?: Client;
  canLoadMore: boolean;
  onSearchChange: (value: string) => void;
  onClientChange: (value: string, client?: Client) => void;
  onLoadMore: () => void;
  onEditClient: () => void;
};

export function SaleClientPicker({
  search,
  selectedClientId,
  visibleClients,
  filteredClientCount,
  selectedClient,
  canLoadMore,
  onSearchChange,
  onClientChange,
  onLoadMore,
  onEditClient
}: SaleClientPickerProps) {
  const [pickerVisible, setPickerVisible] = React.useState(false);
  const selectClient = (client: Client) => {
    onClientChange(client.id, client);
    setPickerVisible(false);
  };

  return (
    <>
      <View style={styles.compactHeader}>
        <Text style={styles.compactTitle}>Cliente</Text>
        <Pressable style={styles.actionButton} onPress={() => setPickerVisible(true)}>
          <Text style={styles.actionButtonText}>Cambiar cliente</Text>
        </Pressable>
      </View>
      <SelectedClientCard client={selectedClient} onEdit={onEditClient} />
      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={() => setPickerVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerVisible(false)}>
          <Pressable style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.flex}>
                <Text style={styles.modalTitle}>Buscar cliente</Text>
                <Text style={styles.modalMeta}>Se muestran por bloques para trabajar rapido con bases grandes.</Text>
              </View>
              <Pressable style={styles.closeButton} onPress={() => setPickerVisible(false)}>
                <Text style={styles.closeButtonText}>Cerrar</Text>
              </Pressable>
            </View>
            <Input label="Buscar cliente" value={search} onChangeText={onSearchChange} placeholder="Nombre, cedula o RUC" autoCapitalize="none" />
            <View style={styles.resultHeader}>
              <Text style={styles.resultLabel}>Clientes encontrados</Text>
              <Text style={styles.resultCount}>{visibleClients.length}/{filteredClientCount}</Text>
            </View>
            <ScrollView style={styles.resultsBox} contentContainerStyle={styles.resultsContent} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {visibleClients.map((client) => {
                const selected = client.id === selectedClientId;
                return (
                  <Pressable key={client.id} style={[styles.clientRow, selected && styles.clientRowSelected]} onPress={() => selectClient(client)}>
                    <View style={styles.clientTextBlock}>
                      <Text style={[styles.clientName, selected && styles.clientNameSelected]} numberOfLines={1}>{client.name}</Text>
                      <Text style={styles.clientMeta} numberOfLines={2}>{client.identification}{client.email ? ` | ${client.email}` : ""}{client.phone ? ` | ${client.phone}` : ""}</Text>
                    </View>
                    {selected ? <Text style={styles.selectedPill}>Activo</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            {filteredClientCount === 0 ? <Empty text="No hay clientes con esa busqueda." /> : null}
            {canLoadMore ? <LoadMoreButton label="Cargar mas clientes" onPress={onLoadMore} /> : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  compactHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  compactTitle: {
    color: "#111827",
    fontWeight: "900"
  },
  actionButton: {
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  actionButtonText: {
    color: "#0f5f59",
    fontWeight: "900"
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.38)",
    justifyContent: "flex-end",
    padding: 12
  },
  modalSheet: {
    maxHeight: "86%",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    gap: 10
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  modalTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900"
  },
  modalMeta: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 2
  },
  flex: {
    flex: 1,
    minWidth: 0
  },
  closeButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  closeButtonText: {
    color: "#0f5f59",
    fontWeight: "900"
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  resultLabel: {
    color: "#4b5563",
    fontSize: 12,
    fontWeight: "800"
  },
  resultCount: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800"
  },
  resultsBox: {
    maxHeight: 230,
    borderWidth: 1,
    borderColor: "#dbe4ee",
    borderRadius: 8,
    backgroundColor: "#ffffff"
  },
  resultsContent: {
    gap: 6,
    padding: 8
  },
  clientRow: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#dbe4ee",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: "#f8fafc"
  },
  clientRowSelected: {
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb"
  },
  clientTextBlock: {
    flex: 1,
    minWidth: 0
  },
  clientName: {
    color: "#111827",
    fontWeight: "900"
  },
  clientNameSelected: {
    color: "#0f766e"
  },
  clientMeta: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16
  },
  selectedPill: {
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#bbf7d0",
    color: "#047857",
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 8,
    paddingVertical: 4
  }
});
