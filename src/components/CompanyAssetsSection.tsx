import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Input, PrimaryButton } from "./common";

type CompanyAssetsSectionProps = {
  assetStatus: string;
  assetStatusTone: "info" | "success" | "error";
  uploading: boolean;
  certificatePassword: string;
  onCertificatePasswordChange: (value: string) => void;
  onUploadLogo: () => void;
  onRefreshStatus: () => void;
  onUploadCertificate: () => void;
};

export function CompanyAssetsSection({
  assetStatus,
  assetStatusTone,
  uploading,
  certificatePassword,
  onCertificatePasswordChange,
  onUploadLogo,
  onRefreshStatus,
  onUploadCertificate
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
          <PrimaryButton label="Ver estado" onPress={onRefreshStatus} />
        </View>
      </View>
      <Input label="Contrasena certificado .p12" value={certificatePassword} onChangeText={onCertificatePasswordChange} secureTextEntry autoComplete="new-password" />
      <PrimaryButton label={uploading ? "Procesando..." : "Subir certificado .p12"} onPress={uploading ? () => undefined : onUploadCertificate} />
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
  }
});
