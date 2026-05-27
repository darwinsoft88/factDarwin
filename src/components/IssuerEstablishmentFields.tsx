import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Issuer, IssuerEstablishment } from "../types";
import { sanitizeIntegerInput } from "../utils/numbers";
import { Input, Select } from "./common";

type IssuerEstablishmentFieldsProps = {
  issuer: Issuer;
  establishments: IssuerEstablishment[];
  selectedEstablishment: IssuerEstablishment;
  establishmentNameText: string;
  establishmentCodeText: string;
  emissionPointText: string;
  sequentialText: string;
  remissionSequentialText: string;
  creditNoteSequentialText: string;
  onSelectEstablishment: (id: string) => void;
  onEstablishmentNameChange: (value: string) => void;
  onEstablishmentCodeChange: (value: string) => void;
  onEmissionPointChange: (value: string) => void;
  onEstablishmentPatch: (patch: Partial<IssuerEstablishment>) => void;
  onSequentialChange: (value: string) => void;
  onRemissionSequentialChange: (value: string) => void;
  onCreditNoteSequentialChange: (value: string) => void;
};

export function IssuerEstablishmentFields({
  issuer,
  establishments,
  selectedEstablishment,
  establishmentNameText,
  establishmentCodeText,
  emissionPointText,
  sequentialText,
  remissionSequentialText,
  creditNoteSequentialText,
  onSelectEstablishment,
  onEstablishmentNameChange,
  onEstablishmentCodeChange,
  onEmissionPointChange,
  onEstablishmentPatch,
  onSequentialChange,
  onRemissionSequentialChange,
  onCreditNoteSequentialChange
}: IssuerEstablishmentFieldsProps) {
  return (
    <>
      <Text style={styles.groupTitle}>Establecimiento activo</Text>
      <Select
        label="Sucursal / punto de emision"
        value={selectedEstablishment.id}
        onChange={onSelectEstablishment}
        options={establishments.map((item) => ({ label: `${item.name} ${item.establishment}-${item.emissionPoint}`, value: item.id }))}
      />
      <Input label="Nombre establecimiento" value={establishmentNameText} onChangeText={onEstablishmentNameChange} />
      <View style={styles.row}>
        <View style={styles.flex}>
          <Input label="Estab." value={establishmentCodeText} onChangeText={(value) => onEstablishmentCodeChange(value.replace(/\D/g, "").slice(0, 3))} keyboardType="number-pad" />
        </View>
        <View style={styles.flex}>
          <Input label="Pto. emi." value={emissionPointText} onChangeText={(value) => onEmissionPointChange(value.replace(/\D/g, "").slice(0, 3))} keyboardType="number-pad" />
        </View>
      </View>
      <Input label="Direccion establecimiento" value={selectedEstablishment.address || issuer.address} onChangeText={(address) => onEstablishmentPatch({ address })} />
      <Input label="Siguiente secuencial" value={sequentialText} onChangeText={(value) => onSequentialChange(sanitizeIntegerInput(value))} keyboardType="number-pad" />
      <Input label="Siguiente secuencial guia" value={remissionSequentialText} onChangeText={(value) => onRemissionSequentialChange(sanitizeIntegerInput(value))} keyboardType="number-pad" />
      <Input label="Siguiente secuencial nota credito" value={creditNoteSequentialText} onChangeText={(value) => onCreditNoteSequentialChange(sanitizeIntegerInput(value))} keyboardType="number-pad" />
    </>
  );
}

const styles = StyleSheet.create({
  groupTitle: {
    color: "#0f766e",
    fontSize: 14,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: 10
  },
  flex: {
    flex: 1,
    minWidth: 130
  }
});
