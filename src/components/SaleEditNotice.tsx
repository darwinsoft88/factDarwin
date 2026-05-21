import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Sale } from "../types";

type SaleEditNoticeProps = {
  sourceTicket?: Sale;
  sourceProforma?: Sale;
  editingSale?: Sale;
  onCancel: () => void;
};

export function SaleEditNotice({ sourceTicket, sourceProforma, editingSale, onCancel }: SaleEditNoticeProps) {
  if (!sourceTicket && !sourceProforma && !editingSale) return null;

  const title = sourceTicket ? "Modo facturar ticket" : sourceProforma ? "Modo convertir proforma" : "Modo correccion";
  const message = sourceTicket
    ? "Se creara una factura SRI nueva con el siguiente secuencial de factura. Si autoriza, el ticket quedara convertido y no se duplicara el stock."
    : sourceProforma
      ? "Se creara un nuevo documento desde la proforma. La proforma no toca inventario ni SRI hasta convertirse."
      : "Puede corregir cliente, productos, precio, descuento o forma de pago. Se conservara la misma secuencia del documento.";
  const cancelLabel = sourceTicket ? "Cancelar facturacion" : sourceProforma ? "Cancelar conversion" : "Cancelar correccion";

  return (
    <View style={styles.editNoticeBox}>
      <Text style={styles.noticeTitle}>{title}</Text>
      <Text style={styles.noticeText}>{message}</Text>
      <Pressable style={styles.smallButton} onPress={onCancel}>
        <Text style={styles.smallButtonText}>{cancelLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  editNoticeBox: {
    borderWidth: 1,
    borderColor: "#fbbf24",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#fffbeb",
    gap: 8
  },
  noticeTitle: {
    color: "#166534",
    fontWeight: "900"
  },
  noticeText: {
    color: "#166534",
    marginTop: 3,
    lineHeight: 18
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
  }
});
