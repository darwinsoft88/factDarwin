import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { OnboardingStep } from "./OnboardingStep";

type OnboardingModalProps = {
  visible: boolean;
  onConfigure: () => void;
  onClose: () => void;
};

export function OnboardingModal({ visible, onConfigure, onClose }: OnboardingModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.onboardingBackdrop}>
        <View style={styles.onboardingCard}>
          <Text style={styles.onboardingEyebrow}>Cuenta lista</Text>
          <Text style={styles.onboardingTitle}>Preparemos la empresa</Text>
          <Text style={styles.onboardingText}>Complete estos pasos para que la app quede lista para facturar con su marca y datos SRI.</Text>
          <View style={styles.onboardingSteps}>
            <OnboardingStep number="1" title="Datos de empresa" text="RUC, razon social, direccion y secuenciales." />
            <OnboardingStep number="2" title="Logo del negocio" text="Se usara en RIDE, guias y reportes." />
            <OnboardingStep number="3" title="Firma electronica .p12" text="Necesaria para firmar y autorizar comprobantes." />
            <OnboardingStep number="4" title="Ambiente SRI" text="Empiece en pruebas y pase a produccion cuando todo este validado." />
          </View>
          <Pressable style={styles.onboardingPrimary} onPress={onConfigure}>
            <Text style={styles.onboardingPrimaryText}>Configurar ahora</Text>
          </Pressable>
          <Pressable style={styles.onboardingSecondary} onPress={onClose}>
            <Text style={styles.onboardingSecondaryText}>Despues</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  onboardingBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.38)",
    padding: 18,
    justifyContent: "center"
  },
  onboardingCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    padding: 18,
    gap: 12
  },
  onboardingEyebrow: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  onboardingTitle: {
    color: "#111827",
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "900"
  },
  onboardingText: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700"
  },
  onboardingSteps: {
    gap: 8
  },
  onboardingPrimary: {
    minHeight: 44,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f766e"
  },
  onboardingPrimaryText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  onboardingSecondary: {
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center"
  },
  onboardingSecondaryText: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "800"
  }
});
