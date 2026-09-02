import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CompanyAssetsStatus } from "../services/backend";
import { useAppTheme } from "../theme/AppTheme";
import type { Issuer } from "../types";
import { realBillingSummary } from "../utils/sriEnvironmentPresentation";
import type { ProductionChecklistValue } from "./ProductionChecklist";

type Props = {
  issuer: Issuer;
  checklist: ProductionChecklistValue;
  certificate?: CompanyAssetsStatus["certificate"];
  changing: boolean;
  checking: boolean;
  serverInTestMode: boolean;
  onActivate: () => void;
  onCheckConnection: () => void;
  onOpenCertificate: () => void;
  onOpenIssuer: () => void;
};

export function SriEnvironmentExperienceCard({ issuer, checklist, certificate, changing, checking, serverInTestMode, onActivate, onCheckConnection, onOpenCertificate, onOpenIssuer }: Props) {
  const { theme } = useAppTheme();
  const production = issuer.environment === "2";
  const summary = realBillingSummary(checklist, certificate);
  const nextAction = !summary.company.ok
    ? { label: "Completar datos de empresa", onPress: onOpenIssuer }
    : !summary.certificate.ok
      ? { label: certificate?.expirationStatus === "expired" ? "Revisar firma electrónica" : "Ir a firma electrónica", onPress: onOpenCertificate }
      : !summary.connection.ok
        ? { label: checking ? "Verificando servidor..." : "Paso 1 · Verificar servidor SRI", onPress: onCheckConnection }
        : { label: changing ? "Activando..." : "Activar facturación real", onPress: onActivate };

  return (
    <View style={[styles.card, { backgroundColor: production ? theme.colors.successSoft : theme.colors.infoSoft, borderColor: production ? theme.colors.success : theme.colors.info }]}> 
      <View style={styles.heading}>
        <MaterialCommunityIcons name={production ? "check-decagram" : "flask-outline"} size={24} color={production ? theme.colors.success : theme.colors.info} />
        <View style={styles.flex}>
          <Text style={[styles.title, { color: theme.colors.text }]}>Facturación electrónica</Text>
          <Text style={[styles.mode, { color: production ? theme.colors.success : theme.colors.info }]}>{production ? "Facturación real activa" : "Modo de prueba"}</Text>
        </View>
      </View>
      <Text style={[styles.description, { color: theme.colors.textMuted }]}>{production ? "Tus comprobantes electrónicos pueden enviarse oficialmente al SRI." : "Puedes usar FactuDarwin sin emitir comprobantes reales al SRI."}</Text>
      <View style={styles.statusList}>
        <SummaryRow ok={summary.company.ok} label={summary.company.label} />
        <SummaryRow ok={summary.certificate.ok} label={summary.certificate.label} detail={summary.certificate.warning} />
        <SummaryRow ok={summary.connection.ok} info={serverInTestMode} label={serverInTestMode ? "Servidor local de pruebas" : summary.connection.label} detail={serverInTestMode ? "En este equipo no se puede activar facturación real. Al usar el servidor productivo aparecerá la opción para activarla." : !summary.connection.ok && summary.company.ok && summary.certificate.ok ? "Último paso: después podrás activar la facturación real." : undefined} />
      </View>
      {production ? <Text style={[styles.point, { color: theme.colors.text }]}>Establecimiento {issuer.establishment} · Punto de emisión {issuer.emissionPoint}</Text> : null}
      {!production && !serverInTestMode ? <Pressable disabled={checking || changing} onPress={nextAction.onPress} style={[styles.primary, { backgroundColor: theme.colors.primary }, (checking || changing) && styles.disabled]}><Text style={[styles.primaryText, { color: theme.colors.onPrimary }]}>{nextAction.label}</Text></Pressable> : null}
      {!production && !serverInTestMode && summary.company.ok && summary.certificate.ok && !summary.connection.ok ? (
        <View style={[styles.lockedAction, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted }]}>
          <MaterialCommunityIcons name="lock-outline" size={16} color={theme.colors.textMuted} />
          <Text style={[styles.lockedActionText, { color: theme.colors.textMuted }]}>Paso 2 · Activar facturación real</Text>
        </View>
      ) : null}
    </View>
  );
}

function SummaryRow({ ok, info = false, label, detail }: { ok: boolean; info?: boolean; label: string; detail?: string }) {
  const { theme } = useAppTheme();
  return <View style={styles.statusRow}><MaterialCommunityIcons name={ok ? "check-circle" : info ? "information-outline" : "close-circle-outline"} size={18} color={ok ? theme.colors.success : info ? theme.colors.info : theme.colors.warning} accessibilityLabel={ok ? "Listo" : info ? "Información" : "Pendiente"} /><View style={styles.flex}><Text style={[styles.statusText, { color: theme.colors.text }]}>{label}</Text>{detail ? <Text style={[styles.detail, { color: info ? theme.colors.info : theme.colors.warning }]}>{detail}</Text> : null}</View></View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, gap: 10, padding: 14 },
  heading: { alignItems: "center", flexDirection: "row", gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: "900" },
  mode: { fontSize: 13, fontWeight: "900", marginTop: 2 },
  description: { fontSize: 13, lineHeight: 19 },
  statusList: { gap: 6 },
  statusRow: { alignItems: "center", flexDirection: "row", gap: 8, minHeight: 23 },
  statusText: { fontSize: 12, fontWeight: "800" },
  detail: { fontSize: 11, fontWeight: "700", marginTop: 1 },
  point: { fontSize: 12, fontWeight: "800" },
  primary: { alignItems: "center", borderRadius: 11, justifyContent: "center", minHeight: 44, paddingHorizontal: 12 },
  primaryText: { fontSize: 13, fontWeight: "900", textAlign: "center" },
  lockedAction: { alignItems: "center", borderRadius: 11, borderWidth: 1, flexDirection: "row", gap: 7, justifyContent: "center", minHeight: 40, paddingHorizontal: 12 },
  lockedActionText: { fontSize: 12, fontWeight: "800", textAlign: "center" },
  disabled: { opacity: 0.5 }
});
