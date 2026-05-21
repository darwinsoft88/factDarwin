import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { documentTypeOptions } from "../constants/options";
import { DocumentType, Sale } from "../types";
import { Select } from "./common";

type DocumentTypeSelectorProps = {
  value: DocumentType;
  editingSale?: Sale;
  sourceTicket?: Sale;
  sourceProforma?: Sale;
  onChange: (value: DocumentType) => void;
};

export function DocumentTypeSelector({ value, editingSale, sourceTicket, sourceProforma, onChange }: DocumentTypeSelectorProps) {
  const selectedValue = sourceTicket ? "factura" : sourceProforma ? value : editingSale ? editingSale.documentType || "factura" : value;
  const effectiveValue = editingSale?.documentType || value;
  const infoText = effectiveValue === "proforma"
    ? "Cotizacion: no descuenta inventario y no se envia al SRI."
    : effectiveValue === "nota_venta"
      ? "Movimiento interno: descuenta inventario y no se envia al SRI."
      : "Documento tributario: se firma y autoriza en el SRI.";

  return (
    <View style={styles.container}>
      <Select
        label="Seleccionar tipo de documento"
        value={selectedValue}
        onChange={(nextValue) => !editingSale && !sourceTicket && !sourceProforma && onChange(nextValue as DocumentType)}
        options={documentTypeOptions}
      />
      <Text style={styles.inlineInfo}>{infoText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8
  },
  inlineInfo: {
    color: "#4b5563",
    lineHeight: 18
  }
});
