import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MODAL_EDGE_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { Client, SalePriceTier } from "../types";
import { sanitizeIntegerInput } from "../utils/numbers";
import { Input } from "./common";
import { InlineInputButton } from "./inputActions";
import { useAppTheme } from "../theme/AppTheme";

export type ClientFormValues = {
  name: string;
  identification: string;
  email: string;
  phone: string;
  address: string;
  identificationType: Client["identificationType"];
  defaultSalePriceTier: SalePriceTier;
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
const priceTierOptions: { label: string; value: SalePriceTier }[] = [
  { label: "PVP1 · Precio principal", value: "pvp1" },
  { label: "PVP2 · Mayorista", value: "pvp2" },
  { label: "PVP3 · Tarifa especial", value: "pvp3" }
];

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
      <FormDropdownSelect anchored label="Precio predeterminado" value={form.defaultSalePriceTier} options={priceTierOptions} onChange={(defaultSalePriceTier) => onChange({ ...form, defaultSalePriceTier })} />
    </>
  );
}

function IdentificationTypeSelect({ value, onChange }: { value: Client["identificationType"]; onChange: (value: Client["identificationType"]) => void }) {
  return <FormDropdownSelect label="Tipo de identificacion" value={value} options={identificationOptions} fallback={defaultIdentificationOption} onChange={onChange} />;
}

function FormDropdownSelect<T extends string>({ label, value, options, fallback, anchored = false, onChange }: { label: string; value: T; options: { label: string; value: T }[]; fallback?: { label: string; value: T }; anchored?: boolean; onChange: (value: T) => void }) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const safeTopPadding = Platform.OS === "web" ? 24 : Math.max(insets.top, MODAL_EDGE_PADDING);
  const safeBottomPadding = Platform.OS === "web" ? 24 : Math.max(insets.bottom, MODAL_SAFE_BOTTOM_PADDING);
  const adaptiveMaxHeight = Math.max(280, windowHeight - safeTopPadding - safeBottomPadding);
  const [visible, setVisible] = React.useState(false);
  const [anchor, setAnchor] = React.useState({ x: 0, y: 0, width: 0, height: 0 });
  const triggerRef = React.useRef<View | null>(null);
  const selected = options.find((option) => option.value === value) || fallback || options[0];
  const menuWidth = Math.min(260, windowWidth - 16);

  const open = () => {
    if (!anchored) {
      setVisible(true);
      return;
    }
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setVisible(true);
    });
  };

  return (
    <View style={styles.inputGroup}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <Pressable ref={triggerRef} style={[styles.selectButton, anchored && styles.anchoredSelectButton, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surfaceMuted }]} onPress={open}>
        <Text style={[styles.selectText, { color: theme.colors.text }]}>{selected?.label || value}</Text>
        <MaterialCommunityIcons name="chevron-down" size={17} color={theme.colors.textMuted} />
      </Pressable>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={[styles.backdrop, anchored && styles.anchoredBackdrop, { backgroundColor: anchored ? "transparent" : theme.colors.backdrop }, !anchored && Platform.OS !== "web" && { paddingTop: safeTopPadding, paddingBottom: safeBottomPadding }]} onPress={() => setVisible(false)}>
          <View style={[styles.menu, anchored && styles.anchoredMenu, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }, anchored ? { width: menuWidth, left: Math.max(8, Math.min(anchor.x, windowWidth - menuWidth - 8)), top: anchor.y + anchor.height + 4 } : Platform.OS !== "web" && { maxHeight: adaptiveMaxHeight, flexShrink: 1 }]}>
            <ScrollView>
            {options.map((option) => {
              const active = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.option, { borderBottomColor: theme.colors.border }, active && [styles.optionActive, { backgroundColor: theme.colors.primarySoft }]]}
                  onPress={() => {
                    onChange(option.value);
                    setVisible(false);
                  }}
                >
                  <Text style={[styles.optionText, { color: theme.colors.text }, active && [styles.optionTextActive, { color: theme.colors.primary }]]}>{option.label}</Text>
                  {active ? <MaterialCommunityIcons name="check" size={17} color={theme.colors.primary} /> : null}
                </Pressable>
              );
            })}
            </ScrollView>
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
  anchoredSelectButton: {
    alignSelf: "stretch"
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
  anchoredBackdrop: {
    justifyContent: "flex-start",
    padding: 0
  },
  menu: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dbe4f0",
    backgroundColor: "#ffffff",
    overflow: "hidden"
  },
  anchoredMenu: {
    position: "absolute",
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8
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
