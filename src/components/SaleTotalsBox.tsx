import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { money } from "../sri";
import { useAppTheme } from "../theme/AppTheme";

type SaleTotalsBoxProps = {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  additionalInfoCount?: number;
  onOpenAdditionalInfo?: () => void;
  showSummary?: boolean;
};

export function SaleTotalsBox({ subtotal, discount, tax, total, additionalInfoCount = 0, onOpenAdditionalInfo, showSummary = true }: SaleTotalsBoxProps) {
  const { theme } = useAppTheme();
  return (
    <View style={[styles.totalBox, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
      {showSummary ? (
        <>
          <View style={styles.summaryRows}>
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: theme.colors.textMuted }]}>Subtotal</Text>
              <Text style={[styles.totalValue, { color: theme.colors.text }]}>${money(subtotal)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: theme.colors.textMuted }]}>Descuento</Text>
              <Text style={[styles.totalValue, { color: discount > 0 ? theme.colors.success : theme.colors.text }]}>${money(discount)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: theme.colors.textMuted }]}>IVA</Text>
              <Text style={[styles.totalValue, { color: theme.colors.text }]}>${money(tax)}</Text>
            </View>
          </View>
          <View style={[styles.strongRow, { borderTopColor: theme.colors.border }]}>
            <View>
              <Text style={[styles.strongLabel, { color: theme.colors.text }]}>Total</Text>
              <Text style={[styles.strongMeta, { color: theme.colors.textMuted }]}>Valor a emitir</Text>
            </View>
            <Text style={[styles.totalStrong, { color: theme.colors.success }]}>${money(total)}</Text>
          </View>
        </>
      ) : null}
      {onOpenAdditionalInfo ? (
        <Pressable style={[styles.additionalButton, { borderTopColor: theme.colors.border }, !showSummary && styles.additionalButtonOnly]} onPress={onOpenAdditionalInfo}>
          <View style={[styles.additionalIcon, { backgroundColor: theme.colors.primarySoft }]}>
            <MaterialCommunityIcons name="text-box-plus-outline" size={17} color={theme.colors.primary} />
          </View>
          <View style={styles.additionalTextBlock}>
            <Text style={[styles.additionalTitle, { color: theme.colors.text }]}>Informacion adicional</Text>
            <Text style={[styles.additionalMeta, { color: theme.colors.textMuted }]} numberOfLines={1}>
              {additionalInfoCount > 0 ? `${additionalInfoCount} campo(s) para el RIDE` : "Agregar campos opcionales para el RIDE"}
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  totalBox: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10
  },
  summaryRows: {
    gap: 7
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  totalLabel: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "800"
  },
  totalValue: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "900"
  },
  discountValue: {
    color: "#047857"
  },
  strongRow: {
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12
  },
  strongLabel: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "900"
  },
  strongMeta: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2
  },
  totalStrong: {
    color: "#047857",
    fontWeight: "900",
    fontSize: 24
  },
  additionalButton: {
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 10,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 9
  },
  additionalButtonOnly: {
    borderTopWidth: 0,
    paddingTop: 0
  },
  additionalIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center"
  },
  additionalTextBlock: {
    flex: 1
  },
  additionalTitle: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "900"
  },
  additionalMeta: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700"
  }
});
