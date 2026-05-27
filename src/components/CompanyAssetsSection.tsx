import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Input, PrimaryButton } from "./common";

type CompanyAssetsSectionProps = {
  assetStatus: string;
  assetStatusTone: "info" | "success" | "error";
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
  return (
    <>
      <Text style={styles.paragraph}>Estos archivos se guardan por empresa en el servidor. El certificado .p12 no se guarda en la app y queda cifrado.</Text>
      {assetStatus ? <Text style={[styles.inlineInfo, assetStatusTone === "success" && styles.successText, assetStatusTone === "error" && styles.errorText]}>{assetStatus}</Text> : null}
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
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Confirmar firma electronica</Text>
            <Text style={styles.modalMeta}>{pendingCertificateName || "Archivo .p12 seleccionado"}</Text>
            <Text style={styles.paragraph}>Ingrese la contrasena del certificado para validarlo y guardarlo cifrado en el servidor.</Text>
            <Input label="Contrasena del certificado .p12" value={certificatePassword} onChangeText={onCertificatePasswordChange} secureTextEntry autoComplete="new-password" />
            <View style={styles.row}>
              <View style={styles.flex}>
                <Pressable style={[styles.secondaryButton, uploading && styles.disabledButton]} onPress={uploading ? () => undefined : onCancelCertificateUpload}>
                  <Text style={styles.secondaryButtonText}>Cancelar</Text>
                </Pressable>
              </View>
              <View style={styles.flex}>
                <Pressable style={[styles.confirmButton, uploading && styles.disabledButton]} onPress={uploading ? () => undefined : onConfirmCertificateUpload}>
                  <Text style={styles.confirmButtonText}>{uploading ? "Validando..." : "Validar y subir"}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
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
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#dbe4f0",
    shadowColor: "#0f172a",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6
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
