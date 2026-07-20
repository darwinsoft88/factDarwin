import React from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Empty } from "./common";
import { ReportRow } from "./metrics";
import { PaginationControls } from "./PaginationControls";
import { LIST_BATCH_SIZE } from "../constants/app";
import { calculateLineTotal, money } from "../sri";
import { AppData, Client, CreditPayment, Sale } from "../types";
import { creditBalance, creditPaymentScopeText, creditSaleScopeText, isCreditOverdue, isCreditPaymentVoided } from "../utils/credit";
import { documentNumber } from "../utils/documents";
import { formatShortDate } from "../utils/format";
import { paymentLabel } from "../utils/reportFormats";

type CreditDetailModalProps = {
  data: AppData;
  detailClient?: Client;
  detailPaidAmount: number;
  detailPayments: CreditPayment[];
  detailSale?: Sale;
  onClose: () => void;
  onOpenSaleDetail: (sale: Sale) => void;
  onOpenPaymentReceipt: (payment: CreditPayment) => void;
  onPageChange: (page: number) => void;
  onRegisterPayment: (sale: Sale) => void;
  onVoidPayment: (payment: CreditPayment) => void;
  page: number;
  visiblePayments: CreditPayment[];
};

export function CreditDetailModal({
  data,
  detailClient,
  detailPaidAmount,
  detailPayments,
  detailSale,
  onClose,
  onOpenSaleDetail,
  onOpenPaymentReceipt,
  onPageChange,
  onRegisterPayment,
  page,
  onVoidPayment,
  visiblePayments
}: CreditDetailModalProps) {
  return (
    <Modal visible={Boolean(detailSale)} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.detailHeaderText}>
              <Text style={styles.modalTitle}>Detalle de cuenta</Text>
              <Text style={styles.selectedMeta}>{detailSale ? documentNumber(detailSale, data.issuer) : ""}</Text>
            </View>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeText}>Cerrar</Text>
            </Pressable>
          </View>
          {detailSale ? (
            <ScrollView contentContainerStyle={styles.modalContent}>
              <View style={styles.detailHeader}>
                <View style={styles.detailHeaderText}>
                  <Text style={styles.selectedTitle}>{detailClient?.name || "Cliente"}</Text>
                  <Text style={styles.selectedMeta}>{detailClient?.identification || ""}{detailClient?.phone ? ` | ${detailClient.phone}` : ""}</Text>
                </View>
                <Text style={[styles.creditStatus, isCreditOverdue(detailSale) && styles.creditStatusDanger, creditBalance(detailSale) <= 0 && styles.creditStatusPaid]}>
                  {creditBalance(detailSale) <= 0 ? "Pagado" : isCreditOverdue(detailSale) ? "Vencido" : "Pendiente"}
                </Text>
              </View>
              <View style={styles.detailGrid}>
                <ReportRow label="Establecimiento origen" value={creditSaleScopeText(detailSale, data)} />
                <ReportRow label="Fecha emision" value={formatShortDate(detailSale.createdAt)} />
                <ReportRow label="Fecha vence" value={detailSale.creditDueDate ? formatShortDate(detailSale.creditDueDate) : "Sin fecha"} />
                <ReportRow label="Total factura" value={`$${money(detailSale.total)}`} />
                <ReportRow label="Total abonado" value={`$${money(detailPaidAmount)}`} />
                <ReportRow label="Saldo pendiente" value={`$${money(creditBalance(detailSale))}`} strong />
              </View>
              <Pressable style={styles.detailActionButton} onPress={() => onOpenSaleDetail(detailSale)}>
                <MaterialCommunityIcons name="file-document-outline" size={17} color="#0f766e" />
                <Text style={styles.detailActionText}>Enviar detalle de factura</Text>
              </Pressable>
              <View style={styles.itemsBox}>
                <Text style={styles.itemsTitle}>Items de la factura</Text>
                {detailSale.items.map((item, index) => (
                  <View key={`${item.productId}-${index}`} style={styles.itemRow}>
                    <View style={styles.itemTextBox}>
                      <Text style={styles.itemName} numberOfLines={1}>{item.quantity} x {item.name}</Text>
                      <Text style={styles.itemMeta} numberOfLines={1}>Cod. {item.code} | P.Unit. ${money(item.unitPrice)} | Desc. ${money(item.discount || 0)}</Text>
                    </View>
                    <Text style={styles.itemTotal}>${money(calculateLineTotal(item))}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.itemsBox}>
                <Text style={styles.itemsTitle}>Abonos registrados</Text>
                {detailPayments.length === 0 ? <Empty text="Aun no hay abonos para este documento." /> : null}
                {visiblePayments.map((payment) => (
                  <View key={payment.id} style={[styles.paymentRow, isCreditPaymentVoided(payment) && styles.paymentRowVoided]}>
                    <Pressable style={styles.itemTextBox} onPress={() => onOpenPaymentReceipt(payment)}>
                      <Text style={[styles.itemName, isCreditPaymentVoided(payment) && styles.voidedText]}>
                        ${money(payment.amount)} | {paymentLabel(payment.paymentMethod)}
                      </Text>
                      <Text style={styles.itemMeta}>
                        {formatShortDate(payment.createdAt)} | Cobro: {creditPaymentScopeText(payment, data)}{payment.note ? ` | ${payment.note}` : ""}{isCreditPaymentVoided(payment) ? ` | ANULADO ${payment.voidedAt ? formatShortDate(payment.voidedAt) : ""}` : ""}
                      </Text>
                    </Pressable>
                    <View style={styles.paymentActions}>
                      <Pressable style={styles.receiptBadge} onPress={() => onOpenPaymentReceipt(payment)}>
                        <MaterialCommunityIcons name="receipt-text-outline" size={15} color="#0f766e" />
                        <Text style={styles.receiptBadgeText}>Recibo</Text>
                      </Pressable>
                      {!isCreditPaymentVoided(payment) ? (
                        <Pressable style={styles.voidBadge} onPress={() => onVoidPayment(payment)}>
                          <MaterialCommunityIcons name="cancel" size={15} color="#b91c1c" />
                          <Text style={styles.voidBadgeText}>Anular</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                ))}
                <PaginationControls page={page} pageSize={LIST_BATCH_SIZE} totalItems={detailPayments.length} onPageChange={onPageChange} />
              </View>
              {creditBalance(detailSale) > 0 ? (
                <Pressable style={styles.modalPayButton} onPress={() => onRegisterPayment(detailSale)}>
                  <MaterialCommunityIcons name="cash-plus" size={18} color="#ffffff" />
                  <Text style={styles.primaryActionText}>Registrar abono</Text>
                </Pressable>
              ) : null}
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    padding: 14
  },
  modalCard: {
    maxHeight: "88%",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#dbe5ef"
  },
  modalHeader: {
    minHeight: 62,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  modalTitle: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "900"
  },
  modalContent: {
    padding: 12,
    gap: 10
  },
  closeButton: {
    borderWidth: 1,
    borderColor: "#0f766e",
    borderRadius: 8,
    minHeight: 36,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f0fdfa"
  },
  closeText: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "900"
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderWidth: 1,
    borderColor: "#e2e7f0",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#fbfdff"
  },
  detailHeaderText: {
    flex: 1,
    minWidth: 0
  },
  selectedTitle: {
    color: "#111827",
    fontWeight: "900"
  },
  selectedMeta: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700"
  },
  creditStatus: {
    borderRadius: 8,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#fef3c7",
    color: "#92400e",
    fontSize: 10,
    fontWeight: "900"
  },
  creditStatusDanger: {
    backgroundColor: "#fee2e2",
    color: "#b91c1c"
  },
  creditStatusPaid: {
    backgroundColor: "#dcfce7",
    color: "#166534"
  },
  detailGrid: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: "#ffffff"
  },
  detailActionButton: {
    minHeight: 40,
    borderWidth: 1,
    borderColor: "#99f6e4",
    borderRadius: 8,
    backgroundColor: "#f0fdfa",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7
  },
  detailActionText: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "900"
  },
  itemsBox: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 10,
    gap: 8,
    backgroundColor: "#ffffff"
  },
  itemsTitle: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "900"
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderColor: "#eef2f7",
    paddingTop: 8
  },
  itemTextBox: {
    flex: 1,
    minWidth: 0
  },
  itemName: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "900"
  },
  itemMeta: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2
  },
  itemTotal: {
    color: "#0f766e",
    fontSize: 12,
    fontWeight: "900"
  },
  paymentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderColor: "#eef2f7",
    paddingTop: 8
  },
  paymentRowVoided: {
    opacity: 0.72,
    backgroundColor: "#f8fafc"
  },
  paymentActions: {
    alignItems: "flex-end",
    gap: 6
  },
  receiptBadge: {
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#ecfdf5"
  },
  receiptBadgeText: {
    color: "#0f766e",
    fontSize: 11,
    fontWeight: "900"
  },
  voidBadge: {
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#fee2e2"
  },
  voidBadgeText: {
    color: "#b91c1c",
    fontSize: 11,
    fontWeight: "900"
  },
  voidedText: {
    color: "#64748b",
    textDecorationLine: "line-through"
  },
  modalPayButton: {
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: "#0f766e",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8
  },
  primaryActionText: {
    color: "#ffffff",
    fontWeight: "900"
  }
});
