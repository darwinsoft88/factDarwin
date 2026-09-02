import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Input, Section } from "./common";
import { StatBox } from "./metrics";
import { money } from "../sri";
import { CreditScopeFilter } from "../utils/creditScope";
import { useAppTheme } from "../theme/AppTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export type CreditStatusFilter = "todos" | "vencidos" | "por_vencer";

type CreditOverviewSectionProps = {
  clientCount: number;
  clientSummaryOpen: boolean;
  currentScopeLabel: string;
  overdueTotal: number;
  paidHistoryOpen: boolean;
  search: string;
  setClientSummaryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setPaidHistoryOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setScopeFilter: (value: CreditScopeFilter) => void;
  setSearch: (value: string) => void;
  setStatusFilter: (value: CreditStatusFilter) => void;
  scopeFilter: CreditScopeFilter;
  statusFilter: CreditStatusFilter;
  totalPending: number;
  upcomingTotal: number;
};

const FILTERS: { label: string; value: CreditStatusFilter; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { label: "Por cobrar", value: "todos", icon: "cash-clock" },
  { label: "Vencidos", value: "vencidos", icon: "clock-alert-outline" },
  { label: "Por vencer", value: "por_vencer", icon: "calendar-clock" }
];

export function CreditOverviewSection({
  clientCount,
  clientSummaryOpen,
  currentScopeLabel,
  overdueTotal,
  paidHistoryOpen,
  search,
  setClientSummaryOpen,
  setPaidHistoryOpen,
  setScopeFilter,
  setSearch,
  setStatusFilter,
  scopeFilter,
  statusFilter,
  totalPending,
  upcomingTotal
}: CreditOverviewSectionProps) {
  const { theme } = useAppTheme();
  const chipStyle = (active: boolean) => ({
    borderColor: active ? theme.colors.primary : theme.colors.border,
    backgroundColor: active ? theme.colors.primarySoft : theme.colors.surface
  });
  const chipText = (active: boolean) => ({ color: active ? theme.colors.primary : theme.colors.textMuted });
  return (
    <Section title="Creditos y cobros">
      <View style={styles.scopeBox}>
        <Text style={[styles.scopeLabel, { color: theme.colors.textMuted }]}>Vista de cartera</Text>
        <View style={styles.scopeActions}>
          <Pressable style={[styles.scopeChip, chipStyle(scopeFilter === "active")]} onPress={() => setScopeFilter("active")}>
            <Text style={[styles.scopeText, chipText(scopeFilter === "active")]} numberOfLines={1}>Punto actual</Text>
            <Text style={[styles.scopeSubtext, chipText(scopeFilter === "active")]} numberOfLines={1}>{currentScopeLabel}</Text>
          </Pressable>
          <Pressable style={[styles.scopeChip, chipStyle(scopeFilter === "all")]} onPress={() => setScopeFilter("all")}>
            <Text style={[styles.scopeText, chipText(scopeFilter === "all")]} numberOfLines={1}>Toda empresa</Text>
            <Text style={[styles.scopeSubtext, chipText(scopeFilter === "all")]} numberOfLines={1}>Todos los puntos</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.statsGrid}>
        <StatBox label="Total por cobrar" value={`$${money(totalPending)}`} tone={totalPending > 0 ? "warning" : "success"} icon="wallet-outline" />
        <StatBox label="Vencido" value={`$${money(overdueTotal)}`} tone={overdueTotal > 0 ? "danger" : "success"} icon="clock-alert-outline" />
        <StatBox label="Por vencer" value={`$${money(upcomingTotal)}`} tone="info" icon="calendar-clock" />
        <StatBox label="Clientes con deuda" value={String(clientCount)} icon="account-group-outline" />
      </View>
      <Input label="Buscar cliente o factura" value={search} onChangeText={setSearch} placeholder="Nombre, RUC o secuencia" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {FILTERS.slice(0, 1).map((filter) => (
          <Pressable
            key={filter.value}
            style={[styles.filterChip, chipStyle(!clientSummaryOpen && !paidHistoryOpen && statusFilter === filter.value)]}
            onPress={() => {
              setClientSummaryOpen(false);
              setPaidHistoryOpen(false);
              setStatusFilter(filter.value);
            }}
          >
            <MaterialCommunityIcons name={filter.icon} size={18} color={chipText(!clientSummaryOpen && !paidHistoryOpen && statusFilter === filter.value).color} />
            <Text style={[styles.filterText, chipText(!clientSummaryOpen && !paidHistoryOpen && statusFilter === filter.value)]}>{filter.label}</Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.filterChip, chipStyle(clientSummaryOpen)]}
          onPress={() => {
            setPaidHistoryOpen(false);
            setStatusFilter("todos");
            setClientSummaryOpen((open) => !open);
          }}
        >
          <MaterialCommunityIcons name="account-outline" size={18} color={chipText(clientSummaryOpen).color} />
          <Text style={[styles.filterText, chipText(clientSummaryOpen)]}>Por cliente</Text>
        </Pressable>
        {FILTERS.slice(1).map((filter) => (
          <Pressable
            key={filter.value}
            style={[styles.filterChip, chipStyle(!clientSummaryOpen && !paidHistoryOpen && statusFilter === filter.value)]}
            onPress={() => {
              setClientSummaryOpen(false);
              setPaidHistoryOpen(false);
              setStatusFilter(filter.value);
            }}
          >
            <MaterialCommunityIcons name={filter.icon} size={18} color={chipText(!clientSummaryOpen && !paidHistoryOpen && statusFilter === filter.value).color} />
            <Text style={[styles.filterText, chipText(!clientSummaryOpen && !paidHistoryOpen && statusFilter === filter.value)]}>{filter.label}</Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.filterChip, chipStyle(paidHistoryOpen)]}
          onPress={() => {
            setClientSummaryOpen(false);
            setStatusFilter("todos");
            setPaidHistoryOpen((open) => !open);
          }}
        >
          <MaterialCommunityIcons name="history" size={18} color={chipText(paidHistoryOpen).color} />
          <Text style={[styles.filterText, chipText(paidHistoryOpen)]}>Historial</Text>
        </Pressable>
      </ScrollView>
    </Section>
  );
}

const styles = StyleSheet.create({
  scopeBox: {
    gap: 6
  },
  scopeLabel: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "900"
  },
  scopeActions: {
    flexDirection: "row",
    gap: 8
  },
  scopeChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#ffffff"
  },
  scopeChipActive: {
    borderColor: "#0f766e",
    backgroundColor: "#ecfdf5"
  },
  scopeText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900"
  },
  scopeSubtext: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800",
    marginTop: 2
  },
  scopeTextActive: {
    color: "#0f766e"
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  filterRow: {
    alignItems: "center",
    gap: 8,
    paddingRight: 4
  },
  filterChip: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    minHeight: 38,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
    backgroundColor: "#ffffff"
  },
  filterChipActive: {
    borderColor: "#0f766e",
    backgroundColor: "#ecfdf5"
  },
  filterText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "900"
  },
  filterTextActive: {
    color: "#0f766e"
  }
});
