import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "../theme/AppTheme";
import { ThemedAccentCard } from "./ThemedAccentCard";

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
  const { theme } = useAppTheme();
  const stateColor = paid ? theme.colors.success : overdue ? theme.colors.danger : theme.colors.warning;
  const stateSoft = paid ? theme.colors.successSoft : overdue ? theme.colors.dangerSoft : theme.colors.warningSoft;
  return (
    <ThemedAccentCard tone={paid ? "success" : overdue ? "danger" : "warning"} style={styles.creditCard}>
      <View style={styles.creditCardHeader}>
        <View style={[styles.avatar, { backgroundColor: paid ? theme.colors.success : overdue ? theme.colors.danger : theme.colors.primary }]}>
          <Text style={[styles.avatarText, { color: theme.colors.onPrimary }]}>{initials(clientName || "CL")}</Text>
        </View>
        <View style={styles.creditCardTitleBox}>
          <Text style={[styles.creditClientName, { color: theme.colors.text }]} numberOfLines={1}>{clientName || "Cliente"}</Text>
          <Text style={[styles.creditDocument, { color: theme.colors.textMuted }]} numberOfLines={1}>{documentText}</Text>
          {scopeText ? (
            <View style={styles.scopeRow}>
              <MaterialCommunityIcons name="storefront-outline" size={13} color={theme.colors.primary} />
              <Text style={[styles.creditScope, { color: theme.colors.primary }]} numberOfLines={1}>{scopeText}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.creditStatus, { backgroundColor: stateSoft, color: stateColor }]}>{paid ? "Pagado" : overdue ? "Vencido" : "Pendiente"}</Text>
      </View>
      <View style={styles.creditCardMeta}>
        <Text style={[styles.creditDue, { color: overdue ? theme.colors.danger : theme.colors.primary }]}>{dueText}</Text>
        <View style={styles.balanceBox}>
          <Text style={[styles.balanceLabel, { color: theme.colors.textMuted }]}>Saldo</Text>
          <Text style={[styles.balanceValue, { color: paid ? theme.colors.success : overdue ? theme.colors.danger : theme.colors.primary }]}>{balanceText}</Text>
        </View>
      </View>
      <View style={styles.actionsRow}>
        <Pressable style={[styles.secondaryAction, { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface }]} onPress={onDetail}>
          <MaterialCommunityIcons name="eye-outline" size={16} color={theme.colors.primary} />
          <Text style={[styles.secondaryActionText, { color: theme.colors.primary }]}>Detalle</Text>
        </Pressable>
        {onPay && !paid ? (
          <Pressable style={[styles.primaryAction, { backgroundColor: theme.colors.primary }]} onPress={onPay}>
            <MaterialCommunityIcons name="cash-plus" size={16} color={theme.colors.onPrimary} />
            <Text style={[styles.primaryActionText, { color: theme.colors.onPrimary }]}>Abonar</Text>
          </Pressable>
        ) : null}
      </View>
    </ThemedAccentCard>
  );
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "CL";
}

const styles = StyleSheet.create({
  creditCard: {
    padding: 11,
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
  scopeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4
  },
  creditScope: {
    flex: 1,
    fontSize: 10,
    fontWeight: "800"
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
