import { CameraView, useCameraPermissions } from "expo-camera";
import { useAudioPlayer } from "expo-audio";
import React, { useEffect, useRef, useState } from "react";
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MODAL_EDGE_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import scanBeep from "../../assets/sounds/scan-beep.wav";
import { normalizeProductCode } from "../validation";
import { useAppTheme } from "../theme/AppTheme";
import { PrimaryButton } from "./common";
type BarcodeScannerModalProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  onScan: (code: string) => boolean | void;
  continuous?: boolean;
};

export function BarcodeScannerModal({ visible, title, onClose, onScan, continuous = false }: BarcodeScannerModalProps) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const safeTopPadding = Platform.OS === "web" ? 12 : Math.max(insets.top, MODAL_EDGE_PADDING);
  const safeBottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, MODAL_SAFE_BOTTOM_PADDING);
  const adaptiveMaxHeight = Math.max(320, windowHeight - safeTopPadding - safeBottomPadding);
  const adaptiveCameraHeight = Math.max(180, Math.min(360, adaptiveMaxHeight - 150));
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [lastCode, setLastCode] = useState("");
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanPlayer = useAudioPlayer(scanBeep);

  useEffect(() => {
    if (visible) {
      setScanned(false);
      setLastCode("");
    }
  }, [visible]);

  useEffect(() => () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
  }, []);

  if (!visible) return null;

  const handleOpenPermission = async () => {
    const result = await requestPermission();
    if (!result.granted) {
      Alert.alert("Camara sin permiso", "Active el permiso de camara para escanear codigos.");
    }
  };

  const playScanBeep = () => {
    try {
      scanPlayer.seekTo(0);
      scanPlayer.play();
    } catch {
      // El sonido es una mejora; el escaneo debe seguir funcionando si el audio falla.
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.scannerBackdrop, { backgroundColor: theme.colors.backdrop }, Platform.OS !== "web" && { paddingTop: safeTopPadding, paddingBottom: safeBottomPadding }]}>
        <View style={[styles.scannerSheet, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, Platform.OS !== "web" && { maxHeight: adaptiveMaxHeight, flexShrink: 1 }]}>
          <View style={[styles.scannerHeader, { borderBottomColor: theme.colors.border }]}>
            <View style={styles.flex}>
              <Text style={[styles.scannerTitle, { color: theme.colors.text }]}>{title}</Text>
              <Text style={[styles.scannerMeta, { color: theme.colors.textMuted }]}>Apunte al codigo de barras o QR del producto.</Text>
            </View>
            <Pressable style={[styles.smallButton, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }]} onPress={onClose}>
              <Text style={[styles.smallButtonText, { color: theme.colors.primaryStrong }]}>Cerrar</Text>
            </Pressable>
          </View>
          {!permission?.granted ? (
            <View style={styles.scannerPermission}>
              <Text style={[styles.paragraph, { color: theme.colors.textMuted }]}>La app necesita permiso de camara para escanear codigos.</Text>
              <PrimaryButton label="Permitir camara" onPress={handleOpenPermission} />
            </View>
          ) : (
            <View style={[styles.scannerCameraWrap, Platform.OS !== "web" && { height: adaptiveCameraHeight }]}>
              <CameraView
                key="active-barcode-scanner"
                style={styles.scannerCamera}
                facing="back"
                barcodeScannerSettings={{
                  barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "itf14", "qr"]
                }}
                onBarcodeScanned={scanned ? undefined : ({ data }) => {
                  const code = normalizeProductCode(String(data || ""));
                  if (!code) return;
                  setScanned(true);
                  setLastCode(code);
                  const accepted = onScan(code);
                  if (accepted !== false) playScanBeep();
                  if (continuous) {
                    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
                    resetTimerRef.current = setTimeout(() => setScanned(false), 900);
                  }
                }}
              />
              <View style={[styles.scannerFrame, { borderColor: theme.colors.success }]} />
            </View>
          )}
          {continuous ? (
            <View style={[styles.scanStatus, { backgroundColor: theme.colors.successSoft, borderTopColor: theme.colors.success }]}>
              <Text style={[styles.scanStatusText, { color: theme.colors.success }]}>{scanned ? `Codigo ${lastCode || ""} leido. Acerque el siguiente producto.` : "Escaner continuo activo."}</Text>
            </View>
          ) : scanned ? (
            <Pressable style={[styles.scanButton, { backgroundColor: theme.colors.primary }]} onPress={() => setScanned(false)}>
              <Text style={[styles.scanButtonText, { color: theme.colors.onPrimary }]}>Escanear otro</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scannerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "flex-end",
    padding: 12
  },
  scannerSheet: {
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden"
  },
  scannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb"
  },
  scannerTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900"
  },
  scannerMeta: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 3
  },
  scannerPermission: {
    padding: 14,
    gap: 12
  },
  scannerCameraWrap: {
    height: 360,
    backgroundColor: "#020617"
  },
  scannerCamera: {
    flex: 1
  },
  scannerFrame: {
    position: "absolute",
    left: "12%",
    right: "12%",
    top: "36%",
    height: 92,
    borderWidth: 2,
    borderColor: "#22c55e",
    borderRadius: 10,
    backgroundColor: "transparent"
  },
  flex: {
    flex: 1,
    minWidth: 130
  },
  paragraph: {
    color: "#4b5563",
    lineHeight: 20
  },
  scanButton: {
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  scanButtonText: {
    color: "#ffffff",
    fontWeight: "900",
    textAlign: "center"
  },
  scanStatus: {
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#ecfdf5",
    borderTopWidth: 1,
    borderTopColor: "#bbf7d0"
  },
  scanStatusText: {
    color: "#047857",
    fontWeight: "900",
    textAlign: "center"
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
  }
});
