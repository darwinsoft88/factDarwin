import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AdditionalInfoField } from "../types";
import { EntityEditModal } from "./EntityEditModal";
import { Input } from "./common";
import { useAppTheme } from "../theme/AppTheme";

type SaleAdditionalInfoModalProps = {
  visible: boolean;
  fields: AdditionalInfoField[];
  onChange: (fields: AdditionalInfoField[]) => void;
  onClose: () => void;
};

export function SaleAdditionalInfoModal({ visible, fields, onChange, onClose }: SaleAdditionalInfoModalProps) {
  const { theme } = useAppTheme();
  const rows = fields.length ? fields : [emptyField()];

  const updateField = (id: string, patch: Partial<AdditionalInfoField>) => {
    onChange(rows.map((field) => (field.id === id ? { ...field, ...patch } : field)));
  };

  const removeField = (id: string) => {
    const nextFields = rows.filter((field) => field.id !== id);
    onChange(nextFields.length ? nextFields : [emptyField()]);
  };

  const addField = () => {
    onChange([...rows, emptyField()]);
  };

  const saveAndClose = () => {
    onChange(cleanAdditionalInfoFields(rows));
    onClose();
  };

  return (
    <EntityEditModal
      adaptiveViewport
      visible={visible}
      title="Informacion adicional"
      subtitle="Estos campos se imprimen en el RIDE y se envian al SRI."
      confirmLabel="Guardar informacion"
      onClose={onClose}
      onConfirm={saveAndClose}
    >
      {rows.map((field, index) => (
        <View key={field.id} style={[styles.rowCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted }]}>
          <View style={styles.rowHeader}>
            <Text style={[styles.rowTitle, { color: theme.colors.text }]}>Campo {index + 1}</Text>
            <Pressable style={[styles.deleteButton, { backgroundColor: theme.colors.dangerSoft }]} onPress={() => removeField(field.id)}>
              <MaterialCommunityIcons name="trash-can-outline" size={16} color={theme.colors.danger} />
            </Pressable>
          </View>
          <Input
            label="Titulo del campo"
            value={field.name}
            onChangeText={(name) => updateField(field.id, { name: limitText(name, 70) })}
            placeholder="Ej. Orden de compra"
          />
          <Input
            label="Informacion adicional"
            value={field.value}
            onChangeText={(value) => updateField(field.id, { value: limitText(value, 300) })}
            placeholder="Ej. OC-2026-001"
            multiline
            style={styles.textarea}
          />
        </View>
      ))}
      <Pressable style={[styles.addButton, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }]} onPress={addField}>
        <MaterialCommunityIcons name="plus-circle-outline" size={18} color={theme.colors.primary} />
        <Text style={[styles.addText, { color: theme.colors.primary }]}>Agregar otro campo</Text>
      </Pressable>
    </EntityEditModal>
  );
}

export function cleanAdditionalInfoFields(fields: AdditionalInfoField[]) {
  return fields
    .map((field) => ({
      id: field.id || createLocalId(),
      name: limitText(field.name, 70).trim(),
      value: limitText(field.value, 300).trim()
    }))
    .filter((field) => field.name && field.value);
}

function emptyField(): AdditionalInfoField {
  return { id: createLocalId(), name: "", value: "" };
}

function createLocalId() {
  return `info-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function limitText(value: string, maxLength: number) {
  return String(value || "").replace(/\s+/g, " ").slice(0, maxLength);
}

const styles = StyleSheet.create({
  rowCard: {
    borderWidth: 1,
    borderColor: "#dbe4ee",
    borderRadius: 8,
    padding: 10,
    gap: 8,
    backgroundColor: "#fbfdff"
  },
  rowHeader: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  rowTitle: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "900"
  },
  deleteButton: {
    width: 34,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#fee2e2",
    alignItems: "center",
    justifyContent: "center"
  },
  textarea: {
    minHeight: 76,
    textAlignVertical: "top",
    paddingTop: 10
  },
  addButton: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#99f6e4",
    backgroundColor: "#ecfdf5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7
  },
  addText: {
    color: "#0f766e",
    fontSize: 13,
    fontWeight: "900"
  }
});
