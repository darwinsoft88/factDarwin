import React from "react";
import { Empty, Section } from "./common";
import { PaginationControls } from "./PaginationControls";
import { LIST_BATCH_SIZE } from "../constants/app";
import { money } from "../sri";
import { AppData, CreditPayment } from "../types";
import { creditPaymentScopeText, isCreditPaymentVoided } from "../utils/credit";
import { documentNumber } from "../utils/documents";
import { formatShortDate } from "../utils/format";
import { paymentLabel } from "../utils/reportFormats";

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
  ListItemComponent,
  onOpenReceipt,
  onPageChange,
  onVoidPayment,
  page,
  payments,
  showClientInTitle = true,
  title,
  visiblePayments
}: CreditPaymentsSectionProps) {
  return (
    <Section title={title}>
      {payments.length === 0 ? <Empty text={emptyText} /> : null}
      {visiblePayments.map((payment) => {
        const sale = data.sales.find((item) => item.id === payment.saleId);
        const client = data.clients.find((item) => item.id === payment.clientId);
        return (
          <ListItemComponent
            key={payment.id}
            title={showClientInTitle ? `${client?.name || "Cliente"} | $${money(payment.amount)}` : `Abono $${money(payment.amount)}`}
            meta={`${formatShortDate(payment.createdAt)} | ${sale ? documentNumber(sale, data.issuer) : "Documento"} | Cobro: ${creditPaymentScopeText(payment, data)} | ${paymentLabel(payment.paymentMethod)}${payment.note ? ` | ${payment.note}` : ""}${isCreditPaymentVoided(payment) ? ` | Anulado ${payment.voidedAt ? formatShortDate(payment.voidedAt) : ""}` : ""}`}
            badge={isCreditPaymentVoided(payment) ? "ANULADO" : "ABONO"}
            cancelLabel={!isCreditPaymentVoided(payment) ? "Anular" : undefined}
            secondaryLabel="Recibo"
            onCancel={() => onVoidPayment(payment)}
            onOpen={() => onOpenReceipt(payment)}
            onSecondary={() => onOpenReceipt(payment)}
          />
        );
      })}
      <PaginationControls page={page} pageSize={LIST_BATCH_SIZE} totalItems={payments.length} onPageChange={onPageChange} />
    </Section>
  );
}
