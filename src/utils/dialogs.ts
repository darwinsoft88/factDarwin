import { Alert, Platform } from "react-native";
import toast from "../services/toast";

export function getLocalVoidReason(defaultReason: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const reason = window.prompt(
      "Motivo de anulación local",
      defaultReason
    );

    return reason === null ? "" : (reason.trim() || defaultReason);
  }

  return defaultReason;
}

export function showSuccess(title: string, message: string) {
  toast.success(title, message);
}

export function showInfo(title: string, message: string) {
  toast.info(title, message);
}

export function showWarning(title: string, message: string) {
  toast.warning(title, message);
}

export function showError(title: string, message: string) {
  toast.error(title, message);
}

export function showMessage(title: string, message: string) {
  toast.info(title, message);
}

export function confirmAction(
  title: string,
  message: string,
  onConfirm: () => void,
  confirmLabel = "Eliminar"
) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }

    return;
  }

  Alert.alert(title, message, [
    {
      text: "Cancelar",
      style: "cancel"
    },
    {
      text: confirmLabel,
      style: "destructive",
      onPress: onConfirm
    }
  ]);
}