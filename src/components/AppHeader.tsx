import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { APP_BRAND } from "../constants/app";
import { AppLicense } from "../types";
import { compactLicenseStatusLabel } from "../utils/appAccess";
import { shortText } from "../utils/format";
import { CompanyLogoMark } from "./CompanyLogoMark";
import { MenuIcon } from "./icons";

type AppHeaderProps = {
  backendUrl: string;
  companyLabel: string;
  establishmentLabel: string;
  headerTopPadding: number;
  license?: AppLicense;
  licenseActive: boolean;
  logoUrl: string;
  syncError: boolean;
  syncNotice: string;
  onOpenMenu: () => void;
};

export function AppHeader({
  backendUrl,
  companyLabel,
  establishmentLabel,
  headerTopPadding,
  license,
  licenseActive,
  logoUrl,
  syncError,
  syncNotice,
  onOpenMenu
}: AppHeaderProps) {
  return (
    <View style={[styles.header, { paddingTop: headerTopPadding }]}>
      <View style={styles.brandRow}>
        <CompanyLogoMark logoUrl={logoUrl} backendUrl={backendUrl} />
        <View style={styles.flex}>
          <View style={styles.headerMetaRow}>
            <Text style={styles.headerBrand} numberOfLines={1}>{APP_BRAND}</Text>
            <Text style={[styles.licensePill, !licenseActive && styles.licensePillError]} numberOfLines={1}>{compactLicenseStatusLabel(license)}</Text>
          </View>
          <Text style={styles.headerCompany} numberOfLines={1}>{shortText(companyLabel || "Empresa", 34)}</Text>
          <Text style={styles.scopeStatus} numberOfLines={1}>{establishmentLabel}</Text>
          {syncNotice ? <Text style={[styles.syncStatus, syncError && styles.syncStatusError]} numberOfLines={1}>{syncNotice}</Text> : null}
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Abrir menu" style={styles.headerMenuButton} onPress={onOpenMenu}>
        <MenuIcon />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 14,
    paddingBottom: 8,
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
    gap: 10,
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
    marginTop: 1,
    color: "#334155",
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 14
  },
  syncStatus: {
    marginTop: 2,
    color: "#c2410c",
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 13
  },
  scopeStatus: {
    marginTop: 1,
    color: "#0f766e",
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 13
  },
  syncStatusError: {
    color: "#b91c1c"
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
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    marginLeft: 8
  }
});
