import React from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { KEYBOARD_AVOIDING_BEHAVIOR } from "../constants/layout";
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
  onSubmit
}: PasswordChangeModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => undefined}>
      <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={KEYBOARD_AVOIDING_BEHAVIOR} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
        <View style={styles.smallNoticeBackdrop}>
          <View style={styles.smallNoticeModal}>
            <Text style={styles.smallNoticeTitle}>Crear nueva contrasena</Text>
            <Text style={styles.smallNoticeText}>Ingresaste con una clave temporal. Para continuar, define una contrasena propia.</Text>
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
            {status ? <Text style={[styles.authFeedback, status.tone === "error" && styles.authFeedbackError, status.tone === "success" && styles.authFeedbackSuccess]}>{status.message}</Text> : null}
            <Pressable style={styles.primaryButton} onPress={onSubmit} disabled={saving}>
              <Text style={styles.primaryButtonText}>{saving ? "Guardando..." : "Guardar nueva contrasena"}</Text>
            </Pressable>
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
    padding: 18,
    gap: 12
  },
  smallNoticeTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center"
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
