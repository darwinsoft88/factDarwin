import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { paymentOptions } from "../constants/options";
import { PaymentCondition, PaymentMethod } from "../types";
import { CalendarDateInput } from "./CalendarDateInput";

type MaterialIconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

type PaymentMethodPickerProps = {
  value: PaymentMethod;
  onChange: (value: PaymentMethod) => void;
  paymentCondition?: PaymentCondition;
  creditDueDate?: string;
  onPaymentConditionChange?: (value: PaymentCondition) => void;
  onCreditDueDateChange?: (value: string) => void;
};

const paymentShortLabels: Record<string, { title: string; detail: string; icon: MaterialIconName }> = {
  "01": { title: "Sin sistema financiero", detail: "01", icon: "cash" },
  "20": { title: "Transferencia / otros", detail: "20", icon: "bank-outline" },
  "16": { title: "Debito", detail: "16", icon: "credit-card-outline" },
  "19": { title: "Credito tarjeta", detail: "19", icon: "credit-card-check-outline" },
  "15": { title: "Compensacion", detail: "15", icon: "swap-horizontal" },
  "17": { title: "Dinero electronico", detail: "17", icon: "cellphone" },
  "18": { title: "Prepago", detail: "18", icon: "card-bulleted-outline" },
  "21": { title: "Endoso", detail: "21", icon: "file-sign" }
};

export function PaymentMethodPicker({
  value,
  onChange,
  paymentCondition = "contado",
  creditDueDate = "",
  onPaymentConditionChange,
  onCreditDueDateChange
}: PaymentMethodPickerProps) {
  const creditSelected = paymentCondition === "credito";

  return (
    <View style={styles.paymentBox}>
      <Text style={styles.sectionTitle}>Forma de pago</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.paymentList}>
        {paymentOptions.flatMap((option, index) => {
          const selected = !creditSelected && option.value === value;
          const meta = paymentShortLabels[option.value] || { title: option.label, detail: option.value, icon: "cash-multiple" as MaterialIconName };
          const paymentCard = (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[styles.paymentCard, selected && styles.paymentCardSelected]}
              onPress={() => {
                onPaymentConditionChange?.("contado");
                onChange(option.value as PaymentMethod);
              }}
            >
              <View style={[styles.paymentIconBox, selected && styles.paymentIconBoxSelected]}>
                <MaterialCommunityIcons name={meta.icon} size={16} color={selected ? "#ffffff" : "#0f766e"} />
              </View>
              <View style={styles.paymentTextBox}>
                <Text style={[styles.paymentTitle, selected && styles.paymentTitleSelected]} numberOfLines={1}>{meta.title}</Text>
                <Text style={[styles.paymentCodeText, selected && styles.paymentCodeTextSelected]}>{meta.detail}</Text>
              </View>
              {selected ? (
                <View style={styles.checkDot}>
                  <MaterialCommunityIcons name="check" size={13} color="#ffffff" />
                </View>
              ) : null}
            </Pressable>
          );
          return index === 1 ? [paymentCard, renderCreditCard(creditSelected, onPaymentConditionChange, onChange)] : [paymentCard];
        })}
      </ScrollView>
      {creditSelected ? (
        <View style={styles.creditBox}>
          <CalendarDateInput label="Vence el" value={creditDueDate} onChange={onCreditDueDateChange || (() => undefined)} allowClear />
          <Text style={styles.creditNote}>Cuenta por cobrar | SRI codigo 20.</Text>
        </View>
      ) : null}
    </View>
  );
}

function renderCreditCard(
  creditSelected: boolean,
  onPaymentConditionChange: ((value: PaymentCondition) => void) | undefined,
  onChange: (value: PaymentMethod) => void
) {
  return (
    <Pressable
      key="credito"
      accessibilityRole="button"
      accessibilityState={{ selected: creditSelected }}
      style={[styles.paymentCard, creditSelected && styles.paymentCardSelected]}
      onPress={() => {
        onPaymentConditionChange?.("credito");
        onChange("20");
      }}
    >
      <View style={[styles.paymentIconBox, creditSelected && styles.paymentIconBoxSelected]}>
        <MaterialCommunityIcons name="account-clock-outline" size={16} color={creditSelected ? "#ffffff" : "#0f766e"} />
      </View>
      <View style={styles.paymentTextBox}>
        <Text style={[styles.paymentTitle, creditSelected && styles.paymentTitleSelected]} numberOfLines={1}>Credito cliente</Text>
        <Text style={[styles.paymentCodeText, creditSelected && styles.paymentCodeTextSelected]}>CXC</Text>
      </View>
      {creditSelected ? (
        <View style={styles.checkDot}>
          <MaterialCommunityIcons name="check" size={13} color="#ffffff" />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  paymentBox: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    paddingHorizontal: 7,
    paddingVertical: 6,
    gap: 6
  },
  sectionTitle: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "900"
  },
  paymentList: {
    gap: 6,
    paddingRight: 8
  },
  paymentCard: {
    minWidth: 116,
    maxWidth: 184,
    minHeight: 38,
    borderWidth: 1,
    borderColor: "#dbe4ee",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    paddingHorizontal: 6,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  paymentCardSelected: {
    borderColor: "#0f766e",
    backgroundColor: "#ecfdf5"
  },
  paymentIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center"
  },
  paymentIconBoxSelected: {
    backgroundColor: "#0f766e"
  },
  paymentTextBox: {
    flex: 1,
    minWidth: 0
  },
  paymentTitle: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "900"
  },
  paymentTitleSelected: {
    color: "#065f46"
  },
  paymentCodeText: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "900",
    marginTop: 1
  },
  paymentCodeTextSelected: {
    color: "#0f766e"
  },
  checkDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center"
  },
  creditBox: {
    gap: 6
  },
  creditNote: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15
  }
});
