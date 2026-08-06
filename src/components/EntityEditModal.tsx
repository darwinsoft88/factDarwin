import React, { useEffect, useRef, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Animated, BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { KEYBOARD_AVOIDING_BEHAVIOR, MODAL_EDGE_PADDING, MODAL_KEYBOARD_CONTENT_BOTTOM_PADDING, MODAL_SAFE_BOTTOM_PADDING } from "../constants/layout";
import { useKeyboardInset } from "../hooks/useKeyboardInset";
import { AppOverlayPortal } from "./AppToast";

type EntityEditModalProps = {
  visible: boolean;
  title: string;
  subtitle?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  closeLabel?: string;
  confirming?: boolean;
  children: React.ReactNode;
  onClosed?: () => void;
  onClose: () => void;
  onConfirm: () => void;
};

export function EntityEditModal({
  visible,
  title,
  subtitle,
  confirmLabel = "Guardar cambios",
  cancelLabel = "Cancelar",
  closeLabel = "Cerrar",
  confirming = false,
  children,
  onClosed,
  onClose,
  onConfirm
}: EntityEditModalProps) {
  const keyboardInset = useKeyboardInset();
  const androidKeyboardInset = Platform.OS === "android" ? keyboardInset : 0;
  const [rendered, setRendered] = useState(visible);
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const wasVisible = useRef(visible);
  const onClosedRef = useRef(onClosed);

  useEffect(() => {
    onClosedRef.current = onClosed;
  }, [onClosed]);

  useEffect(() => {
    if (visible) {
      wasVisible.current = true;
      setRendered(true);
      Animated.timing(opacity, { duration: 180, toValue: 1, useNativeDriver: Platform.OS !== "web" }).start();
      return () => opacity.stopAnimation();
    }

    if (!wasVisible.current) return undefined;
    wasVisible.current = false;
    Animated.timing(opacity, { duration: 180, toValue: 0, useNativeDriver: Platform.OS !== "web" }).start(({ finished }) => {
      if (!finished) return;
      setRendered(false);
      onClosedRef.current?.();
    });
    return () => opacity.stopAnimation();
  }, [opacity, visible]);

  useEffect(() => {
    if (!visible) return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose, visible]);

  if (!rendered) return null;

  return (
    <AppOverlayPortal>
      <Animated.View accessibilityViewIsModal style={[styles.portalModal, { opacity }]}>
        <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={KEYBOARD_AVOIDING_BEHAVIOR} keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}>
        <View style={[styles.backdrop, androidKeyboardInset > 0 && { paddingBottom: androidKeyboardInset + MODAL_SAFE_BOTTOM_PADDING }]}>
          <View style={styles.modal}>
            <View style={styles.header}>
              <View style={styles.titleBlock}>
                <Text style={styles.title}>{title}</Text>
                {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
              </View>
              <Pressable style={styles.closeButton} onPress={onClose}>
                <MaterialCommunityIcons name="close" size={15} color="#0f766e" />
                <Text style={styles.closeText}>{closeLabel}</Text>
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={[styles.content, androidKeyboardInset > 0 && { paddingBottom: androidKeyboardInset + MODAL_KEYBOARD_CONTENT_BOTTOM_PADDING }]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            >
              {children}
              <View style={styles.actions}>
                <Pressable style={styles.cancelButton} onPress={onClose}>
                  <MaterialCommunityIcons name="arrow-left" size={16} color="#334155" />
                  <Text style={styles.cancelText}>{cancelLabel}</Text>
                </Pressable>
                <Pressable disabled={confirming} style={[styles.confirmButton, confirming && styles.confirmButtonDisabled]} onPress={onConfirm}>
                  <MaterialCommunityIcons name="content-save-outline" size={17} color="#ffffff" />
                  <Text style={styles.confirmText}>{confirming ? "Guardando..." : confirmLabel}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
      </Animated.View>
    </AppOverlayPortal>
  );
}

const styles = StyleSheet.create({
  portalModal: {
    ...StyleSheet.absoluteFillObject
  },
  keyboardAvoiding: {
    flex: 1
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.42)",
    justifyContent: "flex-end",
    paddingHorizontal: MODAL_EDGE_PADDING,
    paddingTop: MODAL_EDGE_PADDING,
    paddingBottom: MODAL_SAFE_BOTTOM_PADDING
  },
  modal: {
    maxHeight: "92%",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe4f0",
    overflow: "hidden"
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb"
  },
  titleBlock: {
    flex: 1
  },
  title: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900"
  },
  subtitle: {
    marginTop: 3,
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700"
  },
  closeButton: {
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f0fdfa",
    flexDirection: "row",
    gap: 5
  },
  closeText: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "900"
  },
  content: {
    padding: 14,
    paddingBottom: MODAL_KEYBOARD_CONTENT_BOTTOM_PADDING,
    gap: 10
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4
  },
  cancelButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    flexDirection: "row",
    gap: 6
  },
  cancelText: {
    color: "#334155",
    fontWeight: "900"
  },
  confirmButton: {
    flex: 1.3,
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    flexDirection: "row",
    gap: 6
  },
  confirmButtonDisabled: {
    opacity: 0.65
  },
  confirmText: {
    color: "#ffffff",
    fontWeight: "900"
  }
});
