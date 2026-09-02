import React from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KEYBOARD_AVOIDING_BEHAVIOR, MODAL_EDGE_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { useKeyboardInset } from "../hooks/useKeyboardInset";
import { Client } from "../types";
import { Empty, Input, LoadMoreButton } from "./common";
import { SelectedClientCard } from "./SelectedClientCard";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAppTheme } from "../theme/AppTheme";
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
  onCreateClient: () => void;
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
  onCreateClient,
  onEditClient
}: SaleClientPickerProps) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const keyboardInset = useKeyboardInset();
  const androidKeyboardInset = Platform.OS === "android" ? keyboardInset : 0;
  const safeTopPadding = Platform.OS === "web" ? MODAL_EDGE_PADDING : Math.max(insets.top, MODAL_EDGE_PADDING);
  const safeBottomPadding = Platform.OS === "web" ? MODAL_SAFE_BOTTOM_PADDING : Math.max(insets.bottom, MODAL_SAFE_BOTTOM_PADDING);
  const adaptiveMaxHeight = Math.max(320, windowHeight - safeTopPadding - safeBottomPadding);
  const nativePickerHeight = Math.max(300, Math.floor(adaptiveMaxHeight * 0.92));
  const [pickerVisible, setPickerVisible] = React.useState(false);
  const selectClient = (client: Client) => {
    onClientChange(client.id, client);
    setPickerVisible(false);
  };

  return (
    <>
      <View style={styles.compactHeader}>
        <Text style={[styles.compactTitle, { color: theme.colors.text }]}>Cliente</Text>
        <View style={styles.headerActions}>
          <Pressable style={[styles.actionButton, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }]} onPress={() => setPickerVisible(true)}>
            <MaterialCommunityIcons
              name="account-switch"
              size={18}
              color={theme.colors.primary}
            />
            <Text style={[styles.actionButtonText, { color: theme.colors.primary }]}>Cambiar cliente</Text>
          </Pressable>
          <Pressable style={[styles.secondaryActionButton, { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface }]} onPress={onCreateClient}>
            <MaterialCommunityIcons name="account-plus-outline" size={17} color={theme.colors.primary} />
            <Text style={[styles.secondaryActionText, { color: theme.colors.primary }]}>Agregar</Text>
          </Pressable>
          
        </View>
      </View>
      <SelectedClientCard client={selectedClient} onEdit={onEditClient} />
      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={() => setPickerVisible(false)}>
        <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={KEYBOARD_AVOIDING_BEHAVIOR} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
          <Pressable style={[styles.modalBackdrop, { backgroundColor: theme.colors.backdrop }, Platform.OS !== "web" && { paddingTop: safeTopPadding, paddingBottom: safeBottomPadding }, androidKeyboardInset > 0 && { paddingBottom: androidKeyboardInset + safeBottomPadding }]} onPress={() => setPickerVisible(false)}>
            <Pressable style={[styles.modalSheet, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }, Platform.OS !== "web" && { height: nativePickerHeight, maxHeight: adaptiveMaxHeight, flexShrink: 1 }]}>
              <View style={styles.modalHeader}>
                <View style={styles.flex}>
                  <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Buscar cliente</Text>
                </View>
                <Pressable style={[styles.closeButton, { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface }]} onPress={() => setPickerVisible(false)}>
                  <Text style={[styles.closeButtonText, { color: theme.colors.primary }]}>Cerrar</Text>
                </Pressable>
              </View>
              <Input label="" value={search} onChangeText={onSearchChange} placeholder="Nombre, cedula o RUC" autoCapitalize="none" />
              <View style={styles.resultHeader}>
                <Text style={[styles.resultLabel, { color: theme.colors.text }]}>Clientes encontrados</Text>
                <Text style={[styles.resultCount, { color: theme.colors.textMuted }]}>{visibleClients.length}/{filteredClientCount}</Text>
              </View>
              <ScrollView style={[styles.resultsBox, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted }, Platform.OS !== "web" && styles.resultsBoxNative]} contentContainerStyle={styles.resultsContent} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {visibleClients.map((client) => {
                  const selected = client.id === selectedClientId;
                  return (
                    <Pressable key={client.id} style={[styles.clientRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }, selected && { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }]} onPress={() => selectClient(client)}>
                      <View style={styles.clientTextBlock}>
                        <Text style={[styles.clientName, { color: selected ? theme.colors.primary : theme.colors.text }]} numberOfLines={1}>{client.name}</Text>
                        <Text style={[styles.clientMeta, { color: theme.colors.textMuted }]} numberOfLines={2}>{client.identification}{client.email ? ` | ${client.email}` : ""}{client.phone ? ` | ${client.phone}` : ""}</Text>
                      </View>
                      {selected ? <Text style={[styles.selectedPill, { backgroundColor: theme.colors.successSoft, color: theme.colors.success }]}>Activo</Text> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
              {filteredClientCount === 0 ? <Empty text="No hay clientes con esa busqueda." /> : null}
              {canLoadMore ? <LoadMoreButton label="Cargar mas clientes" onPress={onLoadMore} /> : null}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  keyboardAvoiding: {
    flex: 1
  },
  compactHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  compactTitle: {
    color: "#111827",
    fontWeight: "900",
    flexShrink: 0
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    flexShrink: 1
  },
  secondaryActionButton: {
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    flexDirection: "row",
    gap: 5
  },
  secondaryActionText: {
    color: "#0f5f59",
    fontSize: 12,
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
    paddingHorizontal: 10,
    flexDirection: "row",
    gap: 6,
    flexShrink: 1
  },
  actionButtonText: {
    color: "#0f5f59",
    fontSize: 12,
    fontWeight: "900"
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.38)",
    justifyContent: "flex-end",
    paddingHorizontal: MODAL_EDGE_PADDING,
    paddingTop: MODAL_EDGE_PADDING,
    paddingBottom: MODAL_SAFE_BOTTOM_PADDING
  },
  modalSheet: {
    maxHeight: "86%",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
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
    maxHeight: 420,
    borderWidth: 1,
    borderColor: "#dbe4ee",
    borderRadius: 8,
    backgroundColor: "#ffffff"
  },
  resultsBoxNative: {
    flex: 1,
    maxHeight: undefined
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
