import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MODAL_EDGE_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { DateRangeFilter } from "./DateRangeFilter";
import { useAppTheme } from "../theme/AppTheme";

export type SalesStatusFilter =
  | "TODAS"
  | "AUTORIZADA"
  | "DEVUELTA"
  | "ERROR_SRI"
  | "BORRADOR"
  | "FIRMADA"
  | "ENVIADA"
  | "ENVIADA_SRI"
  | "PENDIENTE_SRI"
  | "ANULADA"
  | "CONVERTIDA"
  | "TICKET_OFFLINE"
  | "PROFORMA"
  | "NOTA_CREDITO";

type SalesFiltersProps = {
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onToday: () => void;
  onMonth: () => void;
  onClearDates: () => void;
};

type SalesStatusFilterProps = {
  status: string;
  onStatusChange: (value: string) => void;
  compact?: boolean;
};

const statusOptions = [
  { label: "Todas", value: "TODAS" },
  { label: "Autorizadas", value: "AUTORIZADA" },
  { label: "Devueltas", value: "DEVUELTA" },
  { label: "Error SRI", value: "ERROR_SRI" },
  { label: "Pendientes envio SRI", value: "FIRMADA" },
  { label: "En revision SRI", value: "ENVIADA" },
  { label: "Borradores", value: "BORRADOR" },
  { label: "Anuladas", value: "ANULADA" },
  { label: "Convertidas", value: "CONVERTIDA" },
  { label: "Notas internas", value: "TICKET_OFFLINE" },
  { label: "Proformas", value: "PROFORMA" },
  { label: "Notas credito", value: "NOTA_CREDITO" }
];

export function SalesFilters({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onToday,
  onMonth,
  onClearDates
}: SalesFiltersProps) {
  const { theme } = useAppTheme();
  return (
    <View style={[styles.saleGroupCompact, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
      <DateRangeFilter
        title="Fecha del documento"
        startValue={startDate}
        endValue={endDate}
        onStartChange={onStartDateChange}
        onEndChange={onEndDateChange}
        onToday={onToday}
        onMonth={onMonth}
        onClear={onClearDates}
      />
    </View>
  );
}

export function SalesStatusFilter({ status, onStatusChange, compact = false }: SalesStatusFilterProps) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const safeTopPadding = Platform.OS === "web" ? 20 : Math.max(insets.top, MODAL_EDGE_PADDING);
  const safeBottomPadding = Platform.OS === "web" ? 20 : Math.max(insets.bottom, MODAL_SAFE_BOTTOM_PADDING);
  const adaptiveMaxHeight = Math.max(280, windowHeight - safeTopPadding - safeBottomPadding);
  const [statusVisible, setStatusVisible] = React.useState(false);
  const selectedStatus = statusOptions.find((option) => option.value === status) || statusOptions[0];

  return (
    <>
      <View style={[styles.statusRow, compact && styles.statusRowCompact, { borderColor: theme.colors.border, backgroundColor: compact ? theme.colors.surfaceMuted : theme.colors.surface }]}>
        {!compact ? (
        <View style={styles.statusHeader}>
          <MaterialCommunityIcons name="filter-outline" size={17} color={theme.colors.primary} />
          <View style={styles.statusHeaderCopy}>
            <Text style={[styles.statusTitle, { color: theme.colors.text }]}>Estado del documento</Text>
            <Text style={[styles.label, { color: theme.colors.textMuted }]}>Seleccione qué documentos desea visualizar</Text>
          </View>
        </View>
        ) : null}
        <Pressable style={[styles.statusButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted }]} onPress={() => setStatusVisible(true)}>
          <MaterialCommunityIcons name="filter-variant" size={16} color={theme.colors.primary} />
          <Text style={[styles.statusButtonText, { color: theme.colors.text }]} numberOfLines={1}>{selectedStatus?.label || "Todas"}</Text>
          <MaterialCommunityIcons name="chevron-down" size={16} color={theme.colors.textMuted} />
        </Pressable>
      </View>
      <Modal visible={statusVisible} transparent animationType="fade" onRequestClose={() => setStatusVisible(false)}>
        <Pressable style={[styles.backdrop, { backgroundColor: theme.colors.backdrop }, Platform.OS !== "web" && { paddingTop: safeTopPadding, paddingBottom: safeBottomPadding }]} onPress={() => setStatusVisible(false)}>
          <View style={[styles.menu, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }, Platform.OS !== "web" && { maxHeight: adaptiveMaxHeight, flexShrink: 1 }]}>
            <Text style={[styles.menuTitle, { color: theme.colors.text }]}>Filtrar estado</Text>
            <ScrollView style={styles.optionList} contentContainerStyle={styles.optionGrid} showsVerticalScrollIndicator>
              {statusOptions.map((option) => {
                const active = option.value === status;
                return (
                  <Pressable
                    key={option.value}
                    style={[styles.option, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }, active && { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }]}
                    onPress={() => {
                      onStatusChange(option.value);
                      setStatusVisible(false);
                    }}
                  >
                    <Text style={[styles.optionText, { color: active ? theme.colors.primary : theme.colors.text }]} numberOfLines={1}>{option.label}</Text>
                    {active ? <MaterialCommunityIcons name="check" size={15} color={theme.colors.primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  saleGroupCompact: {
    borderWidth: 1,
    borderColor: "#e2e7f0",
    borderRadius: 8,
    padding: 10,
    gap: 8,
    backgroundColor: "#ffffff"
  },
  statusRow: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    gap: 8
  },
  statusRowCompact: {
    borderWidth: 0,
    padding: 0,
    minWidth: 112
  },
  statusHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8
  },
  statusHeaderCopy: {
    flex: 1,
    minWidth: 0
  },
  statusTitle: {
    fontSize: 13,
    fontWeight: "900"
  },
  label: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800"
  },
  statusButton: {
    alignSelf: "stretch",
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d6e0ec",
    backgroundColor: "#f8fafc",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10
  },
  statusButtonText: {
    flex: 1,
    color: "#334155",
    fontSize: 12,
    fontWeight: "900",
    maxWidth: 210
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.25)",
    justifyContent: "center",
    padding: 20
  },
  menu: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dbe4f0",
    backgroundColor: "#ffffff",
    padding: 10,
    gap: 8
  },
  menuTitle: {
    color: "#111827",
    fontWeight: "900"
  },
  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7
  },
  optionList: {
    flexShrink: 1
  },
  option: {
    minHeight: 34,
    maxWidth: "100%",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dbe4f0",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5
  },
  optionActive: {
    borderColor: "#0f766e",
    backgroundColor: "#ecfdf5"
  },
  optionText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800"
  },
  optionTextActive: {
    color: "#0f766e"
  }
});
