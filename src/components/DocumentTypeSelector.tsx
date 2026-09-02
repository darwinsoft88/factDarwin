import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MODAL_EDGE_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { documentTypeOptions } from "../constants/options";
import { DocumentType, Sale } from "../types";
import { formatSriDate } from "../utils/format";
import { useAppTheme } from "../theme/AppTheme";

type DocumentTypeSelectorProps = {
  value: DocumentType;
  editingSale?: Sale;
  nextDocumentLabel?: string;
  sourceTicket?: Sale;
  sourceProforma?: Sale;
  onChange: (value: DocumentType) => void;
};

export function DocumentTypeSelector({ value, editingSale, nextDocumentLabel, sourceTicket, sourceProforma, onChange }: DocumentTypeSelectorProps) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const safeTopPadding = Platform.OS === "web" ? 24 : Math.max(insets.top, MODAL_EDGE_PADDING);
  const safeBottomPadding = Platform.OS === "web" ? 24 : Math.max(insets.bottom, MODAL_SAFE_BOTTOM_PADDING);
  const adaptiveMaxHeight = Math.max(280, windowHeight - safeTopPadding - safeBottomPadding);
  const [visible, setVisible] = React.useState(false);
  const selectedValue = sourceTicket ? "factura" : sourceProforma ? value : editingSale ? editingSale.documentType || "factura" : value;
  const effectiveValue = editingSale?.documentType || value;
  const disabled = Boolean(editingSale || sourceTicket || sourceProforma);
  const selectedOption = documentTypeOptions.find((option) => option.value === selectedValue) || documentTypeOptions[0];
  const originalIssueDate = editingSale?.createdAt ? new Date(editingSale.createdAt) : new Date();
  const displayedIssueDate = Number.isNaN(originalIssueDate.getTime()) ? formatSriDate(new Date()) : formatSriDate(originalIssueDate);
  const infoText = effectiveValue === "proforma"
    ? "Cotizacion interna."
    : effectiveValue === "nota_venta"
      ? "Movimiento interno."
      : "Se autoriza en SRI.";

  return (
    <View style={styles.container}>
      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: theme.colors.textMuted }]}>Tipo de documento</Text>
        <View style={styles.controlsRow}>
          <Pressable style={[styles.selectButton, Platform.OS === "web" && styles.selectButtonWeb, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted }, disabled && styles.selectButtonDisabled]} onPress={() => !disabled && setVisible(true)}>
            <View style={[styles.iconBox, { backgroundColor: theme.colors.successSoft }]}>
              <MaterialCommunityIcons name={documentIcon(selectedValue as DocumentType)} size={16} color={theme.colors.success} />
            </View>
            <Text
              style={[styles.selectText, Platform.OS === "web" && styles.selectTextWeb, { color: theme.colors.text }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.68}
            >
              {selectedOption?.label || "Factura"}
            </Text>
            {!disabled ? <MaterialCommunityIcons name="chevron-down" size={17} color={theme.colors.textMuted} /> : null}
          </Pressable>
          {nextDocumentLabel ? (
            <View style={[styles.nextBox, Platform.OS === "web" && styles.nextBoxWeb, { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.borderStrong }]}>
              <Text style={[styles.nextLabel, { color: theme.colors.primary }]}>Proximo</Text>
              <Text style={[styles.nextText, Platform.OS === "web" && styles.nextTextWeb, { color: theme.colors.primaryStrong }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>{nextDocumentLabel}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.inlineInfoRow}>
        <View style={[styles.issueDateInfo, { backgroundColor: theme.colors.primarySoft }]}>
          <MaterialCommunityIcons name="calendar-month-outline" size={14} color={theme.colors.primary} />
          <Text style={[styles.issueDateText, { color: theme.colors.primary }]}>Emisión: {displayedIssueDate}</Text>
        </View>
        <Text style={[styles.inlineInfo, { color: theme.colors.textMuted }]}>{infoText}</Text>
      </View>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={[styles.backdrop, { backgroundColor: theme.colors.backdrop }, Platform.OS !== "web" && { paddingTop: safeTopPadding, paddingBottom: safeBottomPadding }]} onPress={() => setVisible(false)}>
          <View style={[styles.menu, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }, Platform.OS !== "web" && { maxHeight: adaptiveMaxHeight, flexShrink: 1 }]}>
            <ScrollView>
            {documentTypeOptions.map((option) => {
              const active = option.value === selectedValue;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.option, { borderBottomColor: theme.colors.border }, active && { backgroundColor: theme.colors.primarySoft }]}
                  onPress={() => {
                    onChange(option.value as DocumentType);
                    setVisible(false);
                  }}
                >
                  <View style={styles.optionContent}>
                    <MaterialCommunityIcons name={documentIcon(option.value as DocumentType)} size={17} color={active ? theme.colors.primary : theme.colors.textMuted} />
                    <Text style={[styles.optionText, { color: active ? theme.colors.primary : theme.colors.text }]}>{option.label}</Text>
                  </View>
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
    gap: 5
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
  nextBoxWeb: {
    paddingHorizontal: 5
  },
  nextLabel: {
    color: "#0f766e",
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  nextText: {
    color: "#064e3b",
    width: "100%",
    fontSize: 9,
    fontWeight: "900",
    textAlign: "right"
  },
  nextTextWeb: {
    fontSize: 7
  },
  selectButton: {
    alignSelf: "flex-start",
    width: 132,
    minWidth: 128,
    flexShrink: 0,
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d6e0ec",
    backgroundColor: "#f8fafc",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8
  },
  selectButtonWeb: {
    width: 148,
    minWidth: 148
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
  selectTextWeb: {
    fontSize: 10
  },
  inlineInfo: {
    color: "#4b5563",
    fontSize: 12,
    lineHeight: 16,
    flexShrink: 1
  },
  inlineInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8
  },
  issueDateInfo: {
    minHeight: 24,
    borderRadius: 7,
    backgroundColor: "#f0fdfa",
    paddingHorizontal: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  issueDateText: {
    color: "#0f766e",
    fontSize: 11,
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
