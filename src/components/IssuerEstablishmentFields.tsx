import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Issuer, IssuerEstablishment } from "../types";
import { sanitizeIntegerInput } from "../utils/numbers";
import { useAppTheme } from "../theme/AppTheme";
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
  const { theme } = useAppTheme();
  const [advancedVisible, setAdvancedVisible] = useState(false);
  return (
    <>
      <Text style={[styles.groupTitle, { color: theme.colors.primary }]}>Establecimiento activo</Text>
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
      <Pressable onPress={() => setAdvancedVisible((visible) => !visible)} style={[styles.advancedToggle, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surfaceMuted }]}>
        <Text style={[styles.advancedToggleText, { color: theme.colors.text }]}>{advancedVisible ? "Ocultar configuración avanzada" : "Configuración avanzada · Secuenciales"}</Text>
      </Pressable>
      {advancedVisible ? (
        <View style={styles.advancedFields}>
          <Text style={[styles.advancedHint, { color: theme.colors.textMuted }]}>Estos valores controlan la numeración fiscal. Modifícalos únicamente con información verificada o asistencia de soporte.</Text>
          <Input label="Siguiente secuencial" value={sequentialText} onChangeText={(value) => onSequentialChange(sanitizeIntegerInput(value))} keyboardType="number-pad" />
          <Input label="Siguiente secuencial guía" value={remissionSequentialText} onChangeText={(value) => onRemissionSequentialChange(sanitizeIntegerInput(value))} keyboardType="number-pad" />
          <Input label="Siguiente secuencial nota de crédito" value={creditNoteSequentialText} onChangeText={(value) => onCreditNoteSequentialChange(sanitizeIntegerInput(value))} keyboardType="number-pad" />
        </View>
      ) : null}
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
  },
  advancedToggle: { alignItems: "center", borderRadius: 10, borderWidth: 1, padding: 11 },
  advancedToggleText: { fontSize: 12, fontWeight: "900" },
  advancedFields: { gap: 10 },
  advancedHint: { fontSize: 12, lineHeight: 18 }
});
