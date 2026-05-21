import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Empty, Section } from "../components/common";
import { AlertRow, OperationTile, QuickAction, StatBox } from "../components/metrics";
import { licensePlanOptions } from "../constants/options";
import { AppData, Sale, User } from "../types";
import { productMinStock, saleProfitValue } from "../utils/accounting";
import { AppTab, appLicenseStatus, compactLicenseStatusLabel, licenseStatusLabel, tabsForRole } from "../utils/appAccess";
import { buildDashboard } from "../utils/dashboard";
import { activeEstablishment } from "../utils/establishments";
import { documentNumber } from "../utils/documents";
import { formatShortDate } from "../utils/format";
import { maxEmissionPointsForLicense, normalizeLicensePlanValue } from "../utils/license";
import { documentTypeLabel } from "../utils/sales";
import { money } from "../services/sri";

type DashboardListItemProps = {
  title: string;
  meta: string;
  badge?: string;
  secondaryLabel?: string;
  onOpen?: () => void;
  onSecondary?: () => void;
};

export function DashboardScreen({
  data,
  user,
  onNavigate,
  ListItemComponent
}: {
  data: AppData;
  user: User;
  onNavigate: (tab: AppTab) => void;
  ListItemComponent: React.ComponentType<DashboardListItemProps>;
}) {
  const dashboard = useMemo(() => buildDashboard(data), [data]);
  const allowedTabs = tabsForRole(user.role);
  const primaryTab: AppTab = allowedTabs.includes("ventas") ? "ventas" : allowedTabs.includes("caja") ? "caja" : "reportes";
  const licenseState = appLicenseStatus(data.license);
  const currentEstablishment = activeEstablishment(data.issuer);
  const planName = licensePlanOptions.find((option) => option.value === normalizeLicensePlanValue(data.license?.plan))?.label || "Demo";
  const maxPoints = maxEmissionPointsForLicense(data.license);
  const activePoints = data.issuer.establishments?.length || 1;
  const attentionCount = dashboard.pendingCount + dashboard.rejectedCount + dashboard.lowStock.length;
  const operationalTone = !licenseState.active ? "danger" : attentionCount > 0 ? "warning" : "success";

  return (
    <View style={styles.stack}>
      <View style={styles.dashboardHero}>
        <View style={styles.heroMain}>
          <View style={styles.heroTopLine}>
            <Text style={styles.dashboardEyebrow}>Panel de control</Text>
            <Text style={[styles.heroStatusPill, operationalTone === "danger" && styles.heroStatusDanger, operationalTone === "warning" && styles.heroStatusWarning]}>
              {operationalTone === "success" ? "Todo listo" : operationalTone === "warning" ? "Revisar" : "Licencia"}
            </Text>
          </View>
          <View style={styles.heroAmountRow}>
            <View style={styles.flex}>
              <Text style={styles.dashboardTitle}>${money(dashboard.todayTotal)}</Text>
              <Text style={styles.dashboardText}>{dashboard.todayCount} documento(s) efectivo(s) hoy</Text>
            </View>
            <Pressable style={styles.heroButton} onPress={() => onNavigate(primaryTab)}>
              <Text style={styles.heroButtonText}>{primaryTab === "ventas" ? "Nueva venta" : primaryTab === "caja" ? "Ir a caja" : "Reportes"}</Text>
            </Pressable>
          </View>
          <View style={styles.heroMetaGrid}>
            <View style={styles.heroMetaItem}>
              <Text style={styles.heroMetaValue}>{planName}</Text>
              <Text style={styles.heroMetaLabel}>Plan</Text>
            </View>
            <View style={styles.heroMetaItem}>
              <Text style={styles.heroMetaValue}>{currentEstablishment.establishment}-{currentEstablishment.emissionPoint}</Text>
              <Text style={styles.heroMetaLabel}>Punto activo</Text>
            </View>
          </View>
        </View>
      </View>

      <Section title="Estado de operacion">
        <View style={styles.operationGrid}>
          <OperationTile
            title="Licencia"
            value={licenseState.active ? `${Math.max(0, licenseState.daysLeft)} dias` : compactLicenseStatusLabel(data.license)}
            detail={licenseStatusLabel(data.license)}
            tone={licenseState.active ? "success" : "danger"}
          />
          <OperationTile
            title="Puntos de emision"
            value={maxPoints >= 999 ? `${activePoints} activos` : `${activePoints}/${maxPoints}`}
            detail={maxPoints >= 999 ? "Plan con multi punto habilitado" : "Limite controlado por plan"}
            tone={activePoints <= maxPoints ? "success" : "danger"}
          />
          <OperationTile
            title="Atencion"
            value={String(attentionCount)}
            detail={attentionCount === 0 ? "Sin pendientes criticos" : "Pendientes, rechazos o stock bajo"}
            tone={attentionCount === 0 ? "success" : "warning"}
          />
        </View>
      </Section>

      <Section title="Resumen rapido">
        <View style={styles.statsGrid}>
          <StatBox label="Ventas hoy" value={`$${money(dashboard.todayTotal)}`} tone="success" />
          <StatBox label="Ventas mes" value={`$${money(dashboard.monthTotal)}`} tone="info" />
          <StatBox label="IVA mes" value={`$${money(dashboard.monthTax)}`} />
          <StatBox label="Utilidad mes" value={`$${money(dashboard.monthProfit)}`} tone={dashboard.monthProfit >= 0 ? "success" : "warning"} />
          <StatBox label="Pendientes" value={String(dashboard.pendingCount)} tone={dashboard.pendingCount > 0 ? "warning" : "success"} />
          <StatBox label="Rechazadas" value={String(dashboard.rejectedCount)} tone={dashboard.rejectedCount > 0 ? "danger" : "success"} />
          <StatBox label="Stock bajo" value={String(dashboard.lowStock.length)} tone={dashboard.lowStock.length > 0 ? "warning" : "success"} />
        </View>
      </Section>

      <Section title="Accesos">
        <View style={styles.quickGrid}>
          {allowedTabs.includes("ventas") ? <QuickAction label="Vender" onPress={() => onNavigate("ventas")} /> : null}
          {allowedTabs.includes("clientes") ? <QuickAction label="Clientes" onPress={() => onNavigate("clientes")} /> : null}
          {allowedTabs.includes("productos") ? <QuickAction label="Productos" onPress={() => onNavigate("productos")} /> : null}
          {allowedTabs.includes("caja") ? <QuickAction label="Caja" onPress={() => onNavigate("caja")} /> : null}
          {allowedTabs.includes("reportes") ? <QuickAction label="Reportes" onPress={() => onNavigate("reportes")} /> : null}
        </View>
      </Section>

      <Section title="Alertas">
        {dashboard.pendingCount > 0 ? <AlertRow title="Facturas por revisar" detail={`${dashboard.pendingCount} factura(s) no autorizada(s). Puede reintentarlas desde Ventas.`} tone="warning" /> : null}
        {dashboard.rejectedCount > 0 ? <AlertRow title="Facturas rechazadas" detail={`${dashboard.rejectedCount} factura(s) requieren correccion o reintento.`} tone="danger" /> : null}
        {dashboard.lowStock.length > 0 ? (
          dashboard.lowStock.slice(0, 5).map((product) => <AlertRow key={product.id} title={product.name} detail={`Stock actual: ${product.stock} | minimo ${productMinStock(product)}`} tone={product.stock <= 0 ? "danger" : "warning"} />)
        ) : (
          <Empty text="Sin alertas importantes por ahora." />
        )}
      </Section>

      <Section title="Ultimos documentos">
        {dashboard.recentSales.length === 0 ? <Empty text="Aun no hay facturas emitidas." /> : null}
        {dashboard.recentSales.map((sale: Sale) => {
          const client = data.clients.find((item) => item.id === sale.clientId);
          return (
            <ListItemComponent
              key={sale.id}
              title={`${documentNumber(sale, data.issuer)} - ${client?.name ?? "Cliente"}`}
              meta={`${formatShortDate(sale.createdAt)} | ${documentTypeLabel(sale)} | $${money(sale.total)} | Util. $${money(saleProfitValue(sale, data.products))} | ${sale.authorizationNumber || sale.accessKey || "Interno"}`}
              badge={sale.status}
              onOpen={() => onNavigate("ventas")}
              secondaryLabel={sale.documentType === "nota_venta" && sale.status === "INTERNA" ? "Ir a facturar" : "Ver"}
              onSecondary={() => onNavigate("ventas")}
            />
          );
        })}
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12
  },
  flex: {
    flex: 1,
    minWidth: 130
  },
  dashboardHero: {
    borderRadius: 8,
    padding: 14,
    backgroundColor: "#0b6b62",
    alignItems: "stretch",
    gap: 12,
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3
  },
  heroMain: {
    gap: 8
  },
  heroTopLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  dashboardEyebrow: {
    color: "#ccfbf1",
    fontSize: 12,
    fontWeight: "800"
  },
  heroStatusPill: {
    borderRadius: 8,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
    color: "#065f46",
    backgroundColor: "#d1fae5",
    fontSize: 10,
    fontWeight: "900"
  },
  heroStatusWarning: {
    color: "#92400e",
    backgroundColor: "#fef3c7"
  },
  heroStatusDanger: {
    color: "#991b1b",
    backgroundColor: "#fee2e2"
  },
  dashboardTitle: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "900",
    marginTop: 3
  },
  dashboardText: {
    color: "#ecfeff",
    marginTop: 2,
    fontWeight: "700"
  },
  heroAmountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  heroMetaGrid: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4
  },
  heroMetaItem: {
    flex: 1,
    minWidth: 0,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "rgba(255, 255, 255, 0.13)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)"
  },
  heroMetaValue: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 12
  },
  heroMetaLabel: {
    color: "#cffafe",
    fontWeight: "700",
    fontSize: 10,
    marginTop: 2
  },
  heroButton: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#ffffff",
    alignSelf: "center",
    minWidth: 112,
    alignItems: "center"
  },
  heroButtonText: {
    color: "#0f766e",
    fontWeight: "900"
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  quickGrid: {
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
