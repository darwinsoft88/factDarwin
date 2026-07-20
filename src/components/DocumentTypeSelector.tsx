import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { documentTypeOptions } from "../constants/options";
import { DocumentType, Sale } from "../types";

type DocumentTypeSelectorProps = {
  value: DocumentType;
  editingSale?: Sale;
  nextDocumentLabel?: string;
  sourceTicket?: Sale;
  sourceProforma?: Sale;
  onChange: (value: DocumentType) => void;
};

export function DocumentTypeSelector({ value, editingSale, nextDocumentLabel, sourceTicket, sourceProforma, onChange }: DocumentTypeSelectorProps) {
  const [visible, setVisible] = React.useState(false);
  const selectedValue = sourceTicket ? "factura" : sourceProforma ? value : editingSale ? editingSale.documentType || "factura" : value;
  const effectiveValue = editingSale?.documentType || value;
  const disabled = Boolean(editingSale || sourceTicket || sourceProforma);
  const selectedOption = documentTypeOptions.find((option) => option.value === selectedValue) || documentTypeOptions[0];
  const infoText = effectiveValue === "proforma"
    ? "Cotizacion interna."
    : effectiveValue === "nota_venta"
      ? "Movimiento interno."
      : "Se autoriza en SRI.";

  return (
    <View style={styles.container}>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Tipo de documento</Text>
        <View style={styles.controlsRow}>
          <Pressable style={[styles.selectButton, disabled && styles.selectButtonDisabled]} onPress={() => !disabled && setVisible(true)}>
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name={documentIcon(selectedValue as DocumentType)} size={16} color="#047857" />
            </View>
            <Text style={styles.selectText} numberOfLines={1}>{selectedOption?.label || "Factura"}</Text>
            {!disabled ? <MaterialCommunityIcons name="chevron-down" size={17} color="#475569" /> : null}
          </Pressable>
          {nextDocumentLabel ? (
            <View style={styles.nextBox}>
              <Text style={styles.nextLabel}>Proximo</Text>
              <Text style={styles.nextText} numberOfLines={1}>{nextDocumentLabel}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Text style={styles.inlineInfo} numberOfLines={1}>{infoText}</Text>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <View style={styles.menu}>
            {documentTypeOptions.map((option) => {
              const active = option.value === selectedValue;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.option, active && styles.optionActive]}
                  onPress={() => {
                    onChange(option.value as DocumentType);
                    setVisible(false);
                  }}
                >
                  <View style={styles.optionContent}>
                    <MaterialCommunityIcons name={documentIcon(option.value as DocumentType)} size={17} color={active ? "#0f766e" : "#475569"} />
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>{option.label}</Text>
                  </View>
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

function documentIcon(value: DocumentType) {
  if (value === "nota_venta") return "receipt-text-outline";
  if (value === "proforma") return "file-document-edit-outline";
  return "file-certificate-outline";
}

const styles = StyleSheet.create({
  container: {
    gap: 8
  },
  inputGroup: {
    gap: 5
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  label: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800"
  },
  nextBox: {
    minHeight: 38,
    flex: 1,
    minWidth: 0,
    borderRadius: 8,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: "flex-end",
    justifyContent: "center"
  },
  nextLabel: {
    color: "#0f766e",
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  nextText: {
    color: "#064e3b",
    fontSize: 11,
    fontWeight: "900"
  },
  selectButton: {
    alignSelf: "flex-start",
    minWidth: 154,
    maxWidth: "100%",
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d6e0ec",
    backgroundColor: "#f8fafc",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10
  },
  selectButtonDisabled: {
    opacity: 0.72
  },
  iconBox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#d1fae5"
  },
  selectText: {
    color: "#334155",
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "900"
  },
  inlineInfo: {
    color: "#4b5563",
    fontSize: 12,
    lineHeight: 16
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
    minHeight: 46,
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
  optionContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  optionText: {
    color: "#334155",
    fontWeight: "800"
  },
  optionTextActive: {
    color: "#0f766e"
  }
});
