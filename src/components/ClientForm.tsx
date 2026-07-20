import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Client } from "../types";
import { sanitizeIntegerInput } from "../utils/numbers";
import { Input } from "./common";
import { InlineInputButton } from "./inputActions";

export type ClientFormValues = {
  name: string;
  identification: string;
  email: string;
  phone: string;
  address: string;
  identificationType: Client["identificationType"];
};

type ClientFormProps = {
  form: ClientFormValues;
  lookingUpClient: boolean;
  onChange: React.Dispatch<React.SetStateAction<ClientFormValues>>;
  onLookupIdentification: () => void;
};

const identificationOptions: { label: string; value: Client["identificationType"] }[] = [
  { label: "RUC", value: "04" },
  { label: "Cedula", value: "05" },
  { label: "Pasaporte", value: "06" },
  { label: "Consumidor final", value: "07" },
  { label: "Exterior", value: "08" }
];
const defaultIdentificationOption = identificationOptions[0] as { label: string; value: Client["identificationType"] };

export function ClientForm({ form, lookingUpClient, onChange, onLookupIdentification }: ClientFormProps) {
  return (
    <>
      <IdentificationTypeSelect
        value={form.identificationType}
        onChange={(identificationType) => onChange({ ...form, identificationType })}
      />
      <Input
        label="Numero de identificacion"
        value={form.identification}
        onChangeText={(identification) => onChange({ ...form, identification: sanitizeIdentificationInput(identification, form.identificationType) })}
        keyboardType={form.identificationType === "06" || form.identificationType === "08" ? "default" : "number-pad"}
        rightElement={<InlineInputButton label={lookingUpClient ? "..." : "Consultar"} onPress={onLookupIdentification} />}
      />
      <Input label="Razon social / Nombre" value={form.name} onChangeText={(name) => onChange({ ...form, name })} />
      <Input label="Email" value={form.email} onChangeText={(email) => onChange({ ...form, email })} autoCapitalize="none" />
      <Input label="Telefono" value={form.phone} onChangeText={(phone) => onChange({ ...form, phone: sanitizeIntegerInput(phone).slice(0, 10) })} keyboardType="phone-pad" />
      <Input label="Direccion" value={form.address} onChangeText={(address) => onChange({ ...form, address })} />
    </>
  );
}

function IdentificationTypeSelect({ value, onChange }: { value: Client["identificationType"]; onChange: (value: Client["identificationType"]) => void }) {
  const [visible, setVisible] = React.useState(false);
  const selected = identificationOptions.find((option) => option.value === value) || defaultIdentificationOption;

  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>Tipo de identificacion</Text>
      <Pressable style={styles.selectButton} onPress={() => setVisible(true)}>
        <Text style={styles.selectText}>{selected.label}</Text>
        <MaterialCommunityIcons name="chevron-down" size={17} color="#475569" />
      </Pressable>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <View style={styles.menu}>
            {identificationOptions.map((option) => {
              const active = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.option, active && styles.optionActive]}
                  onPress={() => {
                    onChange(option.value);
                    setVisible(false);
                  }}
                >
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>{option.label}</Text>
                  {active ? <MaterialCommunityIcons name="check" size={17} color="#0f766e" /> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function sanitizeIdentificationInput(value: string, type: Client["identificationType"]) {
  if (type === "06" || type === "08") return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 20);
  return sanitizeIntegerInput(value).slice(0, 13);
}

const styles = StyleSheet.create({
  inputGroup: {
    gap: 5
  },
  label: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800"
  },
  selectButton: {
    alignSelf: "flex-start",
    minWidth: 108,
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d6e0ec",
    backgroundColor: "#f8fafc",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 12
  },
  selectText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "800"
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.25)",
    justifyContent: "center",
    padding: 24
  },
  menu: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dbe4f0",
    backgroundColor: "#ffffff",
    overflow: "hidden"
  },
  option: {
    minHeight: 44,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f7"
  },
  optionActive: {
    backgroundColor: "#ecfdf5"
  },
  optionText: {
    color: "#334155",
    fontWeight: "800"
  },
  optionTextActive: {
    color: "#0f766e"
  }
});
