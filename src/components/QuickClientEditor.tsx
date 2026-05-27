import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Client } from "../types";
import { sanitizeIntegerInput } from "../utils/numbers";
import { Input, PrimaryButton, Select } from "./common";

type QuickClientForm = {
  name: string;
  identification: string;
  email: string;
  phone: string;
  address: string;
  identificationType: Client["identificationType"];
};

type QuickClientEditorProps = {
  visible: boolean;
  form: QuickClientForm;
  onChange: (form: QuickClientForm) => void;
  onSave: () => void;
  onClose: () => void;
};

export function QuickClientEditor({ visible, form, onChange, onSave, onClose }: QuickClientEditorProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.creditModalBackdrop}>
        <View style={styles.quickClientModal}>
          <View style={styles.creditModalHeader}>
            <View style={styles.flex}>
              <Text style={styles.creditModalTitle}>Editar cliente</Text>
              <Text style={styles.creditModalMeta}>Corrija los datos sin salir de la venta.</Text>
            </View>
            <Pressable style={styles.smallButton} onPress={onClose}>
              <Text style={styles.smallButtonText}>Cerrar</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.creditModalContent} keyboardShouldPersistTaps="handled">
            <Input label="Nombre / razon social" value={form.name} onChangeText={(name) => onChange({ ...form, name })} />
            <Input label="Identificacion" value={form.identification} onChangeText={(identification) => onChange({ ...form, identification: sanitizeIntegerInput(identification).slice(0, 13) })} keyboardType="number-pad" />
            <Select
              label="Tipo"
              value={form.identificationType}
              onChange={(identificationType) => onChange({ ...form, identificationType: identificationType as Client["identificationType"] })}
              options={[
                { label: "RUC", value: "04" },
                { label: "Cedula", value: "05" },
                { label: "Pasaporte", value: "06" },
                { label: "Consumidor final", value: "07" },
                { label: "Exterior", value: "08" }
              ]}
            />
            <Input label="Email" value={form.email} onChangeText={(email) => onChange({ ...form, email })} autoCapitalize="none" />
            <Input label="Telefono WhatsApp" value={form.phone} onChangeText={(phone) => onChange({ ...form, phone: sanitizeIntegerInput(phone).slice(0, 10) })} keyboardType="phone-pad" />
            <Input label="Direccion" value={form.address} onChangeText={(address) => onChange({ ...form, address })} />
            <PrimaryButton label="Guardar y continuar venta" onPress={onSave} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  creditModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "flex-end",
    padding: 12
  },
  quickClientModal: {
    maxHeight: "92%",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden"
  },
  creditModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb"
  },
  flex: {
    flex: 1,
    minWidth: 130
  },
  creditModalTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900"
  },
  creditModalMeta: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 3
  },
  smallButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  smallButtonText: {
    color: "#0f5f59",
    fontWeight: "900"
  },
  creditModalContent: {
    padding: 14,
    gap: 10
  }
});
