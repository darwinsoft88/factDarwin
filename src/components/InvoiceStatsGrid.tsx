import React from "react";
import { StyleSheet, View } from "react-native";
import { money } from "../services/sri";
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
      <StatBox label="Emitidas" value={String(stats.count)} />
      <StatBox label="Autorizadas" value={String(stats.authorized)} />
      <StatBox label="Notas credito" value={String(stats.creditNotes)} />
      <StatBox label="Notas venta" value={String(stats.internal)} />
      <StatBox label="Proformas" value={String(stats.proformas)} />
      <StatBox label="Rechazadas" value={String(stats.rejected)} />
      <StatBox label="Total aut." value={`$${money(stats.totalAuthorized)}`} />
      <StatBox label="Retenciones" value={`$${money(stats.retentionTotal)}`} />
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
