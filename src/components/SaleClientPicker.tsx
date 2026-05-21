import React from "react";
import { Client } from "../types";
import { Empty, Input, LoadMoreButton, Select } from "./common";
import { SelectedClientCard } from "./SelectedClientCard";

type SaleClientPickerProps = {
  search: string;
  selectedClientId: string;
  visibleClients: Client[];
  filteredClientCount: number;
  selectedClient?: Client;
  canLoadMore: boolean;
  onSearchChange: (value: string) => void;
  onClientChange: (value: string) => void;
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
  return (
    <>
      <Input label="Buscar cliente" value={search} onChangeText={onSearchChange} placeholder="Nombre, cedula o RUC" autoCapitalize="none" />
      <Select label={`Seleccionar cliente (${visibleClients.length}/${filteredClientCount})`} value={selectedClientId} onChange={onClientChange} options={visibleClients.map((item) => ({ label: item.name, value: item.id }))} />
      {filteredClientCount === 0 ? <Empty text="No hay clientes con esa busqueda." /> : null}
      {canLoadMore ? <LoadMoreButton label="Cargar mas clientes" onPress={onLoadMore} /> : null}
      <SelectedClientCard client={selectedClient} onEdit={onEditClient} />
    </>
  );
}
