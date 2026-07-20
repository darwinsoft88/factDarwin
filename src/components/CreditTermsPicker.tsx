import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PaymentCondition } from "../types";
import { Input } from "./common";

type CreditTermsPickerProps = {
  value: PaymentCondition;
  dueDate: string;
  onChange: (value: PaymentCondition) => void;
  onDueDateChange: (value: string) => void;
};

export function CreditTermsPicker({ value, dueDate, onChange, onDueDateChange }: CreditTermsPickerProps) {
  const creditSelected = value === "credito";

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Forma de pago</Text>
      <View style={styles.row}>
        <CreditChoice
          icon="cash-check"
          label="Pago inmediato"
          active={value === "contado"}
          onPress={() => onChange("contado")}
        />
        <CreditChoice
          icon="account-clock-outline"
          label="Credito cliente"
          active={creditSelected}
          onPress={() => onChange("credito")}
        />
      </View>
      {creditSelected ? (
        <View style={styles.creditBox}>
          <Input
            label="Vence el"
            value={dueDate}
            onChangeText={onDueDateChange}
            placeholder="AAAA-MM-DD"
          />
          <Text style={styles.note}>Se registra como cuenta por cobrar. Para el SRI se informa como 20 - otros sistema financiero.</Text>
        </View>
      ) : null}
    </View>
  );
}

function CreditChoice({
  icon,
  label,
  active,
  onPress
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} style={[styles.choice, active && styles.choiceActive]} onPress={onPress}>
      <View style={[styles.iconBox, active && styles.iconBoxActive]}>
        <MaterialCommunityIcons name={icon} size={17} color={active ? "#ffffff" : "#0f766e"} />
      </View>
      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
      {active ? <MaterialCommunityIcons name="check-circle" size={18} color="#0f766e" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: 7
  },
  title: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "900"
  },
  row: {
    flexDirection: "row",
    gap: 8
  },
  choice: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderColor: "#dbe4ee",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  choiceActive: {
    borderColor: "#0f766e",
    backgroundColor: "#ecfdf5"
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center"
  },
  iconBoxActive: {
    backgroundColor: "#0f766e"
  },
  choiceText: {
    flex: 1,
    color: "#475569",
    fontSize: 11,
    fontWeight: "900"
  },
  choiceTextActive: {
    color: "#065f46"
  },
  creditBox: {
    gap: 6
  },
  note: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15
  }
});
