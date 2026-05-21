import React from "react";
import { Platform, Pressable, SafeAreaView, ScrollView, StatusBar as NativeStatusBar, StyleSheet, Text, View } from "react-native";

type TechnicalDetailModalProps = {
  value: string;
  onClose: () => void;
};

export function TechnicalDetailModal({ value, onClose }: TechnicalDetailModalProps) {
  const headerTopPadding = Platform.OS === "android" ? (NativeStatusBar.currentHeight || 0) + 6 : 12;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={[styles.header, styles.xmlModalHeader, { paddingTop: headerTopPadding }]}>
        <Text style={styles.title}>Detalle tecnico</Text>
        <Pressable style={styles.smallButton} onPress={onClose}>
          <Text style={styles.smallButtonText}>Cerrar</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text selectable style={styles.xml}>
          {value}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f5f7fb"
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderColor: "#e2e7f0"
  },
  xmlModalHeader: {
    minHeight: 58,
    paddingBottom: 10
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1f2937"
  },
  smallButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  smallButtonText: {
    color: "#0f5f59",
    fontWeight: "900"
  },
  content: {
    padding: 12,
    paddingBottom: 170
  },
  xml: {
    fontFamily: "monospace",
    fontSize: 11,
    lineHeight: 16,
    color: "#111827",
    backgroundColor: "#ffffff",
    padding: 12
  }
});
