import React from "react";
import { Alert, Linking, Pressable, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { SUPPORT_WHATSAPP_NUMBER } from "../constants/branding";
import { MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { AppData, User } from "../types";
import { compactLicenseStatusLabel } from "../utils/appAccess";

type CommercialSupportButtonProps = {
  data: AppData;
  user: User;
  bottomInset: number;
  onOpenDiagnostics: () => void;
};

export function CommercialSupportButton({ data, user, bottomInset, onOpenDiagnostics }: CommercialSupportButtonProps) {
  const openWhatsapp = async () => {
    const phone = SUPPORT_WHATSAPP_NUMBER.replace(/\D/g, "");
    if (!phone) {
      Alert.alert("WhatsApp no configurado", "Configure el numero comercial de soporte. Se abrira el diagnostico tecnico por ahora.");
      onOpenDiagnostics();
      return;
    }

    const companyName = data.issuer.businessName || data.issuer.tradeName || "Empresa";
    const message = [
      "Hola DarwinSoft, necesito ayuda con FactuDarwin.",
      `Empresa: ${companyName}`,
      `RUC: ${data.issuer.ruc || "sin RUC"}`,
      `Usuario: ${user.name || user.email}`,
      `Plan actual: ${compactLicenseStatusLabel(data.license)}`,
      "Quiero informacion para adquirir/renovar un plan o enviar comprobante de pago."
    ].join("\n");

    try {
      await Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
    } catch {
      Alert.alert("No se pudo abrir WhatsApp", "Revise que WhatsApp este instalado o contacte soporte desde el menu.");
    }
  };

  const floatingBottom = Math.max(72, bottomInset + MODAL_SAFE_BOTTOM_PADDING + 12);

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { bottom: floatingBottom }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Soporte por WhatsApp"
        style={styles.floatingButton}
        onPress={() => { void openWhatsapp(); }}
      >
        <MaterialCommunityIcons name="whatsapp" size={32} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    right: 16,
    bottom: 90,
    zIndex: 50
  },
  floatingButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#25D366",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8
  }
});
