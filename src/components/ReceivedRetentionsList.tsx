import React from "react";
import { money } from "../services/sri";
import { Client, Issuer, ReceivedRetention, Sale } from "../types";
import { formatShortDate } from "../utils/format";
import { formatReceivedRetentionDetail } from "../utils/documentDetails";
import { documentNumber } from "../utils/documents";
import { Empty } from "./common";
import { ListItem } from "./ListItem";

type ReceivedRetentionsListProps = {
  retentions: ReceivedRetention[];
  sales: Sale[];
  clients: Client[];
  issuer: Issuer;
  visibleCount: number;
  canOpenDetail: boolean;
  onOpenDetail: (detail: string) => void;
};

export function ReceivedRetentionsList({
  retentions,
  sales,
  clients,
  issuer,
  visibleCount,
  canOpenDetail,
  onOpenDetail
}: ReceivedRetentionsListProps) {
  return (
    <>
      {retentions.length === 0 ? <Empty text="Aun no hay retenciones recibidas." /> : null}
      {retentions.slice(0, visibleCount).map((retention) => {
        const sale = sales.find((item) => item.id === retention.saleId);
        const client = clients.find((item) => item.id === retention.clientId);
        return (
          <ListItem
            key={retention.id}
            title={`${retention.taxType} ${retention.documentNumber}`}
            meta={`${formatShortDate(retention.receivedAt)} | ${client?.name || "Cliente"} | Factura ${sale ? documentNumber(sale, issuer) : ""} | Base $${money(retention.base)} | ${money(retention.percentage)}% | Retenido $${money(retention.amount)}`}
            badge="RETENCION"
            onOpen={canOpenDetail ? () => onOpenDetail(formatReceivedRetentionDetail(retention, sale, client, issuer)) : undefined}
          />
        );
      })}
    </>
  );
}
