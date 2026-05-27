import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { money } from "../services/sri";

type SaleTotalsBoxProps = {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
};

export function SaleTotalsBox({ subtotal, discount, tax, total }: SaleTotalsBoxProps) {
  return (
    <View style={styles.totalBox}>
      <View style={styles.summaryRows}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalValue}>${money(subtotal)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Descuento</Text>
          <Text style={[styles.totalValue, discount > 0 && styles.discountValue]}>${money(discount)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>IVA</Text>
          <Text style={styles.totalValue}>${money(tax)}</Text>
        </View>
      </View>
      <View style={styles.strongRow}>
        <View>
          <Text style={styles.strongLabel}>Total</Text>
          <Text style={styles.strongMeta}>Valor a emitir</Text>
        </View>
        <Text style={styles.totalStrong}>${money(total)}</Text>
      </View>
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
  }
});
