import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { InvoiceStatus } from "../types";
import { displayInvoiceStatus } from "../utils/invoiceStatus";
import { createListAction, ListItemActions } from "./ListItemActions";
import type { ActionHandler, ListAction } from "./ListItemActions";

export type { ActionHandler } from "./ListItemActions";

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
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const actions = [
    secondaryLabel && onSecondary ? createListAction(secondaryLabel, onSecondary, "info", "file-document-outline") : null,
    emailLabel && onEmail ? createListAction(emailLabel, onEmail, "success", "email-outline") : null,
    whatsappLabel && onWhatsapp ? createListAction(whatsappLabel, onWhatsapp, "success", "whatsapp") : null,
    retryLabel && onRetry ? createListAction(retryLabel, onRetry, "warning", "refresh") : null,
    supportLabel && onSupport ? createListAction(supportLabel, onSupport, "info", "lifebuoy") : null,
    invoiceLabel && onInvoice ? createListAction(invoiceLabel, onInvoice, "primary", "file-check-outline") : null,
    ticketLabel && onTicket ? createListAction(ticketLabel, onTicket, "primary", "ticket-confirmation-outline") : null,
    proformaInvoiceLabel && onProformaInvoice ? createListAction(proformaInvoiceLabel, onProformaInvoice, "primary", "file-replace-outline") : null,
    creditNoteLabel && onCreditNote ? createListAction(creditNoteLabel, onCreditNote, "warning", "file-undo-outline") : null,
    retentionLabel && onRetention ? createListAction(retentionLabel, onRetention, "info", "percent-outline") : null,
    editLabel && onEdit ? createListAction(editLabel, onEdit, "info", "pencil-outline") : null,
    cancelLabel && onCancel ? createListAction(cancelLabel, onCancel, "danger", "cancel") : null,
    onDelete ? createListAction("Eliminar", onDelete, "danger", "trash-can-outline") : null
  ].filter((item): item is ListAction => Boolean(item));

  return (
    <View style={styles.listItem}>
      <Pressable style={styles.flex} onPress={onOpen} disabled={!onOpen || isProcessingAction}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemTitle} numberOfLines={2}>{title}</Text>
          {badge ? <Text style={[styles.badge, badge === "AUTORIZADA" && styles.badgeOk, (badge === "DEVUELTA" || badge === "ERROR_SRI") && styles.badgeError, (badge === "ANULADA" || badge === "CONVERTIDA") && styles.badgeNeutral, (badge === "TICKET_OFFLINE" || badge === "FIRMADA" || badge === "ENVIADA" || badge === "ENVIADA_SRI" || badge === "PENDIENTE_SRI") && styles.badgeInfo, badge === "PROFORMA" && styles.badgeWarning]}>{displayInvoiceStatus(badge as InvoiceStatus)}</Text> : null}
        </View>
        <Text style={styles.itemMeta} numberOfLines={3}>
          {meta}
        </Text>
      </Pressable>
      <ListItemActions title={title} meta={meta} actions={actions} onProcessingChange={setIsProcessingAction} />
    </View>
  );
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
  }
});
