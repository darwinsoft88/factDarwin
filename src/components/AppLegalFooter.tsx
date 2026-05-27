import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { APP_VERSION_LABEL, COPYRIGHT_TEXT } from "../constants/branding";

type AppLegalFooterProps = {
  compact?: boolean;
};

export function AppLegalFooter({ compact = false }: AppLegalFooterProps) {
  return (
    <View style={[styles.footer, compact && styles.footerCompact]}>
      <Text style={styles.version}>FactuDarwin {APP_VERSION_LABEL}</Text>
      <Text style={styles.copyright}>{COPYRIGHT_TEXT}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    alignItems: "center",
    gap: 3,
    paddingVertical: 10
  },
  footerCompact: {
    paddingVertical: 6
  },
  version: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "900"
  },
  copyright: {
    color: "#94a3b8",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center"
  }
});
