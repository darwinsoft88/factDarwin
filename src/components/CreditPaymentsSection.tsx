import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Empty, Section } from "./common";
import { PaginationControls } from "./PaginationControls";
import { LIST_BATCH_SIZE } from "../constants/app";
import { money } from "../sri";
import { AppData, CreditPayment } from "../types";
import { creditPaymentScopeText, isCreditPaymentVoided } from "../utils/credit";
import { documentNumber } from "../utils/documents";
import { formatShortDate } from "../utils/format";
import { paymentLabel } from "../utils/reportFormats";
import { useAppTheme } from "../theme/AppTheme";
import { ThemedAccentCard } from "./ThemedAccentCard";

export type CreditListItemProps = {
  title: string;
  meta: string;
  badge?: string;
  cancelLabel?: string;
  secondaryLabel?: string;
  onCancel?: () => void;
  onSecondary?: () => void;
  onOpen?: () => void;
};

type CreditPaymentsSectionProps = {
  data: AppData;
  emptyText: string;
  ListItemComponent: React.ComponentType<CreditListItemProps>;
  onOpenReceipt: (payment: CreditPayment) => void;
  onPageChange: (page: number) => void;
  onVoidPayment: (payment: CreditPayment) => void;
  page: number;
  payments: CreditPayment[];
  showClientInTitle?: boolean;
  title: string;
  visiblePayments: CreditPayment[];
};

export function CreditPaymentsSection({
  data,
  emptyText,
  onOpenReceipt,
  onPageChange,
  onVoidPayment,
  page,
  payments,
  showClientInTitle = true,
  title,
  visiblePayments
}: CreditPaymentsSectionProps) {
  const { theme } = useAppTheme();
  return (
    <Section title={title}>
      {payments.length === 0 ? <Empty text={emptyText} /> : null}
      {visiblePayments.map((payment) => {
        const sale = data.sales.find((item) => item.id === payment.saleId);
        const client = data.clients.find((item) => item.id === payment.clientId);
        const voided = isCreditPaymentVoided(payment);
        return (
          <ThemedAccentCard key={payment.id} tone={voided ? "danger" : "primary"} style={[styles.paymentCard, voided && { opacity: 0.72 }]}>
            <View style={[styles.paymentIcon, { backgroundColor: voided ? theme.colors.dangerSoft : theme.colors.primarySoft }]}>
              <MaterialCommunityIcons name={voided ? "cash-remove" : "cash-check"} size={18} color={voided ? theme.colors.danger : theme.colors.primary} />
            </View>
            <Pressable style={styles.paymentInfo} onPress={() => onOpenReceipt(payment)}>
              <View style={styles.paymentTitleRow}>
                <Text style={[styles.paymentTitle, { color: theme.colors.text }]} numberOfLines={1}>{showClientInTitle ? `${client?.name || "Cliente"} | $${money(payment.amount)}` : `Abono $${money(payment.amount)}`}</Text>
                <Text numberOfLines={1} style={[styles.paymentBadge, { color: voided ? theme.colors.danger : theme.colors.primary, backgroundColor: voided ? theme.colors.dangerSoft : theme.colors.primarySoft }]}>{voided ? "ANULADO" : "ABONO"}</Text>
              </View>
              <Text style={[styles.paymentMeta, { color: theme.colors.textMuted }]}>{formatShortDate(payment.createdAt)} | {sale ? documentNumber(sale, data.issuer) : "Documento"}</Text>
              <Text style={[styles.paymentMeta, { color: theme.colors.textMuted }]}>Cobro: {creditPaymentScopeText(payment, data)}</Text>
              <Text style={[styles.paymentMeta, { color: theme.colors.textMuted }]}>{paymentLabel(payment.paymentMethod)}{payment.note ? ` | ${payment.note}` : ""}{voided && payment.voidedAt ? ` | Anulado ${formatShortDate(payment.voidedAt)}` : ""}</Text>
            </Pressable>
            <View style={styles.paymentActions}>
              <Pressable style={[styles.receiptButton, { borderColor: theme.colors.info }]} onPress={() => onOpenReceipt(payment)}>
                <MaterialCommunityIcons name="receipt-text-outline" size={16} color={theme.colors.info} />
                <Text style={[styles.actionText, { color: theme.colors.info }]}>Recibo</Text>
              </Pressable>
              {!voided ? (
                <Pressable style={[styles.voidButton, { borderColor: theme.colors.danger }]} onPress={() => onVoidPayment(payment)}>
                  <MaterialCommunityIcons name="trash-can-outline" size={16} color={theme.colors.danger} />
                  <Text style={[styles.actionText, { color: theme.colors.danger }]}>Anular</Text>
                </Pressable>
              ) : null}
            </View>
          </ThemedAccentCard>
        );
      })}
      <PaginationControls page={page} pageSize={LIST_BATCH_SIZE} totalItems={payments.length} onPageChange={onPageChange} />
    </Section>
  );
}

const styles = StyleSheet.create({
  paymentCard: {
    padding: 10,
    gap: 10,
    flexDirection: "row",
    alignItems: "center"
  },
  paymentIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center"
  },
  paymentInfo: {
    flex: 1,
    minWidth: 0,
    gap: 3
  },
  paymentTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  paymentTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "900"
  },
  paymentBadge: {
    flexShrink: 0,
    minWidth: 46,
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 3,
    fontSize: 9,
    fontWeight: "900",
    textAlign: "center"
  },
  paymentMeta: {
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15
  },
  paymentActions: {
    gap: 7
  },
  receiptButton: {
    minWidth: 82,
    minHeight: 36,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5
  },
  voidButton: {
    minWidth: 82,
    minHeight: 36,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5
  },
  actionText: {
    fontSize: 11,
    fontWeight: "900"
  }
});
