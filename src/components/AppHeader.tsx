import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { APP_BRAND } from "../constants/app";
import { AppLicense } from "../types";
import { compactLicenseStatusLabel } from "../utils/appAccess";
import { shortText } from "../utils/format";
import { CompanyLogoMark } from "./CompanyLogoMark";
import { MenuIcon } from "./icons";
import { useAppTheme } from "../theme/AppTheme";
import { SyncState } from "../utils/support";
import { resolveHeaderSyncStatus } from "../utils/headerSyncStatus";

type AppHeaderProps = {
  backendUrl: string;
  companyLabel: string;
  establishmentLabel: string;
  headerTopPadding: number;
  license?: AppLicense;
  licenseActive: boolean;
  logoUrl: string;
  networkReachable: boolean | null;
  onOpenMenu: () => void;
  onOpenSyncCenter: () => void;
  pendingCount: number;
  sriPendingCount: number;
  syncState: SyncState;
  hasSyncError: boolean;
};

export function AppHeader({
  backendUrl,
  companyLabel,
  establishmentLabel,
  headerTopPadding,
  license,
  licenseActive,
  logoUrl,
  networkReachable,
  onOpenMenu,
  onOpenSyncCenter,
  pendingCount,
  sriPendingCount,
  syncState,
  hasSyncError
}: AppHeaderProps) {
  const { theme } = useAppTheme();
  const status = resolveHeaderSyncStatus({ hasSyncError, networkReachable, pendingCount, sriPendingCount, syncState });
  const presentation = status === "error"
    ? { label: "Error de sincronización", icon: "cloud-alert-outline" as const, color: theme.colors.danger, background: theme.colors.dangerSoft }
    : status === "offline"
      ? { label: "Sin conexión", icon: "cloud-off-outline" as const, color: theme.colors.textMuted, background: theme.colors.surfaceMuted }
      : status === "syncing"
        ? { label: "Sincronizando", icon: "sync" as const, color: theme.colors.info, background: theme.colors.infoSoft }
        : status === "pending"
          ? { label: "Sincronización pendiente", icon: "cloud-upload-outline" as const, color: theme.colors.warning, background: theme.colors.warningSoft }
          : { label: "Sincronización al día", icon: "cloud-check-outline" as const, color: theme.colors.success, background: theme.colors.successSoft };
  const accessibleLabel = pendingCount > 0 ? `${presentation.label}, ${pendingCount} operaciones pendientes` : presentation.label;
  return (
    <View style={[styles.header, { paddingTop: headerTopPadding, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <View style={styles.brandRow}>
        <CompanyLogoMark logoUrl={logoUrl} backendUrl={backendUrl} />
        <View style={styles.flex}>
        <View style={styles.headerMetaRow}>
          <Text style={[styles.headerBrand, { color: theme.colors.text }]} numberOfLines={1}>{APP_BRAND}</Text>
          <Text style={[styles.licensePill, !licenseActive && styles.licensePillError]} numberOfLines={1}>{compactLicenseStatusLabel(license)}</Text>
        </View>
        <View style={styles.companyScopeRow}>
          <Text style={[styles.headerCompany, { color: theme.colors.textMuted }]} numberOfLines={1}>{shortText(companyLabel || "Empresa", 22)}</Text>
          <Text style={styles.scopeSeparator}>·</Text>
          <Text style={styles.scopeStatus} numberOfLines={1}>{shortText(establishmentLabel, 26)}</Text>
        </View>
      </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibleLabel}
        accessibilityHint="Abre el centro de sincronización"
        hitSlop={6}
        style={[styles.syncButton, { backgroundColor: presentation.background }]}
        onPress={onOpenSyncCenter}
      >
        {status === "syncing" ? (
          <ActivityIndicator size="small" color={presentation.color} />
        ) : (
          <MaterialCommunityIcons name={presentation.icon} size={21} color={presentation.color} />
        )}
        {pendingCount > 0 ? (
          <View style={[styles.syncBadge, { backgroundColor: theme.colors.warning }]}>
            <Text style={styles.syncBadgeText}>{pendingCount > 99 ? "99+" : pendingCount}</Text>
          </View>
        ) : null}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Abrir menu" hitSlop={4} style={[styles.headerMenuButton, { backgroundColor: theme.colors.surfaceMuted }]} onPress={onOpenMenu}>
        <MenuIcon />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 12,
    paddingBottom: 5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderColor: "#e2e7f0"
  },
  brandRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0
  },
  flex: {
    flex: 1,
    minWidth: 0
  },
  headerBrand: {
    flexShrink: 1,
    fontSize: 18,
    lineHeight: 21,
    fontWeight: "900",
    color: "#1a2a3a"
  },
  headerMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  headerCompany: {
    flexShrink: 1,
    color: "#334155",
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 14
  },
  companyScopeRow: {
    marginTop: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 0
  },
  scopeSeparator: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 13
  },
  scopeStatus: {
    flexShrink: 2,
    color: "#0f766e",
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 13
  },
  licensePill: {
    flexShrink: 0,
    maxWidth: 116,
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 2,
    color: "#047857",
    backgroundColor: "#dcfce7",
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 13
  },
  licensePillError: {
    color: "#b91c1c",
    backgroundColor: "#fee2e2"
  },
  headerMenuButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    marginLeft: 5
  },
  syncButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 5
  },
  syncBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  syncBadgeText: {
    color: "#ffffff",
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "900"
  }
});
