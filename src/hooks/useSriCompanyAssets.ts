import { useCallback, useEffect, useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { Alert, Platform } from "react-native";
import { CompanyAssetsStatus, getCompanyAssetsStatus, uploadCompanyCertificate, uploadCompanyLogo } from "../services/backend";
import { AppData, Issuer, User } from "../types";
import { appendAudit } from "../utils/audit";
import { pickWebFile, readWebFileBase64 } from "../utils/files";
import { formatShortDate } from "../utils/format";

type UseSriCompanyAssetsParams = {
  autoBackupEnabled: boolean;
  backendToken: string;
  backendUrl: string;
  creditNoteSequentialText: string;
  data: AppData;
  issuer: Issuer;
  remissionSequentialText: string;
  sequentialText: string;
  setIssuer: React.Dispatch<React.SetStateAction<Issuer>>;
  persist: (data: AppData) => Promise<void>;
  user: User;
};

export function useSriCompanyAssets({
  autoBackupEnabled,
  backendToken,
  backendUrl,
  creditNoteSequentialText,
  data,
  issuer,
  remissionSequentialText,
  sequentialText,
  setIssuer,
  persist,
  user
}: UseSriCompanyAssetsParams) {
  const [assetStatus, setAssetStatus] = useState("");
  const [assetStatusTone, setAssetStatusTone] = useState<"info" | "success" | "error">("info");
  const [certificatePassword, setCertificatePassword] = useState("");
  const [certificateUploadModalVisible, setCertificateUploadModalVisible] = useState(false);
  const [pendingCertificateFile, setPendingCertificateFile] = useState<{ fileName: string; base64: string } | null>(null);
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [checkingAssetStatus, setCheckingAssetStatus] = useState(false);
  const [assetsStatus, setAssetsStatus] = useState<CompanyAssetsStatus>();

  const refreshAssetsStatus = useCallback(async (showAlert = true) => {
    if (showAlert) {
      setCheckingAssetStatus(true);
      setAssetStatus("Consultando logo y firma en el servidor...");
      setAssetStatusTone("info");
    }
    try {
      const status = await getCompanyAssetsStatus(backendUrl, backendToken);
      setAssetsStatus(status);
      const logoText = status.logo?.configured ? "Logo configurado" : "Logo pendiente";
      const certText = status.certificate?.configured
        ? certificateStatusText(status.certificate)
        : status.certificate?.needsUpload
          ? status.certificate.error || "Certificado requiere volver a subirse"
          : "Certificado pendiente";
      setAssetStatus(`${logoText} | ${certText}`);
      setAssetStatusTone(status.certificate?.needsUpload || ["expired", "critical", "not_yet_valid"].includes(status.certificate?.expirationStatus || "") ? "error" : status.certificate?.expirationStatus === "valid" ? "success" : "info");
      if (showAlert) Alert.alert("Activos de empresa", `${logoText}\n${certText}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo consultar logo/certificado.";
      setAssetStatus(message);
      setAssetStatusTone("error");
      if (showAlert) Alert.alert("Activos no disponibles", message);
    } finally {
      if (showAlert) setCheckingAssetStatus(false);
    }
  }, [backendToken, backendUrl]);

  useEffect(() => {
    if (!backendToken) return;
    void refreshAssetsStatus(false);
  }, [backendToken, backendUrl, refreshAssetsStatus]);

  const persistLogoUpload = async (file: { fileName: string; mimeType: string; base64: string }) => {
    const result = await uploadCompanyLogo(backendUrl, file, backendToken);
    const nextIssuer = { ...issuer, logoUrl: result.logoUrl || "" };
    setIssuer(nextIssuer);
    await persist(appendAudit({ ...data, backendUrl, autoBackupEnabled, issuer: { ...nextIssuer, sequential: Number(sequentialText), remissionSequential: Number(remissionSequentialText), creditNoteSequential: Number(creditNoteSequentialText) } }, user, "COMPANY_LOGO_UPDATED", "issuer", issuer.ruc, "Logo RIDE actualizado"));
  };

  const uploadLogoFromWeb = async () => {
    let uploaded = false;
    try {
      setUploadingAsset(true);
      const file = Platform.OS === "web" ? await pickWebLogoFile() : await pickNativeLogoFile();
      if (!file) return;
      await persistLogoUpload(file);
      uploaded = true;
      setAssetStatus("Logo cargado y guardado para RIDE.");
      setAssetStatusTone("success");
      Alert.alert("Logo cargado", "El logo quedo guardado para los proximos RIDE.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Revise el archivo e intente nuevamente.";
      setAssetStatus(`Error al subir logo: ${message}`);
      setAssetStatusTone("error");
      Alert.alert("No se pudo subir logo", message);
    } finally {
      setUploadingAsset(false);
      if (uploaded) void refreshAssetsStatus(false);
    }
  };

  const uploadCertificateFromWeb = async () => {
    try {
      setUploadingAsset(true);
      const file = Platform.OS === "web" ? await pickWebCertificateFile() : await pickNativeCertificateFile();
      if (!file) {
        setAssetStatus("No se selecciono ningun certificado.");
        setAssetStatusTone("info");
        return;
      }
      setPendingCertificateFile({ fileName: file.fileName, base64: file.base64 });
      setCertificatePassword("");
      setCertificateUploadModalVisible(true);
      setAssetStatus(`Firma seleccionada: ${file.fileName}. Ingrese la contrasena para validarla.`);
      setAssetStatusTone("info");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Revise el .p12 e intente nuevamente.";
      setAssetStatus(`Error al seleccionar certificado: ${message}`);
      setAssetStatusTone("error");
      Alert.alert("No se pudo seleccionar certificado", message);
    } finally {
      setUploadingAsset(false);
    }
  };

  const cancelCertificateUpload = () => {
    if (uploadingAsset) return;
    setCertificateUploadModalVisible(false);
    setPendingCertificateFile(null);
    setCertificatePassword("");
  };

  const confirmCertificateUpload = async () => {
    if (!pendingCertificateFile) {
      Alert.alert("Seleccione la firma", "Primero seleccione el archivo .p12.");
      return;
    }
    if (!certificatePassword.trim()) {
      Alert.alert("Clave requerida", "Ingrese la contrasena del certificado .p12.");
      return;
    }
    let uploaded = false;
    try {
      setUploadingAsset(true);
      await uploadCompanyCertificate(backendUrl, { fileName: pendingCertificateFile.fileName, password: certificatePassword, base64: pendingCertificateFile.base64 }, backendToken);
      uploaded = true;
      setPendingCertificateFile(null);
      setCertificatePassword("");
      setCertificateUploadModalVisible(false);
      setAssetStatus("Certificado cargado y validado.");
      setAssetStatusTone("success");
      Alert.alert("Certificado listo", "El servidor valido el .p12. Las proximas emisiones usaran el certificado de esta empresa.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Revise el .p12 y la contrasena.";
      setAssetStatus(`Error al subir certificado: ${message}`);
      setAssetStatusTone("error");
      Alert.alert("No se pudo subir certificado", message);
    } finally {
      setUploadingAsset(false);
      if (uploaded) void refreshAssetsStatus(false);
    }
  };

  return {
    assetStatus,
    assetStatusTone,
    assetsStatus,
    cancelCertificateUpload,
    certificatePassword,
    certificateUploadModalVisible,
    checkingAssetStatus,
    confirmCertificateUpload,
    pendingCertificateFile,
    refreshAssetsStatus,
    setCertificatePassword,
    uploadCertificateFromWeb,
    uploadLogoFromWeb,
    uploadingAsset
  };
}

function certificateStatusText(certificate: {
  uploadedAt?: string;
  expiresAt?: string;
  daysRemaining?: number;
  expirationStatus?: "valid" | "warning" | "critical" | "expired" | "not_yet_valid";
}) {
  const expirationDate = certificate.expiresAt ? formatShortDate(certificate.expiresAt) : "";
  if (certificate.expirationStatus === "expired") return `FIRMA VENCIDA${expirationDate ? ` el ${expirationDate}` : ""}. Suba una nueva antes de emitir.`;
  if (certificate.expirationStatus === "not_yet_valid") return "La firma electronica todavia no entra en vigencia.";
  if (certificate.expirationStatus === "critical") return `Firma electronica por vencer: ${certificate.daysRemaining ?? 0} dia(s)${expirationDate ? `, vence el ${expirationDate}` : ""}. Renuevela cuanto antes.`;
  if (certificate.expirationStatus === "warning") return `Firma electronica vence en ${certificate.daysRemaining ?? 0} dias${expirationDate ? ` (${expirationDate})` : ""}. Prepare su renovacion.`;
  if (certificate.expirationStatus === "valid" && expirationDate) return `Firma electronica vigente hasta ${expirationDate} (${certificate.daysRemaining ?? 0} dias).`;
  return `Certificado cargado${certificate.uploadedAt ? ` el ${formatShortDate(certificate.uploadedAt)}` : ""}`;
}

async function pickWebLogoFile() {
  const file = await pickWebFile("image/png,image/jpeg,image/webp");
  if (!file) return null;
  return {
    fileName: file.name || "logo.png",
    mimeType: file.type || guessLogoMimeType(file.name),
    base64: await readWebFileBase64(file)
  };
}

async function pickWebCertificateFile() {
  const file = await pickWebFile(".p12,application/x-pkcs12");
  if (!file) return null;
  return {
    fileName: file.name || "firma.p12",
    base64: await readWebFileBase64(file)
  };
}

async function pickNativeLogoFile() {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: ["image/png", "image/jpeg", "image/webp"]
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset?.uri) return null;
  const fileName = asset.name || "logo.png";
  const mimeType = asset.mimeType || guessLogoMimeType(fileName);
  if (!mimeType.startsWith("image/")) {
    throw new Error("Seleccione una imagen PNG, JPG o WEBP.");
  }
  return {
    fileName,
    mimeType,
    base64: await FileSystem.readAsStringAsync(asset.uri, { encoding: "base64" })
  };
}

async function pickNativeCertificateFile() {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: ["application/x-pkcs12", "application/octet-stream", "*/*"]
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset?.uri) return null;
  const fileName = asset.name || "firma.p12";
  if (!fileName.toLowerCase().endsWith(".p12")) {
    throw new Error("Seleccione un archivo de firma electronica con extension .p12.");
  }
  return {
    fileName,
    base64: await FileSystem.readAsStringAsync(asset.uri, { encoding: "base64" })
  };
}

function guessLogoMimeType(fileName: string) {
  const name = fileName.toLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  return "image/png";
}
