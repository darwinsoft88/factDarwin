import React from "react";
import { StyleSheet, View } from "react-native";
import { StatBox } from "./metrics";
import { money } from "../sri";
import { useReportsState } from "../hooks/useReportsState";

type SalesReportSummary = ReturnType<typeof useReportsState>["report"];

export function ReportStatsGrid({ report }: { report: SalesReportSummary }) {
  const creditTotal = report.byPayment.CREDITO || 0;
  const collectedTotal = Object.entries(report.byPayment).reduce((sum, [code, total]) => (code === "CREDITO" ? sum : sum + total), 0);

  return (
    <View style={styles.statsGrid}>
      <StatBox label="Documentos" value={String(report.sales.length)} icon="file-document-outline" />
      <StatBox label="Con valor" value={String(report.effectiveCount)} icon="cash-check" />
      <StatBox label="Autorizadas" value={String(report.authorizedCount)} icon="check-decagram-outline" />
      <StatBox label="Subtotal" value={`$${money(report.subtotal)}`} icon="calculator-variant-outline" />
      <StatBox label="Total ventas" value={`$${money(report.total)}`} icon="cash-multiple" />
      <StatBox label="Cobrado" value={`$${money(collectedTotal)}`} icon="cash-check" />
      <StatBox label="A credito" value={`$${money(creditTotal)}`} icon="credit-card-clock-outline" />
      <StatBox label="IVA" value={`$${money(report.iva15)}`} icon="file-percent-outline" />
      <StatBox label="Utilidad" value={`$${money(report.profit)}`} icon="trending-up" />
      <StatBox label="Neto ret." value={`$${money(report.netCollected)}`} icon="bank-transfer-in" />
      <StatBox label="104 a pagar" value={`$${money(report.iva104.estimatedIvaPayable)}`} icon="file-chart-outline" />
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
