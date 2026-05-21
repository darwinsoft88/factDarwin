import React, { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { resolveCompanyLogoUrl } from "../utils/assets";

export function CompanyLogoMark({ logoUrl, backendUrl }: { logoUrl: string; backendUrl: string }) {
  const resolvedLogoUrl = resolveCompanyLogoUrl(logoUrl, backendUrl);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [resolvedLogoUrl]);

  return (
    <View style={[styles.brandMark, resolvedLogoUrl && !failed && styles.brandLogoMark]}>
      {resolvedLogoUrl && !failed ? (
        <Image source={{ uri: resolvedLogoUrl }} style={styles.brandLogoImage} resizeMode="contain" onError={() => setFailed(true)} />
      ) : (
        <Text style={styles.brandMarkText}>FD</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  brandMark: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f766e",
    overflow: "hidden"
  },
  brandLogoMark: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff"
  },
  brandLogoImage: {
    width: "100%",
    height: "100%"
  },
  brandMarkText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900"
  }
});
