import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { calculateLineTotal, money } from "../services/sri";
import { Issuer, Sale } from "../types";
import { documentNumber } from "../utils/documents";
import { parseDecimal, sanitizeDecimalInput } from "../utils/numbers";
import { buildCreditNoteItem, formatQuantity, getCreditLineAvailable, getCreditLineKey } from "../utils/sales";
import { Input, PrimaryButton } from "./common";

type CreditNoteTotals = {
  subtotal: number;
  tax: number;
  total: number;
};

type CreditNoteModalProps = {
  source?: Sale;
  issuer: Issuer;
  sales: Sale[];
  reason: string;
  quantities: Record<string, string>;
  totals: CreditNoteTotals;
  issuing: boolean;
  onReasonChange: (value: string) => void;
  onQuantityChange: (lineKey: string, value: string) => void;
  onSelectAll: () => void;
  onClose: () => void;
  onIssue: () => void;
};

export function CreditNoteModal({
  source,
  issuer,
  sales,
  reason,
  quantities,
  totals,
  issuing,
  onReasonChange,
  onQuantityChange,
  onSelectAll,
  onClose,
  onIssue
}: CreditNoteModalProps) {
  return (
    <Modal visible={Boolean(source)} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.creditModalBackdrop}>
        <View style={styles.creditModal}>
          <View style={styles.creditModalHeader}>
            <View style={styles.flex}>
              <Text style={styles.creditModalTitle}>Nota de credito</Text>
              <Text style={styles.creditModalMeta}>{source ? `Factura ${documentNumber(source, issuer)}` : ""}</Text>
            </View>
            <Pressable style={styles.smallButton} onPress={onClose}>
              <Text style={styles.smallButtonText}>Cerrar</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.creditModalContent}>
            <Input label="Motivo" value={reason} onChangeText={onReasonChange} placeholder="Ej: devolucion parcial" />
            <Pressable style={styles.creditSelectAllButton} onPress={onSelectAll}>
              <Text style={styles.creditSelectAllText}>Seleccionar todo disponible</Text>
            </Pressable>
            {source?.items.map((item, index) => {
              const lineKey = getCreditLineKey(item, index);
              const available = getCreditLineAvailable(sales, source, item, index);
              const selectedQuantity = Math.max(0, parseDecimal(quantities[lineKey] || "0") || 0);
              const selectedItem = selectedQuantity > 0 ? buildCreditNoteItem(item, selectedQuantity, lineKey) : undefined;
              return (
                <View key={lineKey} style={styles.creditLineCard}>
                  <Text style={styles.creditLineTitle}>{item.code} - {item.name}</Text>
                  <Text style={styles.creditLineMeta}>Facturado: {formatQuantity(item.quantity)} | Disponible: {formatQuantity(available)} | Total linea: ${money(calculateLineTotal(item))}</Text>
                  <View style={styles.row}>
                    <View style={styles.flex}>
                      <Input
                        label="Cantidad a devolver"
                        value={quantities[lineKey] || "0"}
                        onChangeText={(value) => onQuantityChange(lineKey, sanitizeDecimalInput(value))}
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={styles.creditLineTotalBox}>
                      <Text style={styles.creditLineMeta}>Valor</Text>
                      <Text style={styles.creditLineTotal}>{selectedItem ? `$${money(calculateLineTotal(selectedItem))}` : "$0.00"}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
            <View style={styles.creditTotalsBox}>
              <Text style={styles.totalLine}>Subtotal: ${money(totals.subtotal)}</Text>
              <Text style={styles.totalLine}>IVA: ${money(totals.tax)}</Text>
              <Text style={styles.totalStrong}>Total nota credito: ${money(totals.total)}</Text>
            </View>
            <PrimaryButton label={issuing ? "Procesando..." : "Emitir nota de credito"} onPress={issuing ? () => undefined : onIssue} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  creditModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "flex-end",
    padding: 12
  },
  creditModal: {
    maxHeight: "92%",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden"
  },
  creditModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb"
  },
  flex: {
    flex: 1,
    minWidth: 130
  },
  creditModalTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900"
  },
  creditModalMeta: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 3
  },
  smallButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#e6fffb",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  smallButtonText: {
    color: "#0f5f59",
    fontWeight: "900"
  },
  creditModalContent: {
    padding: 14,
    gap: 10
  },
  creditSelectAllButton: {
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12
  },
  creditSelectAllText: {
    color: "#3730a3",
    fontWeight: "900"
  },
  creditLineCard: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    padding: 10,
    gap: 8,
    backgroundColor: "#f8fafc"
  },
  creditLineTitle: {
    color: "#111827",
    fontWeight: "900"
  },
  creditLineMeta: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: 10
  },
  creditLineTotalBox: {
    minWidth: 100,
    borderRadius: 8,
    backgroundColor: "#ecfdf5",
    padding: 10,
    gap: 2
  },
  creditLineTotal: {
    color: "#0f766e",
    fontWeight: "900",
    fontSize: 16
  },
  creditTotalsBox: {
    borderRadius: 8,
    backgroundColor: "#ecfdf5",
    padding: 12,
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
