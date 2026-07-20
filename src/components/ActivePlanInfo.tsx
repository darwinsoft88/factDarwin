import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { SUPPORT_WHATSAPP_NUMBER } from "../constants/branding";
import { licensePlanOptions } from "../constants/options";
import { AppLicense, Issuer } from "../types";
import { appLicenseStatus, licenseStatusLabel } from "../utils/appAccess";
import { maxEmissionPointsForLicense, normalizeLicensePlanValue } from "../utils/license";

type ActivePlanInfoProps = {
  license: AppLicense;
  issuer?: Issuer;
};

const launchPlans = [
  {
    id: "basico",
    name: "Basico",
    tagline: "Para empezar a facturar",
    monthly: "$4",
    annual: "$20",
    badge: "Inicio",
    features: [
      ["1 usuario", true],
      ["1 punto de emision", true],
      ["Facturas, notas de venta y proformas", true],
      ["Clientes, productos y RIDE con logo", true],
      ["Guias, retenciones y multi punto", false]
    ] as const
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Recomendado",
    monthly: "$9",
    annual: "$90",
    badge: "Popular",
    featured: true,
    features: [
      ["Usuarios y dispositivos multiples", true],
      ["Hasta 3 puntos de emision", true],
      ["Guias de remision y notas de credito", true],
      ["Inventario, reportes y backups", true],
      ["Soporte prioritario premium", false]
    ] as const
  },
  {
    id: "premium",
    name: "Premium",
    tagline: "Para mas movimiento",
    monthly: "$15",
    annual: "$150",
    badge: "Completo",
    features: [
      ["Todo lo del plan Pro", true],
      ["Puntos de emision limite alto", true],
      ["Retenciones y soporte prioritario", true],
      ["Restauracion asistida de backup", true],
      ["Funciones comerciales futuras", true]
    ] as const
  }
];

function currentPlanLabel(license: AppLicense) {
  if (normalizeLicensePlanValue(license.plan) === "trial") return "Prueba gratis tipo Pro";
  return licensePlanOptions.find((option) => option.value === normalizeLicensePlanValue(license.plan))?.label || "Demo";
}

function currentStatusBadge(license: AppLicense) {
  const status = appLicenseStatus(license);
  if (status.effectiveStatus === "suspended") return { label: "Suspendido", tone: "danger" as const };
  if (status.effectiveStatus === "expired") return { label: "Vencido", tone: "danger" as const };
  if (status.daysLeft <= 7) return { label: "Por vencer", tone: "warning" as const };
  return { label: "Activo", tone: "success" as const };
}

function currentPlanDescription(license: AppLicense) {
  const status = appLicenseStatus(license);
  if (status.effectiveStatus === "suspended") return "El acceso comercial esta suspendido. Contacte soporte para reactivar la cuenta.";
  if (status.effectiveStatus === "expired") return "La licencia vencio. Renueve para mantener facturacion, sincronizacion y soporte.";
  if (normalizeLicensePlanValue(license.plan) === "trial") return "Acceso tipo Pro por 3 meses para probar FactuDarwin antes de elegir un plan.";
  if (status.daysLeft <= 7) return "Renueve antes del vencimiento para evitar cortes de servicio.";
  return "Plan activo y listo para trabajar.";
}

export function ActivePlanInfo({ license, issuer }: ActivePlanInfoProps) {
  const status = appLicenseStatus(license);
  const badge = currentStatusBadge(license);
  const issuerName = issuer?.tradeName || issuer?.businessName || "Empresa sin nombre";
  const issuerRuc = issuer?.ruc || "Sin RUC";

  const requestPlan = async (planName: string) => {
    const phone = SUPPORT_WHATSAPP_NUMBER.replace(/\D/g, "");
    if (!phone) {
      Alert.alert("Soporte no configurado", "Configure el numero de WhatsApp comercial para solicitar planes.");
      return;
    }
    const message = [
      "Hola DarwinSoft, quiero activar o renovar FactuDarwin.",
      `Empresa: ${issuerName}`,
      `RUC: ${issuerRuc}`,
      `Plan solicitado: ${planName}`,
      `Plan actual: ${licenseStatusLabel(license)}`,
      `Vence: ${license.expiresAt || "sin fecha"}`
    ].join("\n");
    try {
      await Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
    } catch {
      Alert.alert("No se pudo abrir WhatsApp", "Revise que WhatsApp este instalado.");
    }
  };

  return (
    <View style={styles.stack}>
      <View style={[styles.currentPlanCard, badge.tone === "warning" && styles.currentPlanSoon, badge.tone === "danger" && styles.currentPlanWarning]}>
        <View style={styles.currentPlanHeader}>
          <View style={styles.currentPlanCopy}>
            <Text style={styles.kicker}>Plan actual</Text>
            <Text style={styles.currentPlanTitle} numberOfLines={2}>{currentPlanLabel(license)}</Text>
            <Text style={styles.currentPlanExpires} numberOfLines={1}>Vence {license.expiresAt || "sin fecha"} | {Math.max(0, status.daysLeft)} dias</Text>
          </View>
          <View style={[styles.statusPill, badge.tone === "warning" && styles.statusPillWarning, badge.tone === "danger" && styles.statusPillError]}>
            <Text style={[styles.statusPillText, badge.tone === "warning" && styles.statusPillTextWarning, badge.tone === "danger" && styles.statusPillTextError]}>{badge.label}</Text>
          </View>
        </View>
        <Text style={styles.currentPlanMeta}>Usuarios {license.maxUsers || 1} | Dispositivos {license.maxDevices || 1} | Puntos {maxEmissionPointsForLicense(license)}</Text>
        <Text style={styles.currentPlanDescription}>{currentPlanDescription(license)}</Text>
        <Pressable style={styles.primaryRequestButton} onPress={() => { void requestPlan(currentPlanLabel(license)); }}>
          <MaterialCommunityIcons name="whatsapp" size={18} color="#ffffff" />
          <Text style={styles.primaryRequestButtonText}>Activar o renovar plan</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionLead}>Planes de lanzamiento</Text>
      <View style={styles.planGrid}>
        {launchPlans.map((plan) => (
          <View key={plan.id} style={[styles.planCard, plan.featured && styles.planCardFeatured]}>
            <View style={styles.planHeader}>
              <View>
                <Text style={styles.planName}>{plan.name}</Text>
                <Text style={styles.planTagline}>{plan.tagline}</Text>
              </View>
              <View style={[styles.planBadge, plan.featured && styles.planBadgeFeatured]}>
                <Text style={[styles.planBadgeText, plan.featured && styles.planBadgeTextFeatured]}>{plan.badge}</Text>
              </View>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.price}>{plan.monthly}</Text>
              <Text style={styles.priceMeta}>/ mes + IVA</Text>
            </View>
            <Text style={styles.annualPrice}>{plan.annual} / ano + IVA</Text>
            <View style={styles.features}>
              {plan.features.map(([label, included]) => (
                <View key={label} style={styles.featureRow}>
                  <MaterialCommunityIcons name={included ? "check-circle" : "close-circle"} size={17} color={included ? "#16a34a" : "#ef4444"} />
                  <Text style={[styles.featureText, !included && styles.featureMuted]}>{label}</Text>
                </View>
              ))}
            </View>
            <Pressable style={[styles.requestButton, plan.featured && styles.requestButtonFeatured]} onPress={() => { void requestPlan(plan.name); }}>
              <MaterialCommunityIcons name="whatsapp" size={18} color={plan.featured ? "#ffffff" : "#0f766e"} />
              <Text style={[styles.requestButtonText, plan.featured && styles.requestButtonTextFeatured]}>Solicitar</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12
  },
  currentPlanCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    backgroundColor: "#f0fdf4",
    padding: 12,
    gap: 8
  },
  currentPlanWarning: {
    borderColor: "#fecaca",
    backgroundColor: "#fff1f2"
  },
  currentPlanSoon: {
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb"
  },
  currentPlanHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  currentPlanCopy: {
    flex: 1,
    minWidth: 0
  },
  kicker: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  currentPlanTitle: {
    marginTop: 2,
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "900"
  },
  currentPlanExpires: {
    marginTop: 3,
    color: "#475569",
    fontSize: 12,
    fontWeight: "800"
  },
  currentPlanMeta: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700"
  },
  currentPlanDescription: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
  },
  statusPill: {
    flexShrink: 0,
    borderRadius: 999,
    backgroundColor: "#dcfce7",
    paddingHorizontal: 8,
    paddingVertical: 5,
    maxWidth: 94
  },
  statusPillWarning: {
    backgroundColor: "#fef3c7"
  },
  statusPillError: {
    backgroundColor: "#fee2e2"
  },
  statusPillText: {
    color: "#047857",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center"
  },
  statusPillTextWarning: {
    color: "#92400e"
  },
  statusPillTextError: {
    color: "#b91c1c"
  },
  primaryRequestButton: {
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7
  },
  primaryRequestButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  sectionLead: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900"
  },
  planGrid: {
    gap: 10
  },
  planCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dbe4f0",
    backgroundColor: "#ffffff",
    padding: 12,
    gap: 10
  },
  planCardFeatured: {
    borderColor: "#0f766e",
    backgroundColor: "#f0fdfa"
  },
  planHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  planName: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "900"
  },
  planTagline: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800"
  },
  planBadge: {
    borderRadius: 999,
    backgroundColor: "#eef2ff",
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  planBadgeFeatured: {
    backgroundColor: "#0f766e"
  },
  planBadgeText: {
    color: "#334155",
    fontSize: 10,
    fontWeight: "900"
  },
  planBadgeTextFeatured: {
    color: "#ffffff"
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 5
  },
  price: {
    color: "#0f766e",
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "900"
  },
  priceMeta: {
    marginBottom: 4,
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800"
  },
  annualPrice: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "900"
  },
  features: {
    gap: 7
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  featureText: {
    flex: 1,
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16
  },
  featureMuted: {
    color: "#94a3b8"
  },
  requestButton: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7
  },
  requestButtonFeatured: {
    backgroundColor: "#0f766e"
  },
  requestButtonText: {
    color: "#0f766e",
    fontSize: 13,
    fontWeight: "900"
  },
  requestButtonTextFeatured: {
    color: "#ffffff"
  }
});
