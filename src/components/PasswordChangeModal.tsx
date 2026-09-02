import React from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KEYBOARD_AVOIDING_BEHAVIOR, MODAL_EDGE_PADDING, MODAL_KEYBOARD_CONTENT_BOTTOM_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { useKeyboardInset } from "../hooks/useKeyboardInset";
import { useAppTheme } from "../theme/AppTheme";
import { Input } from "./common";
import { PasswordVisibilityButton } from "./inputActions";

type PasswordChangeStatus = {
  tone: "info" | "error" | "success";
  message: string;
};

type PasswordChangeModalProps = {
  visible: boolean;
  password: string;
  confirm: string;
  passwordVisible: boolean;
  status: PasswordChangeStatus | null;
  saving: boolean;
  onPasswordChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
  onToggleVisible: () => void;
  onSubmit: () => void;
  required?: boolean;
  onClose?: () => void;
};

export function PasswordChangeModal({
  visible,
  password,
  confirm,
  passwordVisible,
  status,
  saving,
  onPasswordChange,
  onConfirmChange,
  onToggleVisible,
  onSubmit,
  required = true,
  onClose
}: PasswordChangeModalProps) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const keyboardInset = useKeyboardInset();
  const androidKeyboardInset = Platform.OS === "android" ? keyboardInset : 0;
  const safeTopPadding = Platform.OS === "web" ? 24 : Math.max(insets.top, MODAL_EDGE_PADDING);
  const safeBottomPadding = Platform.OS === "web" ? 24 : Math.max(insets.bottom, MODAL_SAFE_BOTTOM_PADDING);
  const adaptiveMaxHeight = Math.max(320, windowHeight - safeTopPadding - safeBottomPadding);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!required) onClose?.(); }}>
      <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={KEYBOARD_AVOIDING_BEHAVIOR} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
        <View style={[styles.smallNoticeBackdrop, { backgroundColor: theme.colors.backdrop }, Platform.OS !== "web" && { paddingTop: safeTopPadding, paddingBottom: safeBottomPadding }, androidKeyboardInset > 0 && { paddingBottom: androidKeyboardInset + safeBottomPadding }]}>
          <View style={[styles.smallNoticeModal, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }, Platform.OS !== "web" && { maxHeight: adaptiveMaxHeight, flexShrink: 1 }]}>
            <ScrollView contentContainerStyle={[styles.smallNoticeContent, androidKeyboardInset > 0 && { paddingBottom: androidKeyboardInset + MODAL_KEYBOARD_CONTENT_BOTTOM_PADDING }]} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}>
            <View style={styles.titleRow}>
              <View style={styles.titleSpacer} />
              <Text style={[styles.smallNoticeTitle, { color: theme.colors.text }]}>{required ? "Crear nueva contrasena" : "Cambiar contrasena"}</Text>
              {required ? <View style={styles.titleSpacer} /> : (
                <Pressable accessibilityRole="button" accessibilityLabel="Cerrar cambio de contrasena" style={[styles.closeButton, { backgroundColor: theme.colors.surfaceMuted }]} onPress={onClose}>
                  <Text style={[styles.closeButtonText, { color: theme.colors.textMuted }]}>×</Text>
                </Pressable>
              )}
            </View>
            <Text style={[styles.smallNoticeText, { color: theme.colors.textMuted }]}>{required
              ? "Ingresaste con una clave temporal. Para continuar, define una contrasena propia."
              : "Define una nueva contrasena segura para tu cuenta."}</Text>
            <Input
              label="Nueva contrasena"
              value={password}
              onChangeText={onPasswordChange}
              secureTextEntry={!passwordVisible}
              autoCapitalize="none"
              autoComplete="new-password"
              rightElement={<PasswordVisibilityButton visible={passwordVisible} onPress={onToggleVisible} />}
            />
            <Input
              label="Confirmar contrasena"
              value={confirm}
              onChangeText={onConfirmChange}
              secureTextEntry={!passwordVisible}
              autoCapitalize="none"
              autoComplete="new-password"
            />
            {status ? <Text style={[styles.authFeedback, { color: status.tone === "error" ? theme.colors.danger : status.tone === "success" ? theme.colors.success : theme.colors.info }]}>{status.message}</Text> : null}
            <Pressable style={[styles.primaryButton, { backgroundColor: saving ? theme.colors.textSubtle : theme.colors.primary }]} onPress={onSubmit} disabled={saving}>
              <Text style={[styles.primaryButtonText, { color: theme.colors.onPrimary }]}>{saving ? "Guardando..." : "Guardar nueva contrasena"}</Text>
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
  smallNoticeBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  smallNoticeModal: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    overflow: "hidden"
  },
  smallNoticeContent: {
    padding: 18,
    gap: 12
  },
  smallNoticeTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center"
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  titleSpacer: {
    width: 34
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9"
  },
  closeButtonText: {
    color: "#334155",
    fontSize: 24,
    lineHeight: 26,
    fontWeight: "700"
  },
  smallNoticeText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    textAlign: "center"
  },
  authFeedback: {
    color: "#2563eb",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    textAlign: "center"
  },
  authFeedbackError: {
    color: "#b91c1c"
  },
  authFeedbackSuccess: {
    color: "#047857"
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "800"
  }
});
