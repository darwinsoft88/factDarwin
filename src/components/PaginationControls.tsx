import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

type PaginationControlsProps = {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  hasMoreItems?: boolean;
  loadingMore?: boolean;
  onRequestMore?: () => void;
};

export function PaginationControls({ page, pageSize, totalItems, onPageChange, hasMoreItems = false, loadingMore = false, onRequestMore }: PaginationControlsProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / Math.max(1, pageSize)));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const canGoBack = currentPage > 1;
  const canGoNext = currentPage < totalPages || hasMoreItems;

  if (totalItems <= pageSize && !hasMoreItems) {
    return totalItems > 0 ? <Text style={styles.summary}>Pagina 1 de 1 | {totalItems} registro(s)</Text> : null;
  }

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Pagina anterior"
        style={[styles.button, !canGoBack && styles.buttonDisabled]}
        disabled={!canGoBack}
        onPress={() => onPageChange(currentPage - 1)}
      >
        <MaterialCommunityIcons name="chevron-left" size={18} color={canGoBack ? "#0f766e" : "#94a3b8"} />
        <Text style={[styles.buttonText, !canGoBack && styles.buttonTextDisabled]}>Anterior</Text>
      </Pressable>
      <View style={styles.pageInfo}>
        <Text style={styles.pageText}>Pagina {currentPage} de {totalPages}</Text>
        <Text style={styles.countText}>{totalItems} registro(s)</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Pagina siguiente"
        style={[styles.button, !canGoNext && styles.buttonDisabled]}
        disabled={!canGoNext || loadingMore}
        onPress={() => {
          if (currentPage < totalPages) onPageChange(currentPage + 1);
          else onRequestMore?.();
        }}
      >
        <Text style={[styles.buttonText, (!canGoNext || loadingMore) && styles.buttonTextDisabled]}>{loadingMore ? "Cargando..." : "Siguiente"}</Text>
        <MaterialCommunityIcons name="chevron-right" size={18} color={canGoNext ? "#0f766e" : "#94a3b8"} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dbe4f0",
    backgroundColor: "#f8fafc",
    padding: 8
  },
  button: {
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 9,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 2
  },
  buttonDisabled: {
    borderColor: "#cbd5e1",
    backgroundColor: "#f1f5f9"
  },
  buttonText: {
    color: "#0f766e",
    fontSize: 11,
    fontWeight: "900"
  },
  buttonTextDisabled: {
    color: "#94a3b8"
  },
  pageInfo: {
    flex: 1,
    alignItems: "center"
  },
  pageText: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "900"
  },
  countText: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 1
  },
  summary: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center"
  }
});
