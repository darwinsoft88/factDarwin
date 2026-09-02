import React from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KEYBOARD_AVOIDING_BEHAVIOR, MODAL_EDGE_PADDING, MODAL_KEYBOARD_CONTENT_BOTTOM_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { useKeyboardInset } from "../hooks/useKeyboardInset";
import { useAppTheme } from "../theme/AppTheme";
import { IssuerEstablishment } from "../types";
import { Input } from "./common";

type DeleteEstablishmentModalProps = {
  visible: boolean;
  establishment: IssuerEstablishment;
  confirmText: string;
  deleting: boolean;
  onConfirmTextChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export function DeleteEstablishmentModal({
  visible,
  establishment,
  confirmText,
  deleting,
  onConfirmTextChange,
  onClose,
  onConfirm
}: DeleteEstablishmentModalProps) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const keyboardInset = useKeyboardInset();
  const androidKeyboardInset = Platform.OS === "android" ? keyboardInset : 0;
  const safeTopPadding = Platform.OS === "web" ? 12 : Math.max(insets.top, MODAL_EDGE_PADDING);
  const safeBottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, MODAL_SAFE_BOTTOM_PADDING);
  const adaptiveMaxHeight = Math.max(320, windowHeight - safeTopPadding - safeBottomPadding);
  const canDelete = confirmText.trim() === establishment.id && !deleting;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!deleting) onClose(); }}>
      <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={KEYBOARD_AVOIDING_BEHAVIOR} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
      <View style={[styles.creditModalBackdrop, { backgroundColor: theme.colors.backdrop }, Platform.OS !== "web" && { paddingTop: safeTopPadding, paddingBottom: safeBottomPadding }, androidKeyboardInset > 0 && { paddingBottom: androidKeyboardInset + safeBottomPadding }]}>
        <View style={[styles.establishmentModal, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, Platform.OS !== "web" && { maxHeight: adaptiveMaxHeight, flexShrink: 1 }]}>
          <View style={[styles.creditModalHeader, { borderBottomColor: theme.colors.border }]}>
            <View style={styles.flex}>
              <Text style={[styles.creditModalTitle, { color: theme.colors.text }]}>Eliminar establecimiento</Text>
              <Text style={[styles.creditModalMeta, { color: theme.colors.textMuted }]}>Esta accion solo esta disponible si no existen documentos asociados.</Text>
            </View>
            <Pressable style={[styles.smallButton, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }, deleting && styles.disabledButton]} onPress={() => { if (!deleting) onClose(); }} disabled={deleting}>
              <Text style={[styles.smallButtonText, { color: theme.colors.primaryStrong }]}>Cerrar</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={[styles.creditModalContent, androidKeyboardInset > 0 && { paddingBottom: androidKeyboardInset + MODAL_KEYBOARD_CONTENT_BOTTOM_PADDING }]} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}>
            <Text style={[styles.paragraph, { color: theme.colors.textMuted }]}>Para eliminar {establishment.name} escriba exactamente {establishment.id}.</Text>
            <Input label="Confirmar codigo" value={confirmText} onChangeText={onConfirmTextChange} autoCapitalize="characters" />
            <Pressable
              style={[styles.establishmentDeleteButton, { borderColor: theme.colors.danger, backgroundColor: theme.colors.dangerSoft }, !canDelete && styles.disabledDangerButton]}
              onPress={onConfirm}
              disabled={!canDelete}
            >
              <Text style={[styles.establishmentDeleteButtonText, { color: theme.colors.danger }]}>{deleting ? "Eliminando..." : "Eliminar definitivamente"}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardAvoiding: {
    flex: 1
  },
  creditModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "flex-end",
    padding: 12
  },
  establishmentModal: {
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
  disabledButton: {
    backgroundColor: "#94a3b8"
  },
  creditModalContent: {
    padding: 14,
    gap: 10
  },
  paragraph: {
    color: "#4b5563",
    lineHeight: 20
  },
  establishmentDeleteButton: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fff1f2",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  establishmentDeleteButtonText: {
    color: "#991b1b",
    fontWeight: "900",
    textAlign: "center"
  },
  disabledDangerButton: {
    opacity: 0.55
  }
});
