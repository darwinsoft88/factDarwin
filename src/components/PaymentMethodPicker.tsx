import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { paymentOptions } from "../constants/options";
import { PaymentMethod } from "../types";

type PaymentMethodPickerProps = {
  value: PaymentMethod;
  onChange: (value: PaymentMethod) => void;
};

const paymentShortLabels: Record<string, { title: string; detail: string }> = {
  "01": { title: "Sin sistema financiero", detail: "01" },
  "20": { title: "Otros sistema financiero", detail: "20" },
  "16": { title: "Tarjeta debito", detail: "16" },
  "19": { title: "Tarjeta credito", detail: "19" },
  "15": { title: "Compensacion de deudas", detail: "15" },
  "17": { title: "Dinero electronico", detail: "17" },
  "18": { title: "Tarjeta prepago", detail: "18" },
  "21": { title: "Endoso de titulos", detail: "21" }
};

export function PaymentMethodPicker({ value, onChange }: PaymentMethodPickerProps) {
  return (
    <View style={styles.paymentBox}>
      <Text style={styles.sectionTitle}>Forma de pago</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.paymentList}>
        {paymentOptions.map((option) => {
          const selected = option.value === value;
          const meta = paymentShortLabels[option.value] || { title: option.label, detail: option.value };
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[styles.paymentCard, selected && styles.paymentCardSelected]}
              onPress={() => onChange(option.value as PaymentMethod)}
            >
              <View style={[styles.paymentCode, selected && styles.paymentCodeSelected]}>
                <Text style={[styles.paymentCodeText, selected && styles.paymentCodeTextSelected]}>{meta.detail}</Text>
              </View>
              <View style={styles.paymentTextBox}>
                <Text style={[styles.paymentTitle, selected && styles.paymentTitleSelected]} numberOfLines={1}>{meta.title}</Text>
              </View>
              {selected ? (
                <View style={styles.checkDot}>
                  <Text style={styles.checkText}>✓</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  paymentBox: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    paddingHorizontal: 9,
    paddingVertical: 9,
    gap: 8
  },
  sectionTitle: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "900"
  },
  paymentList: {
    gap: 8,
    paddingRight: 2
  },
  paymentCard: {
    minWidth: 172,
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#dbe4ee",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  paymentCardSelected: {
    borderColor: "#0f766e",
    backgroundColor: "#ecfdf5"
  },
  paymentCode: {
    minWidth: 31,
    height: 26,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7
  },
  paymentCodeSelected: {
    backgroundColor: "#0f766e"
  },
  paymentCodeText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "900"
  },
  paymentCodeTextSelected: {
    color: "#ffffff"
  },
  paymentTextBox: {
    flex: 1,
    minWidth: 0
  },
  paymentTitle: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "900"
  },
  paymentTitleSelected: {
    color: "#065f46"
  },
  checkDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center"
  },
  checkText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  }
});
