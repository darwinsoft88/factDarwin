import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "../theme/AppTheme";

type TechnicalDetailModalProps = {
  value: string;
  onClose: () => void;
};

export function TechnicalDetailModal({ value, onClose }: TechnicalDetailModalProps) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom, backgroundColor: theme.colors.background }]}>
      <View style={[styles.header, styles.xmlModalHeader, { paddingTop: Math.max(insets.top, 6), backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Detalle tecnico</Text>
        <Pressable style={[styles.smallButton, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft }]} onPress={onClose}>
          <Text style={[styles.smallButtonText, { color: theme.colors.primaryStrong }]}>Cerrar</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text selectable style={[styles.xml, { color: theme.colors.text, backgroundColor: theme.colors.surface }]}>
          {value}
        </Text>
      </ScrollView>
    </View>
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
