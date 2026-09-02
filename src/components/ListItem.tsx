import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { InvoiceStatus } from "../types";
import { displayInvoiceStatus } from "../utils/invoiceStatus";
import { createListAction, ListItemActions } from "./ListItemActions";
import type { ActionHandler, ListAction } from "./ListItemActions";
import { useAppTheme } from "../theme/AppTheme";
import type { AccentCardTone } from "./ThemedAccentCard";

export type { ActionHandler } from "./ListItemActions";

export function ListItem({
  title,
  titleReference,
  meta,
  cardMeta,
  trailingValue,
  badge,
  accentTone,
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
  onEdit,
  leading
}: {
  title: string;
  titleReference?: string;
  meta: string;
  cardMeta?: string;
  trailingValue?: string;
  badge?: string;
  accentTone?: AccentCardTone;
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
  leading?: React.ReactNode;
}) {
  const { theme } = useAppTheme();
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
    <View style={[styles.listItem, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, shadowColor: theme.colors.shadow }, accentTone && { borderLeftWidth: 4, borderLeftColor: theme.colors[accentTone] }]}>
      {leading}
      <Pressable style={styles.flex} onPress={onOpen} disabled={!onOpen || isProcessingAction}>
        {trailingValue ? (
          <>
            <View style={styles.titleValueRow}>
              <View style={styles.titleBlock}>
                {titleReference ? <Text style={[styles.titleReference, { color: theme.colors.textMuted }]} numberOfLines={1}>{titleReference}</Text> : null}
                <Text style={[styles.itemTitle, { color: theme.colors.text }]} numberOfLines={2}>{title}</Text>
              </View>
              <Text style={[styles.trailingValue, { color: theme.colors.primary }]} numberOfLines={1}>{trailingValue}</Text>
            </View>
            {badge ? <Text style={[styles.badge, styles.standaloneBadge, { backgroundColor: theme.colors.surfaceMuted, color: theme.colors.textMuted }, badge === "AUTORIZADA" && { backgroundColor: theme.colors.successSoft, color: theme.colors.success }, (badge === "DEVUELTA" || badge === "ERROR_SRI") && { backgroundColor: theme.colors.dangerSoft, color: theme.colors.danger }, (badge === "ANULADA" || badge === "CONVERTIDA") && { backgroundColor: theme.colors.surfaceMuted, color: theme.colors.textMuted }, (badge === "TICKET_OFFLINE" || badge === "FIRMADA" || badge === "ENVIADA" || badge === "ENVIADA_SRI" || badge === "PENDIENTE_SRI") && { backgroundColor: theme.colors.infoSoft, color: theme.colors.info }, badge === "PROFORMA" && { backgroundColor: theme.colors.warningSoft, color: theme.colors.warning }]}>{displayInvoiceStatus(badge as InvoiceStatus)}</Text> : null}
          </>
        ) : (
          <View style={styles.itemHeader}>
            <Text style={[styles.itemTitle, { color: theme.colors.text }]} numberOfLines={2}>{title}</Text>
            {badge ? <Text style={[styles.badge, { backgroundColor: theme.colors.surfaceMuted, color: theme.colors.textMuted }, badge === "AUTORIZADA" && { backgroundColor: theme.colors.successSoft, color: theme.colors.success }, (badge === "DEVUELTA" || badge === "ERROR_SRI") && { backgroundColor: theme.colors.dangerSoft, color: theme.colors.danger }, (badge === "ANULADA" || badge === "CONVERTIDA") && { backgroundColor: theme.colors.surfaceMuted, color: theme.colors.textMuted }, (badge === "TICKET_OFFLINE" || badge === "FIRMADA" || badge === "ENVIADA" || badge === "ENVIADA_SRI" || badge === "PENDIENTE_SRI") && { backgroundColor: theme.colors.infoSoft, color: theme.colors.info }, badge === "PROFORMA" && { backgroundColor: theme.colors.warningSoft, color: theme.colors.warning }]}>{displayInvoiceStatus(badge as InvoiceStatus)}</Text> : null}
          </View>
        )}
        <Text style={[styles.itemMeta, { color: theme.colors.textMuted }]} numberOfLines={3}>
          {cardMeta ?? meta}
        </Text>
      </Pressable>
      <ListItemActions title={titleReference ? `${titleReference} - ${title}` : title} meta={meta} actions={actions} onProcessingChange={setIsProcessingAction} />
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
  titleValueRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  titleBlock: {
    flex: 1,
    minWidth: 0
  },
  titleReference: {
    marginBottom: 1,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800"
  },
  trailingValue: {
    flexShrink: 0,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    textAlign: "right"
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
  standaloneBadge: {
    alignSelf: "flex-start",
    marginTop: 5
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
