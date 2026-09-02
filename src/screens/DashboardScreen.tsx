import React, { useMemo } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Empty } from "../components/common";
import { AlertRow } from "../components/metrics";
import { AppData, Sale, User } from "../types";
import { productMinStock } from "../utils/accounting";
import { AppTab, appLicenseStatus, licenseStatusLabel } from "../utils/appAccess";
import { buildDashboard } from "../utils/dashboard";
import { documentNumber } from "../utils/documents";
import { maxEmissionPointsForLicense } from "../utils/license";
import { money } from "../sri";
import { useAppTheme } from "../theme/AppTheme";
import type { CompanyAssetsStatus } from "../services/backendApi/types";
import { GettingStartedCard } from "../components/GettingStartedCard";
import type { OnboardingEvaluation, OnboardingExperience, OnboardingStepState } from "../onboarding/onboardingTypes";

type DashboardListItemProps = {
  title: string;
  meta: string;
  badge?: string;
  secondaryLabel?: string;
  onOpen?: () => void;
  onSecondary?: () => void;
};

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export function DashboardScreen({
  data,
  user: _user,
  certificateStatus,
  onboardingEvaluation,
  onboardingExperience,
  onOpenOnboardingStep,
  onMinimizeOnboarding,
  onExpandOnboarding,
  onSkipOnboardingStep,
  onAcknowledgeOnboarding,
  availableTabs,
  onNavigate
}: {
  data: AppData;
  user: User;
  certificateStatus?: CompanyAssetsStatus["certificate"];
  onboardingEvaluation: OnboardingEvaluation;
  onboardingExperience: OnboardingExperience;
  onOpenOnboardingStep: (step: OnboardingStepState) => void;
  onMinimizeOnboarding: () => void;
  onExpandOnboarding: () => void;
  onSkipOnboardingStep: (step: OnboardingStepState) => void;
  onAcknowledgeOnboarding: () => void;
  availableTabs: AppTab[];
  onNavigate: (tab: AppTab) => void;
  ListItemComponent: React.ComponentType<DashboardListItemProps>;
}) {
  const { theme } = useAppTheme();
  const dashboard = useMemo(() => buildDashboard(data), [data]);
  const allowedTabs = availableTabs;
  const primaryTab: AppTab = allowedTabs.includes("ventas") ? "ventas" : allowedTabs.includes("caja") ? "caja" : "reportes";
  const licenseState = appLicenseStatus(data.license);
  const maxPoints = maxEmissionPointsForLicense(data.license);
  const activePoints = data.issuer.establishments?.length || 1;
  const visibleRecentSales = dashboard.recentSales.slice(0, 3);
  const topLowStock = dashboard.lowStock[0];
  const certificateAlert = buildCertificateAlert(certificateStatus);
  const hasGeneralAlerts = dashboard.pendingCount > 0 || dashboard.rejectedCount > 0 || dashboard.lowStock.length > 0 || Boolean(certificateAlert);

  return (
    <View style={styles.stack}>
      <GettingStartedCard
        evaluation={onboardingEvaluation}
        experience={onboardingExperience}
        onOpenStep={onOpenOnboardingStep}
        onMinimize={onMinimizeOnboarding}
        onExpand={onExpandOnboarding}
        onSkipOptional={onSkipOnboardingStep}
        onAcknowledge={onAcknowledgeOnboarding}
      />
      <View style={styles.dashboardHero}>
        <View style={styles.heroMain}>
          <View style={styles.heroAmountRow}>
            <View style={styles.flex}>
              <Text style={styles.dashboardEyebrow}>Ventas hoy</Text>
              <Text style={styles.dashboardTitle}>$ {money(dashboard.todayTotal)}</Text>
              <Text style={styles.dashboardText}>{dashboard.todayCount} documento(s) emitido(s)</Text>
            </View>
            <Pressable style={styles.heroButton} onPress={() => onNavigate(primaryTab)}>
              <MaterialCommunityIcons name={primaryTab === "ventas" ? "plus" : primaryTab === "caja" ? "cash-register" : "chart-box-outline"} size={18} color="#0f766e" />
              <Text style={styles.heroButtonText}>{primaryTab === "ventas" ? "Nueva venta" : primaryTab === "caja" ? "Ir a caja" : "Reportes"}</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {topLowStock ? (
        <View style={styles.stockAlertCard}>
          <View style={styles.alertIconSoft}>
            <MaterialCommunityIcons name="package-variant-closed" size={16} color="#b45309" />
          </View>
          <View style={styles.flex}>
            <Text style={styles.stockAlertTitle} numberOfLines={1}>{topLowStock.name} - stock bajo</Text>
            <Text style={styles.stockAlertText}>Stock real: {topLowStock.stock} | minimo: {productMinStock(topLowStock)}</Text>
          </View>
          <View style={styles.alertCountPill}>
            <Text style={styles.alertCountText}>{dashboard.lowStock.length} alerta{dashboard.lowStock.length === 1 ? "" : "s"}</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.sectionBlock}>
        <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Accesos rapidos</Text>
        <View style={styles.quickGrid}>
          {allowedTabs.includes("caja") ? <DashboardQuickCard label="Caja" icon="cash-register" tone="warning" onPress={() => onNavigate("caja")} /> : null}
          {allowedTabs.includes("creditos") ? <DashboardQuickCard label="Creditos" icon="account-cash-outline" tone="info" onPress={() => onNavigate("creditos")} /> : null}
          {allowedTabs.includes("reportes") ? <DashboardQuickCard label="Informes" icon="chart-box-outline" tone="purple" onPress={() => onNavigate("reportes")} /> : null}
          {allowedTabs.includes("ventas") ? <DashboardQuickCard label="Vendedor" icon="cart-outline" tone="success" onPress={() => onNavigate("ventas")} /> : null}
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Ultimos documentos</Text>
        {visibleRecentSales.length === 0 ? <Empty text="Aun no hay facturas emitidas." /> : null}
        <View style={styles.recentList}>
          {visibleRecentSales.map((sale: Sale) => {
            const client = data.clients.find((item) => item.id === sale.clientId);
            return (
              <Pressable key={sale.id} style={[styles.recentRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]} onPress={() => onNavigate("documentos")}>
                <View style={styles.recentStatusWrap}>
                  <Text style={[styles.recentBadge, { backgroundColor: theme.colors.dangerSoft, color: theme.colors.danger }, sale.status === "AUTORIZADA" && { backgroundColor: theme.colors.successSoft, color: theme.colors.success }]} numberOfLines={1}>{sale.status}</Text>
                </View>
                <View style={styles.recentContent}>
                  <Text style={[styles.recentNumber, { color: theme.colors.textMuted }]} numberOfLines={1}>{documentNumber(sale, data.issuer)}</Text>
                  <Text style={[styles.recentClient, { color: theme.colors.text }]} numberOfLines={1}>{client?.name ?? "Cliente"}</Text>
                </View>
                <Text style={[styles.recentAmount, { color: theme.colors.success }]}>${money(sale.total)}</Text>
              </Pressable>
            );
          })}
        </View>
        {dashboard.recentSales.length > 3 ? (
          <Pressable style={styles.viewAllButton} onPress={() => onNavigate("documentos")}>
            <Text style={[styles.viewAllText, { color: theme.colors.primary }]}>Ver todos los documentos</Text>
            <MaterialCommunityIcons name="arrow-right" size={16} color={theme.colors.primary} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.sectionBlock}>
        <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Resumen del mes</Text>
        <View style={styles.compactGrid}>
          <CompactMetric label="Ventas mes" value={`$${money(dashboard.monthTotal)}`} icon="chart-line" tone="info" />
          <CompactMetric label="IVA mes" value={`$${money(dashboard.monthTax)}`} icon="file-percent-outline" />
          <CompactMetric label="Utilidad mes" value={`$${money(dashboard.monthProfit)}`} icon="trending-up" tone={dashboard.monthProfit >= 0 ? "success" : "warning"} />
          <CompactMetric label="Stock bajo" value={String(dashboard.lowStock.length)} icon="package-variant-closed" tone={dashboard.lowStock.length > 0 ? "warning" : "success"} />
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Estado de licencia</Text>
        <View style={styles.compactGrid}>
          <CompactMetric
            label={licenseStatusLabel(data.license)}
            value={licenseState.active ? `${Math.max(0, licenseState.daysLeft)} dias` : "Vencida"}
            icon="shield-check-outline"
            tone={licenseState.active ? "success" : "danger"}
          />
          <CompactMetric
            label="Puntos de emision"
            value={maxPoints >= 999 ? `${activePoints} activos` : `${activePoints}/${maxPoints}`}
            icon="store-outline"
            tone={activePoints <= maxPoints ? "success" : "danger"}
          />
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>Alertas generales</Text>
        {certificateAlert ? <AlertRow title={certificateAlert.title} detail={certificateAlert.detail} tone={certificateAlert.tone} icon="certificate-outline" /> : null}
        {dashboard.pendingCount > 0 ? <AlertRow title="Facturas por revisar" detail={`${dashboard.pendingCount} factura(s) no autorizada(s). Puede reintentarlas desde Documentos.`} tone="warning" icon="clock-alert-outline" /> : null}
        {dashboard.rejectedCount > 0 ? <AlertRow title="Facturas rechazadas" detail={`${dashboard.rejectedCount} factura(s) requieren correccion o reintento.`} tone="danger" icon="alert-octagon-outline" /> : null}
        {dashboard.lowStock.slice(0, 5).map((product) => <AlertRow key={product.id} title={product.name} detail={`Stock actual: ${product.stock} | minimo ${productMinStock(product)}`} tone={product.stock <= 0 ? "danger" : "warning"} icon="package-variant-closed" />)}
        {!hasGeneralAlerts ? <Empty text="Sin alertas importantes por ahora." /> : null}
      </View>
    </View>
  );
}

function buildCertificateAlert(certificate?: CompanyAssetsStatus["certificate"]): { title: string; detail: string; tone: "warning" | "danger" } | null {
  if (!certificate?.configured) return null;
  const date = certificate.expiresAt ? new Date(certificate.expiresAt).toLocaleDateString("es-EC") : "";
  if (certificate.expirationStatus === "expired") return { title: "Firma electronica vencida", detail: `No podra emitir comprobantes${date ? `; vencio el ${date}` : ""}. Suba una firma vigente en SRI.`, tone: "danger" };
  if (certificate.expirationStatus === "not_yet_valid") return { title: "Firma electronica aun no vigente", detail: "Revise la fecha de inicio del certificado antes de emitir.", tone: "danger" };
  if (certificate.expirationStatus === "critical") return { title: "Firma electronica por vencer", detail: `Quedan ${certificate.daysRemaining ?? 0} dia(s)${date ? `; vence el ${date}` : ""}. Renuevela cuanto antes.`, tone: "danger" };
  if (certificate.expirationStatus === "warning") return { title: "Renueve pronto su firma electronica", detail: `Quedan ${certificate.daysRemaining ?? 0} dias${date ? `; vence el ${date}` : ""}.`, tone: "warning" };
  return null;
}

function DashboardQuickCard({ label, icon, tone, onPress }: { label: string; icon: IconName; tone: "success" | "warning" | "info" | "purple"; onPress: () => void }) {
  const { theme } = useAppTheme();
  const color = tone === "warning" ? theme.colors.warning : tone === "info" ? theme.colors.info : tone === "purple" ? theme.colors.accent : theme.colors.success;
  const soft = tone === "warning" ? theme.colors.warningSoft : tone === "info" ? theme.colors.infoSoft : tone === "purple" ? theme.colors.accentSoft : theme.colors.successSoft;
  return (
    <Pressable style={[styles.quickCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, shadowColor: theme.colors.shadow }]} onPress={onPress}>
      <View style={[styles.quickIcon, { backgroundColor: soft }]}>
        <MaterialCommunityIcons name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.quickText, { color: theme.colors.text }]}>{label}</Text>
    </Pressable>
  );
}

function CompactMetric({ label, value, icon, tone = "default" }: { label: string; value: string; icon: IconName; tone?: "default" | "success" | "warning" | "danger" | "info" }) {
  const { theme } = useAppTheme();
  const color = tone === "success" ? theme.colors.success : tone === "warning" ? theme.colors.warning : tone === "danger" ? theme.colors.danger : tone === "info" ? theme.colors.info : theme.colors.primary;
  const soft = tone === "success" ? theme.colors.successSoft : tone === "warning" ? theme.colors.warningSoft : tone === "danger" ? theme.colors.dangerSoft : tone === "info" ? theme.colors.infoSoft : theme.colors.surface;
  return (
    <View style={[styles.metricCard, { borderColor: theme.colors.border, backgroundColor: soft }]}>
      <View style={styles.metricTop}>
        <Text style={[styles.metricValue, { color: theme.colors.text }]} numberOfLines={1}>{value}</Text>
        <View style={[styles.metricIcon, { backgroundColor: soft }]}>
          <MaterialCommunityIcons name={icon} size={16} color={color} />
        </View>
      </View>
      <Text style={[styles.metricLabel, { color: theme.colors.textMuted }]} numberOfLines={2}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 10
  },
  flex: {
    flex: 1,
    minWidth: 130
  },
  dashboardHero: {
    borderRadius: 8,
    padding: 16,
    backgroundColor: "#166534",
    alignItems: "stretch",
    gap: 10,
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3
  },
  heroMain: {
    gap: 8
  },
  dashboardEyebrow: {
    color: "#bbf7d0",
    fontSize: 14,
    fontWeight: "700"
  },
  dashboardTitle: {
    color: "#ffffff",
    fontSize: 30,
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
    paddingHorizontal: 13,
    paddingVertical: 11,
    backgroundColor: "#ffffff",
    alignSelf: "center",
    minWidth: 112,
    alignItems: "center",
    flexDirection: "row",
    gap: 4
  },
  heroButtonText: {
    color: "#0f766e",
    fontWeight: "900"
  },
  stockAlertCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fbbf24",
    backgroundColor: "#fffbeb",
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  alertIconSoft: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#fef3c7",
    alignItems: "center",
    justifyContent: "center"
  },
  stockAlertTitle: {
    color: "#92400e",
    fontSize: 13,
    fontWeight: "900"
  },
  stockAlertText: {
    color: "#b45309",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2
  },
  alertCountPill: {
    borderRadius: 8,
    backgroundColor: "#fef3c7",
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  alertCountText: {
    color: "#92400e",
    fontSize: 11,
    fontWeight: "900"
  },
  sectionBlock: {
    gap: 8
  },
  sectionLabel: {
    color: "#7c8794",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  quickCard: {
    flexGrow: 1,
    flexBasis: "45%",
    minHeight: 78,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1
  },
  quickIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#dcfce7"
  },
  quickIconWarning: {
    backgroundColor: "#fef3c7"
  },
  quickIconInfo: {
    backgroundColor: "#dbeafe"
  },
  quickIconPurple: {
    backgroundColor: "#f3e8ff"
  },
  quickText: {
    color: "#1f2937",
    fontSize: 15,
    fontWeight: "800"
  },
  recentList: {
    gap: 7
  },
  recentRow: {
    minHeight: 62,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  recentStatusWrap: {
    width: 92
  },
  recentBadge: {
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#fee2e2",
    color: "#991b1b",
    paddingHorizontal: 7,
    paddingVertical: 4,
    fontSize: 10,
    fontWeight: "900",
    textAlign: "center"
  },
  recentBadgeSuccess: {
    backgroundColor: "#dcfce7",
    color: "#166534"
  },
  recentContent: {
    flex: 1,
    minWidth: 0
  },
  recentNumber: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800"
  },
  recentClient: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 1
  },
  recentAmount: {
    color: "#166534",
    fontSize: 14,
    fontWeight: "900",
    minWidth: 68,
    textAlign: "right"
  },
  viewAllButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 5
  },
  viewAllText: {
    color: "#0f766e",
    fontWeight: "800"
  },
  compactGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: "45%",
    minHeight: 80,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    padding: 12
  },
  metricSuccess: {
    borderColor: "#bbf7d0",
    backgroundColor: "#f0fdf4"
  },
  metricWarning: {
    borderColor: "#fcd34d",
    backgroundColor: "#fffbeb"
  },
  metricDanger: {
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2"
  },
  metricInfo: {
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff"
  },
  metricTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  metricValue: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900",
    flex: 1
  },
  metricLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 5,
    lineHeight: 16
  },
  metricIcon: {
    width: 31,
    height: 31,
    borderRadius: 8,
    backgroundColor: "#dcfce7",
    alignItems: "center",
    justifyContent: "center"
  },
  metricIconWarning: {
    backgroundColor: "#fef3c7"
  },
  metricIconDanger: {
    backgroundColor: "#fee2e2"
  },
  metricIconInfo: {
    backgroundColor: "#dbeafe"
  }
});
