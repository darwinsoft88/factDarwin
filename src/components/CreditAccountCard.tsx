import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

type CreditAccountCardProps = {
  balanceText: string;
  clientName: string;
  documentText: string;
  dueText: string;
  scopeText?: string;
  overdue?: boolean;
  paid?: boolean;
  onDetail: () => void;
  onPay?: () => void;
};

export function CreditAccountCard({
  balanceText,
  clientName,
  documentText,
  dueText,
  scopeText,
  overdue = false,
  paid = false,
  onDetail,
  onPay
}: CreditAccountCardProps) {
  return (
    <View style={[styles.creditCard, overdue && styles.creditCardOverdue, paid && styles.creditCardPaid]}>
      <View style={styles.creditCardHeader}>
        <View style={[styles.avatar, overdue && styles.avatarDanger, paid && styles.avatarPaid]}>
          <Text style={styles.avatarText}>{initials(clientName || "CL")}</Text>
        </View>
        <View style={styles.creditCardTitleBox}>
          <Text style={styles.creditClientName} numberOfLines={1}>{clientName || "Cliente"}</Text>
          <Text style={styles.creditDocument} numberOfLines={1}>{documentText}{scopeText ? ` | ${scopeText}` : ""}</Text>
        </View>
        <Text style={[styles.creditStatus, overdue && styles.creditStatusDanger, paid && styles.creditStatusPaid]}>{paid ? "Pagado" : overdue ? "Vencido" : "Pendiente"}</Text>
      </View>
      <View style={styles.creditCardMeta}>
        <Text style={[styles.creditDue, overdue && styles.creditDueDanger]}>{dueText}</Text>
        <View style={styles.balanceBox}>
          <Text style={styles.balanceLabel}>Saldo</Text>
          <Text style={[styles.balanceValue, overdue && styles.balanceDanger, paid && styles.balancePaid]}>{balanceText}</Text>
        </View>
      </View>
      <View style={styles.actionsRow}>
        <Pressable style={styles.secondaryAction} onPress={onDetail}>
          <MaterialCommunityIcons name="eye-outline" size={16} color="#0f766e" />
          <Text style={styles.secondaryActionText}>Detalle</Text>
        </Pressable>
        {onPay && !paid ? (
          <Pressable style={styles.primaryAction} onPress={onPay}>
            <MaterialCommunityIcons name="cash-plus" size={16} color="#ffffff" />
            <Text style={styles.primaryActionText}>Abonar</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "CL";
}

const styles = StyleSheet.create({
  creditCard: {
    borderWidth: 1,
    borderColor: "#dfe6ef",
    borderRadius: 8,
    padding: 11,
    backgroundColor: "#ffffff",
    gap: 10
  },
  creditCardOverdue: {
    borderColor: "#fecaca",
    backgroundColor: "#fffafa"
  },
  creditCardPaid: {
    borderColor: "#bbf7d0",
    backgroundColor: "#fbfffd"
  },
  creditCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center"
  },
  avatarDanger: {
    backgroundColor: "#dc2626"
  },
  avatarPaid: {
    backgroundColor: "#16a34a"
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900"
  },
  creditCardTitleBox: {
    flex: 1,
    minWidth: 0
  },
  creditClientName: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "900"
  },
  creditDocument: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2
  },
  creditStatus: {
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#fef3c7",
    color: "#92400e",
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 8,
    paddingVertical: 5
  },
  creditStatusDanger: {
    backgroundColor: "#fee2e2",
    color: "#b91c1c"
  },
  creditStatusPaid: {
    backgroundColor: "#dcfce7",
    color: "#15803d"
  },
  creditCardMeta: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8
  },
  creditDue: {
    color: "#0f766e",
    flex: 1,
    fontSize: 12,
    fontWeight: "900"
  },
  creditDueDanger: {
    color: "#dc2626"
  },
  balanceBox: {
    alignItems: "flex-end"
  },
  balanceLabel: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "900"
  },
  balanceValue: {
    color: "#0f766e",
    fontSize: 18,
    fontWeight: "900"
  },
  balanceDanger: {
    color: "#dc2626"
  },
  balancePaid: {
    color: "#16a34a"
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8
  },
  secondaryAction: {
    flex: 1,
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#99f6e4",
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6
  },
  secondaryActionText: {
    color: "#0f766e",
    fontWeight: "900"
  },
  primaryAction: {
    flex: 1,
    minHeight: 40,
    borderRadius: 8,
    backgroundColor: "#0f766e",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6
  },
  primaryActionText: {
    color: "#ffffff",
    fontWeight: "900"
  }
});
