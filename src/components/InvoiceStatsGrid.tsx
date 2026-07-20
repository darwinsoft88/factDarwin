import React from "react";
import { StyleSheet, View } from "react-native";
import { money } from "../sri";
import { StatBox } from "./metrics";

type InvoiceStats = {
  count: number;
  authorized: number;
  creditNotes: number;
  internal: number;
  proformas: number;
  rejected: number;
  totalAuthorized: number;
  retentionTotal: number;
};

type InvoiceStatsGridProps = {
  stats: InvoiceStats;
};

export function InvoiceStatsGrid({ stats }: InvoiceStatsGridProps) {
  return (
    <View style={styles.statsGrid}>
      <StatBox label="Emitidas" value={String(stats.count)} icon="file-document-outline" />
      <StatBox label="Autorizadas" value={String(stats.authorized)} icon="check-decagram-outline" />
      <StatBox label="Notas credito" value={String(stats.creditNotes)} icon="file-undo-outline" />
      <StatBox label="Notas venta" value={String(stats.internal)} icon="receipt" />
      <StatBox label="Proformas" value={String(stats.proformas)} icon="file-eye-outline" />
      <StatBox label="Rechazadas" value={String(stats.rejected)} icon="alert-circle-outline" />
      <StatBox label="Total aut." value={`$${money(stats.totalAuthorized)}`} icon="cash-check" />
      <StatBox label="Retenciones" value={`$${money(stats.retentionTotal)}`} icon="file-percent-outline" />
    </View>
  );
}

const styles = StyleSheet.create({
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  }
});
