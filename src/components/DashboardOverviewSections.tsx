import React from "react";
import { StyleSheet, View } from "react-native";
import { Section } from "./common";
import { OperationTile, StatBox } from "./metrics";
import { licenseStatusLabel } from "../utils/appAccess";
import { buildDashboard } from "../utils/dashboard";
import { AppData } from "../types";
import { money } from "../sri";

type DashboardSummary = ReturnType<typeof buildDashboard>;

type DashboardOverviewSectionsProps = {
  activePoints: number;
  attentionCount: number;
  dashboard: DashboardSummary;
  license: AppData["license"];
  licenseActive: boolean;
  licenseDaysLeft: number;
  licenseLabel: string;
  maxPoints: number;
};

export function DashboardOverviewSections({
  activePoints,
  attentionCount,
  dashboard,
  license,
  licenseActive,
  licenseDaysLeft,
  licenseLabel,
  maxPoints
}: DashboardOverviewSectionsProps) {
  return (
    <>
      <Section title="Estado de operacion">
        <View style={styles.operationGrid}>
          <OperationTile
            title="Licencia"
            value={licenseActive ? `${Math.max(0, licenseDaysLeft)} dias` : licenseLabel}
            detail={licenseStatusLabel(license)}
            tone={licenseActive ? "success" : "danger"}
            icon="shield-check-outline"
          />
          <OperationTile
            title="Puntos de emision"
            value={maxPoints >= 999 ? `${activePoints} activos` : `${activePoints}/${maxPoints}`}
            detail={maxPoints >= 999 ? "Plan con multi punto habilitado" : "Limite controlado por plan"}
            tone={activePoints <= maxPoints ? "success" : "danger"}
            icon="store-outline"
          />
          <OperationTile
            title="Atencion"
            value={String(attentionCount)}
            detail={attentionCount === 0 ? "Sin pendientes criticos" : "Pendientes, rechazos o stock bajo"}
            tone={attentionCount === 0 ? "success" : "warning"}
            icon="bell-alert-outline"
          />
        </View>
      </Section>

      <Section title="Resumen rapido">
        <View style={styles.statsGrid}>
          <StatBox label="Ventas hoy" value={`$${money(dashboard.todayTotal)}`} tone="success" icon="cash-register" />
          <StatBox label="Ventas mes" value={`$${money(dashboard.monthTotal)}`} tone="info" icon="chart-line" />
          <StatBox label="IVA mes" value={`$${money(dashboard.monthTax)}`} icon="file-percent-outline" />
          <StatBox label="Utilidad mes" value={`$${money(dashboard.monthProfit)}`} tone={dashboard.monthProfit >= 0 ? "success" : "warning"} icon="trending-up" />
          <StatBox label="Pendientes" value={String(dashboard.pendingCount)} tone={dashboard.pendingCount > 0 ? "warning" : "success"} icon="clock-outline" />
          <StatBox label="Rechazadas" value={String(dashboard.rejectedCount)} tone={dashboard.rejectedCount > 0 ? "danger" : "success"} icon="alert-circle-outline" />
          <StatBox label="Stock bajo" value={String(dashboard.lowStock.length)} tone={dashboard.lowStock.length > 0 ? "warning" : "success"} icon="package-variant-closed" />
        </View>
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  operationGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  }
});
