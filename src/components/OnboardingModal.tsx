import React from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MODAL_EDGE_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { useAppTheme } from "../theme/AppTheme";
import { OnboardingStep } from "./OnboardingStep";

type OnboardingModalProps = {
  visible: boolean;
  onConfigure: () => void;
  onClose: () => void;
};

export function OnboardingModal({ visible, onConfigure, onClose }: OnboardingModalProps) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const safeTopPadding = Platform.OS === "web" ? 18 : Math.max(insets.top, MODAL_EDGE_PADDING);
  const safeBottomPadding = Platform.OS === "web" ? 18 : Math.max(insets.bottom, MODAL_SAFE_BOTTOM_PADDING);
  const adaptiveMaxHeight = Math.max(320, windowHeight - safeTopPadding - safeBottomPadding);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.onboardingBackdrop, { backgroundColor: theme.colors.backdrop }, Platform.OS !== "web" && { paddingTop: safeTopPadding, paddingBottom: safeBottomPadding }]}>
        <View style={[styles.onboardingCard, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }, Platform.OS !== "web" && { maxHeight: adaptiveMaxHeight, flexShrink: 1 }]}>
          <ScrollView contentContainerStyle={styles.onboardingContent}>
          <Text style={[styles.onboardingEyebrow, { color: theme.colors.primary }]}>Cuenta lista</Text>
          <Text style={[styles.onboardingTitle, { color: theme.colors.text }]}>Bienvenido a FactuDarwin</Text>
          <Text style={[styles.onboardingText, { color: theme.colors.textMuted }]}>Te ayudaremos a preparar tu negocio y realizar tu primera venta. Podrás avanzar a tu ritmo desde Inicio.</Text>
          <Text style={[styles.onboardingText, { color: theme.colors.textMuted }]}>FactuDarwin comienza en modo de prueba para que conozcas la aplicación sin emitir comprobantes reales accidentalmente.</Text>
          <View style={styles.onboardingSteps}>
            <OnboardingStep number="1" title="Prepara lo esencial" text="Revisa tu negocio y agrega un producto o servicio." />
            <OnboardingStep number="2" title="Realiza tu primera venta" text="Puedes comenzar con una venta interna sin configurar todavía la firma electrónica." />
          </View>
          <Pressable style={[styles.onboardingPrimary, { backgroundColor: theme.colors.primary }]} onPress={onConfigure}>
            <Text style={[styles.onboardingPrimaryText, { color: theme.colors.onPrimary }]}>Comenzar</Text>
          </Pressable>
          <Pressable style={styles.onboardingSecondary} onPress={onClose}>
            <Text style={[styles.onboardingSecondaryText, { color: theme.colors.textMuted }]}>Explorar por mi cuenta</Text>
          </Pressable>
          </ScrollView>
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
    overflow: "hidden"
  },
  onboardingContent: {
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
