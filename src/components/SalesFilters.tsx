import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { DateRangeFilter } from "./DateRangeFilter";

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
  status: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onToday: () => void;
  onMonth: () => void;
  onClearDates: () => void;
  onStatusChange: (value: string) => void;
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
  status,
  onStartDateChange,
  onEndDateChange,
  onToday,
  onMonth,
  onClearDates,
  onStatusChange
}: SalesFiltersProps) {
  const [statusVisible, setStatusVisible] = React.useState(false);
  const selectedStatus = statusOptions.find((option) => option.value === status) || statusOptions[0];

  return (
    <>
      <View style={styles.saleGroupCompact}>
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
      <View style={styles.statusRow}>
        <Text style={styles.label}>Estado</Text>
        <Pressable style={styles.statusButton} onPress={() => setStatusVisible(true)}>
          <MaterialCommunityIcons name="filter-variant" size={16} color="#0f766e" />
          <Text style={styles.statusButtonText} numberOfLines={1}>{selectedStatus?.label || "Todas"}</Text>
          <MaterialCommunityIcons name="chevron-down" size={16} color="#475569" />
        </Pressable>
      </View>
      <Modal visible={statusVisible} transparent animationType="fade" onRequestClose={() => setStatusVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setStatusVisible(false)}>
          <View style={styles.menu}>
            <Text style={styles.menuTitle}>Filtrar estado</Text>
            <View style={styles.optionGrid}>
              {statusOptions.map((option) => {
                const active = option.value === status;
                return (
                  <Pressable
                    key={option.value}
                    style={[styles.option, active && styles.optionActive]}
                    onPress={() => {
                      onStatusChange(option.value);
                      setStatusVisible(false);
                    }}
                  >
                    <Text style={[styles.optionText, active && styles.optionTextActive]} numberOfLines={1}>{option.label}</Text>
                    {active ? <MaterialCommunityIcons name="check" size={15} color="#0f766e" /> : null}
                  </Pressable>
                );
              })}
            </View>
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
    gap: 5
  },
  label: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800"
  },
  statusButton: {
    alignSelf: "flex-start",
    minHeight: 36,
    maxWidth: "100%",
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
