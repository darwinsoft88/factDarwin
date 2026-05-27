import React from "react";
import { StyleSheet, View } from "react-native";
import { DateRangeFilter } from "./DateRangeFilter";
import { Input, Select } from "./common";

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
  | "TICKET_OFFLINE"
  | "PROFORMA"
  | "NOTA_CREDITO";

type SalesFiltersProps = {
  search: string;
  startDate: string;
  endDate: string;
  status: string;
  onSearchChange: (value: string) => void;
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
  { label: "Firmadas", value: "FIRMADA" },
  { label: "Enviadas SRI", value: "ENVIADA" },
  { label: "Borradores", value: "BORRADOR" },
  { label: "Anuladas", value: "ANULADA" },
  { label: "Notas internas", value: "TICKET_OFFLINE" },
  { label: "Proformas", value: "PROFORMA" },
  { label: "Notas credito", value: "NOTA_CREDITO" }
];

export function SalesFilters({
  search,
  startDate,
  endDate,
  status,
  onSearchChange,
  onStartDateChange,
  onEndDateChange,
  onToday,
  onMonth,
  onClearDates,
  onStatusChange
}: SalesFiltersProps) {
  return (
    <>
      <Input label="Buscar documento" value={search} onChangeText={onSearchChange} placeholder="Cliente, cedula, secuencial o clave" autoCapitalize="none" />
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
      <Select label="Estado" value={status} onChange={onStatusChange} options={statusOptions} />
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
  }
});
