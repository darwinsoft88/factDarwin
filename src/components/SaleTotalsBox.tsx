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
      <Text style={styles.totalLine}>Subtotal: ${money(subtotal)}</Text>
      <Text style={styles.totalLine}>Descuento: ${money(discount)}</Text>
      <Text style={styles.totalLine}>IVA: ${money(tax)}</Text>
      <Text style={styles.totalStrong}>Total: ${money(total)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  totalBox: {
    borderTopWidth: 1,
    borderColor: "#e5e7eb",
    paddingTop: 10,
    gap: 4
  },
  totalLine: {
    color: "#374151",
    textAlign: "right"
  },
  totalStrong: {
    color: "#111827",
    fontWeight: "900",
    textAlign: "right",
    fontSize: 18
  }
});
