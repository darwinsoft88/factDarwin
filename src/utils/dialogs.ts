import { Alert, Platform } from "react-native";

export function getLocalVoidReason(defaultReason: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const reason = window.prompt("Motivo de anulacion local", defaultReason);
    return reason === null ? "" : (reason.trim() || defaultReason);
  }

  return defaultReason;
}

export function showMessage(title: string, message: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.alert(`${title}\n\n${message}`);
    return;
  }

  Alert.alert(title, message);
}

export function confirmAction(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: "Cancelar", style: "cancel" },
    { text: "Eliminar", style: "destructive", onPress: onConfirm }
  ]);
}
