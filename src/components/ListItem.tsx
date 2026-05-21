import React, { useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";

export type ActionHandler = () => void | Promise<void>;

export function ListItem({
  title,
  meta,
  badge,
  secondaryLabel,
  emailLabel,
  whatsappLabel,
  retryLabel,
  supportLabel,
  invoiceLabel,
  ticketLabel,
  proformaInvoiceLabel,
  creditNoteLabel,
  retentionLabel,
  cancelLabel,
  editLabel,
  onDelete,
  onOpen,
  onSecondary,
  onEmail,
  onWhatsapp,
  onRetry,
  onSupport,
  onInvoice,
  onTicket,
  onProformaInvoice,
  onCreditNote,
  onRetention,
  onCancel,
  onEdit
}: {
  title: string;
  meta: string;
  badge?: string;
  secondaryLabel?: string;
  emailLabel?: string;
  whatsappLabel?: string;
  retryLabel?: string;
  supportLabel?: string;
  invoiceLabel?: string;
  ticketLabel?: string;
  proformaInvoiceLabel?: string;
  creditNoteLabel?: string;
  retentionLabel?: string;
  cancelLabel?: string;
  editLabel?: string;
  onDelete?: ActionHandler;
  onOpen?: ActionHandler;
  onSecondary?: ActionHandler;
  onEmail?: ActionHandler;
  onWhatsapp?: ActionHandler;
  onRetry?: ActionHandler;
  onSupport?: ActionHandler;
  onInvoice?: ActionHandler;
  onTicket?: ActionHandler;
  onProformaInvoice?: ActionHandler;
  onCreditNote?: ActionHandler;
  onRetention?: ActionHandler;
  onCancel?: ActionHandler;
  onEdit?: ActionHandler;
}) {
  const [actionsVisible, setActionsVisible] = useState(false);
  const [processingActionLabel, setProcessingActionLabel] = useState("");
  const actions = [
    secondaryLabel && onSecondary ? { label: secondaryLabel, onPress: onSecondary, tone: "info" as const } : null,
    emailLabel && onEmail ? { label: emailLabel, onPress: onEmail, tone: "success" as const } : null,
    whatsappLabel && onWhatsapp ? { label: whatsappLabel, onPress: onWhatsapp, tone: "success" as const } : null,
    retryLabel && onRetry ? { label: retryLabel, onPress: onRetry, tone: "warning" as const } : null,
    supportLabel && onSupport ? { label: supportLabel, onPress: onSupport, tone: "info" as const } : null,
    invoiceLabel && onInvoice ? { label: invoiceLabel, onPress: onInvoice, tone: "primary" as const } : null,
    ticketLabel && onTicket ? { label: ticketLabel, onPress: onTicket, tone: "primary" as const } : null,
    proformaInvoiceLabel && onProformaInvoice ? { label: proformaInvoiceLabel, onPress: onProformaInvoice, tone: "primary" as const } : null,
    creditNoteLabel && onCreditNote ? { label: creditNoteLabel, onPress: onCreditNote, tone: "warning" as const } : null,
    retentionLabel && onRetention ? { label: retentionLabel, onPress: onRetention, tone: "info" as const } : null,
    editLabel && onEdit ? { label: editLabel, onPress: onEdit, tone: "info" as const } : null,
    cancelLabel && onCancel ? { label: cancelLabel, onPress: onCancel, tone: "danger" as const } : null,
    onDelete ? { label: "Eliminar", onPress: onDelete, tone: "danger" as const } : null
  ].filter((action): action is { label: string; onPress: ActionHandler; tone: "primary" | "success" | "warning" | "info" | "danger" } => Boolean(action));
  const compactActions = actions.length > 2;
  const isProcessingAction = Boolean(processingActionLabel);
  const runAction = async (label: string, action: ActionHandler) => {
    if (isProcessingAction) return;
    setProcessingActionLabel(label);
    setActionsVisible(false);
    try {
      await Promise.resolve(action());
    } catch (error) {
      Alert.alert("Accion no completada", error instanceof Error ? error.message : "No se pudo completar la accion.");
    } finally {
      setProcessingActionLabel("");
    }
  };

  return (
    <Pressable style={styles.listItem} onPress={onOpen} disabled={isProcessingAction}>
      <View style={styles.flex}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemTitle} numberOfLines={2}>{title}</Text>
          {badge ? <Text style={[styles.badge, badge === "AUTORIZADA" && styles.badgeOk, badge === "RECHAZADA" && styles.badgeError, badge === "ANULADA" && styles.badgeNeutral, badge === "INTERNA" && styles.badgeInfo, badge === "PROFORMA" && styles.badgeWarning]}>{badge}</Text> : null}
        </View>
        <Text style={styles.itemMeta} numberOfLines={2}>
          {meta}
        </Text>
      </View>
      {compactActions ? (
        <View style={styles.actionGroup}>
          <Pressable style={[styles.actionsButton, isProcessingAction && styles.disabledActionButton]} onPress={() => setActionsVisible(true)} disabled={isProcessingAction}>
            <Text style={styles.actionsButtonText}>{isProcessingAction ? "Procesando..." : "Acciones"}</Text>
          </Pressable>
          <Modal visible={actionsVisible} transparent animationType="fade" onRequestClose={() => setActionsVisible(false)}>
            <Pressable style={styles.actionModalBackdrop} onPress={() => setActionsVisible(false)}>
              <Pressable style={styles.actionSheet}>
                <Text style={styles.actionSheetTitle}>{title}</Text>
                <Text style={styles.actionSheetMeta} numberOfLines={2}>{meta}</Text>
                {actions.map((action) => (
                  <Pressable key={action.label} style={[styles.actionSheetButton, action.tone === "danger" && styles.actionSheetDanger]} onPress={() => { void runAction(action.label, action.onPress); }}>
                    <Text style={[styles.actionSheetButtonText, action.tone === "danger" && styles.actionSheetDangerText]}>{action.label}</Text>
                  </Pressable>
                ))}
                <Pressable style={styles.actionSheetCancel} onPress={() => setActionsVisible(false)}>
                  <Text style={styles.actionSheetCancelText}>Cerrar</Text>
                </Pressable>
              </Pressable>
            </Pressable>
          </Modal>
        </View>
      ) : actions.length > 0 ? (
        <View style={styles.actionGroup}>
          {actions.map((action) => (
            <Pressable key={action.label} style={[actionButtonStyle(action.tone), isProcessingAction && styles.disabledActionButton]} onPress={() => { void runAction(action.label, action.onPress); }} disabled={isProcessingAction}>
              <Text style={actionButtonTextStyle(action.tone)}>{processingActionLabel === action.label ? "Procesando..." : action.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

function actionButtonStyle(tone: "primary" | "success" | "warning" | "info" | "danger") {
  if (tone === "primary") return styles.invoiceButton;
  if (tone === "success") return styles.emailButton;
  if (tone === "warning") return styles.retryButton;
  if (tone === "danger") return styles.cancelButton;
  return styles.rideButton;
}

function actionButtonTextStyle(tone: "primary" | "success" | "warning" | "info" | "danger") {
  if (tone === "primary") return styles.invoiceButtonText;
  if (tone === "success") return styles.emailButtonText;
  if (tone === "warning") return styles.retryButtonText;
  if (tone === "danger") return styles.cancelButtonText;
  return styles.rideButtonText;
}

const styles = StyleSheet.create({
  listItem: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#dfe6ef",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: "#ffffff",
    shadowColor: "#0f172a",
    shadowOpacity: 0.035,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1
  },
  flex: {
    flex: 1,
    minWidth: 130
  },
  itemTitle: {
    color: "#111827",
    fontWeight: "900",
    flexShrink: 1
  },
  itemHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8
  },
  itemMeta: {
    marginTop: 2,
    color: "#6b7280",
    fontSize: 12
  },
  badge: {
    borderRadius: 8,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#e5e7eb",
    color: "#374151",
    fontSize: 10,
    fontWeight: "900",
    minWidth: 76,
    textAlign: "center"
  },
  badgeOk: {
    backgroundColor: "#dcfce7",
    color: "#166534"
  },
  badgeError: {
    backgroundColor: "#fee2e2",
    color: "#991b1b"
  },
  badgeNeutral: {
    backgroundColor: "#e5e7eb",
    color: "#374151"
  },
  badgeInfo: {
    backgroundColor: "#dbeafe",
    color: "#1d4ed8"
  },
  badgeWarning: {
    backgroundColor: "#fef3c7",
    color: "#92400e"
  },
  actionGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
    justifyContent: "flex-end",
    flexShrink: 0
  },
  actionsButton: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#111827",
    minWidth: 86,
    alignItems: "center"
  },
  actionsButtonText: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 12
  },
  disabledActionButton: {
    opacity: 0.72
  },
  actionModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
    justifyContent: "flex-end",
    padding: 14
  },
  actionSheet: {
    borderRadius: 12,
    backgroundColor: "#ffffff",
    padding: 14,
    gap: 9,
    borderWidth: 1,
    borderColor: "#e5e7eb"
  },
  actionSheetTitle: {
    color: "#111827",
    fontWeight: "900",
    fontSize: 15
  },
  actionSheetMeta: {
    color: "#64748b",
    fontSize: 12,
    marginBottom: 4
  },
  actionSheetButton: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  actionSheetButtonText: {
    color: "#0f172a",
    fontWeight: "900",
    textAlign: "center"
  },
  actionSheetDanger: {
    backgroundColor: "#fee2e2"
  },
  actionSheetDangerText: {
    color: "#991b1b"
  },
  actionSheetCancel: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  actionSheetCancelText: {
    color: "#0f5f59",
    fontWeight: "900",
    textAlign: "center"
  },
  rideButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#dbeafe"
  },
  rideButtonText: {
    color: "#1d4ed8",
    fontWeight: "900",
    fontSize: 12
  },
  emailButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#dcfce7"
  },
  emailButtonText: {
    color: "#166534",
    fontWeight: "900",
    fontSize: 12
  },
  retryButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#fef3c7"
  },
  retryButtonText: {
    color: "#92400e",
    fontWeight: "900",
    fontSize: 12
  },
  invoiceButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#ccfbf1"
  },
  invoiceButtonText: {
    color: "#0f766e",
    fontWeight: "900",
    fontSize: 12
  },
  cancelButton: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#fee2e2"
  },
  cancelButtonText: {
    color: "#991b1b",
    fontWeight: "900",
    fontSize: 12
  }
});
