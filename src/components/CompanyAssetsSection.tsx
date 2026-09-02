import React from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KEYBOARD_AVOIDING_BEHAVIOR, MODAL_EDGE_PADDING, MODAL_KEYBOARD_CONTENT_BOTTOM_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { useKeyboardInset } from "../hooks/useKeyboardInset";
import { useAppTheme } from "../theme/AppTheme";
import { Input, PrimaryButton } from "./common";

type CompanyAssetsSectionProps = {
  assetStatus: string;
  assetStatusTone: "info" | "success" | "error";
  logoUrl: string;
  uploading: boolean;
  checkingStatus: boolean;
  certificatePassword: string;
  certificateModalVisible: boolean;
  pendingCertificateName: string;
  onCertificatePasswordChange: (value: string) => void;
  onUploadLogo: () => void;
  onRefreshStatus: () => void;
  onUploadCertificate: () => void;
  onConfirmCertificateUpload: () => void;
  onCancelCertificateUpload: () => void;
};

export function CompanyAssetsSection({
  assetStatus,
  assetStatusTone,
  logoUrl,
  uploading,
  checkingStatus,
  certificatePassword,
  certificateModalVisible,
  pendingCertificateName,
  onCertificatePasswordChange,
  onUploadLogo,
  onRefreshStatus,
  onUploadCertificate,
  onConfirmCertificateUpload,
  onCancelCertificateUpload
}: CompanyAssetsSectionProps) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const keyboardInset = useKeyboardInset();
  const androidKeyboardInset = Platform.OS === "android" ? keyboardInset : 0;
  const safeTopPadding = Platform.OS === "web" ? 18 : Math.max(insets.top, MODAL_EDGE_PADDING);
  const safeBottomPadding = Platform.OS === "web" ? 18 : Math.max(insets.bottom, MODAL_SAFE_BOTTOM_PADDING);
  const adaptiveMaxHeight = Math.max(320, windowHeight - safeTopPadding - safeBottomPadding);

  return (
    <>
      <Text style={[styles.paragraph, { color: theme.colors.textMuted }]}>Estos archivos se guardan por empresa en el servidor. El certificado .p12 no se guarda en la app y queda cifrado.</Text>
      {assetStatus ? <Text style={[styles.inlineInfo, { color: assetStatusTone === "success" ? theme.colors.success : assetStatusTone === "error" ? theme.colors.danger : theme.colors.info }]}>{assetStatus}</Text> : null}
      {logoUrl ? (
        <View style={[styles.assetInfoBox, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted }]}>
          <Text style={[styles.assetInfoLabel, { color: theme.colors.textMuted }]}>URL logo RIDE</Text>
          <Text style={[styles.assetInfoValue, { color: theme.colors.text }]} selectable>{logoUrl}</Text>
        </View>
      ) : null}
      <View style={styles.row}>
        <View style={styles.flex}>
          <PrimaryButton label={uploading ? "Procesando..." : "Subir logo"} onPress={uploading ? () => undefined : onUploadLogo} />
        </View>
        <View style={styles.flex}>
          <PrimaryButton label={checkingStatus ? "Consultando..." : "Ver estado"} onPress={checkingStatus ? () => undefined : onRefreshStatus} />
        </View>
      </View>
      <PrimaryButton label={uploading ? "Procesando..." : "Seleccionar firma .p12"} onPress={uploading ? () => undefined : onUploadCertificate} />

      <Modal visible={certificateModalVisible} transparent animationType="fade" onRequestClose={uploading ? () => undefined : onCancelCertificateUpload}>
        <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={KEYBOARD_AVOIDING_BEHAVIOR} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
        <View style={[styles.modalBackdrop, Platform.OS !== "web" && { paddingTop: safeTopPadding, paddingBottom: safeBottomPadding }, androidKeyboardInset > 0 && { paddingBottom: androidKeyboardInset + safeBottomPadding }]}>
          <View style={[styles.modal, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, shadowColor: theme.colors.shadow }, Platform.OS !== "web" && { maxHeight: adaptiveMaxHeight, flexShrink: 1 }]}>
            <ScrollView contentContainerStyle={[styles.modalContent, androidKeyboardInset > 0 && { paddingBottom: androidKeyboardInset + MODAL_KEYBOARD_CONTENT_BOTTOM_PADDING }]} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}>
            <Text style={[styles.modalTitle, { color: theme.colors.text }]}>Confirmar firma electronica</Text>
            <Text style={[styles.modalMeta, { color: theme.colors.primary }]}>{pendingCertificateName || "Archivo .p12 seleccionado"}</Text>
            <Text style={[styles.paragraph, { color: theme.colors.textMuted }]}>Ingrese la contrasena del certificado para validarlo y guardarlo cifrado en el servidor.</Text>
            <Input label="Contrasena del certificado .p12" value={certificatePassword} onChangeText={onCertificatePasswordChange} secureTextEntry autoComplete="new-password" />
            <View style={styles.row}>
              <View style={styles.flex}>
                <Pressable style={[styles.secondaryButton, { borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface }, uploading && styles.disabledButton]} onPress={uploading ? () => undefined : onCancelCertificateUpload}>
                  <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>Cancelar</Text>
                </Pressable>
              </View>
              <View style={styles.flex}>
                <Pressable style={[styles.confirmButton, { backgroundColor: theme.colors.primary }, uploading && styles.disabledButton]} onPress={uploading ? () => undefined : onConfirmCertificateUpload}>
                  <Text style={[styles.confirmButtonText, { color: theme.colors.onPrimary }]}>{uploading ? "Validando..." : "Validar y subir"}</Text>
                </Pressable>
              </View>
            </View>
            </ScrollView>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  keyboardAvoiding: {
    flex: 1
  },
  paragraph: {
    color: "#4b5563",
    lineHeight: 20
  },
  inlineInfo: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18
  },
  successText: {
    color: "#047857"
  },
  errorText: {
    color: "#b91c1c"
  },
  assetInfoBox: {
    borderWidth: 1,
    borderColor: "#dbe4f0",
    borderRadius: 8,
    backgroundColor: "#f8fafc",
    padding: 10,
    gap: 4
  },
  assetInfoLabel: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "900"
  },
  assetInfoValue: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "700"
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.42)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18
  },
  modal: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 10,
    backgroundColor: "#ffffff",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#dbe4f0",
    shadowColor: "#0f172a",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6
  },
  modalContent: {
    padding: 16,
    gap: 12
  },
  modalTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center"
  },
  modalMeta: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center"
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14
  },
  secondaryButtonText: {
    color: "#334155",
    fontWeight: "900"
  },
  confirmButton: {
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14
  },
  confirmButtonText: {
    color: "#ffffff",
    fontWeight: "900"
  },
  disabledButton: {
    opacity: 0.68
  }
});
