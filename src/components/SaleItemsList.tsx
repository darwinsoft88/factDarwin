import React from "react";
import { money, calculateLineDiscount, calculateLineSubtotal, calculateLineTax, calculateLineTotal } from "../services/sri";
import { SaleItem } from "../types";
import { Pressable, StyleSheet, Text, View } from "react-native";

type SaleItemsListProps = {
  items: SaleItem[];
  onAdjustQuantity: (index: number, amount: number) => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
};

function EditGlyph() {
  return (
    <View style={styles.editGlyphBox}>
      <View style={styles.editGlyphLine} />
    </View>
  );
}

function TrashGlyph() {
  return (
    <View style={styles.trashGlyph}>
      <View style={styles.trashLid} />
      <View style={styles.trashBody}>
        <View style={styles.trashLine} />
        <View style={styles.trashLine} />
      </View>
    </View>
  );
}

export function SaleItemsList({ items, onAdjustQuantity, onEdit, onDelete }: SaleItemsListProps) {
  if (items.length === 0) return null;

  return (
    <View style={styles.cartBox}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Detalle de venta</Text>
        <Text style={styles.headerCount}>{items.length} item{items.length === 1 ? "" : "s"}</Text>
      </View>
      {items.map((item, index) => (
        <View key={`${item.productId}-${index}`} style={[styles.row, index === items.length - 1 && styles.lastRow]}>
          <View style={styles.itemIcon}>
            <Text style={styles.itemIconText}>▣</Text>
          </View>
          <View style={styles.itemInfo}>
            <Text style={styles.itemTitle} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.itemMeta} numberOfLines={1}>
              Base ${money(calculateLineSubtotal(item))} | Desc. ${money(calculateLineDiscount(item))} | IVA ${money(calculateLineTax(item))}
            </Text>
          </View>
          <View style={styles.itemSide}>
            <View style={styles.quantityControls}>
              <Pressable style={styles.qtyButton} onPress={() => onAdjustQuantity(index, -1)}>
                <Text style={styles.qtyButtonText}>-</Text>
              </Pressable>
              <Text style={styles.qtyText}>{item.quantity}</Text>
              <Pressable style={styles.qtyButton} onPress={() => onAdjustQuantity(index, 1)}>
                <Text style={styles.qtyButtonText}>+</Text>
              </Pressable>
              <Pressable accessibilityLabel="Editar precio y descuento" style={styles.editActionButton} onPress={() => onEdit(index)}>
                <EditGlyph />
              </Pressable>
              <Pressable accessibilityLabel="Eliminar producto" style={styles.deleteIconButton} onPress={() => onDelete(index)}>
                <TrashGlyph />
              </Pressable>
            </View>
            <Text style={styles.itemTotal}>${money(calculateLineTotal(item))}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  cartBox: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    overflow: "hidden"
  },
  header: {
    minHeight: 32,
    paddingHorizontal: 9,
    paddingVertical: 7,
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  headerTitle: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "900"
  },
  headerCount: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800"
  },
  row: {
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#edf2f7",
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  lastRow: {
    borderBottomWidth: 0
  },
  itemInfo: {
    flex: 1,
    minWidth: 0
  },
  itemIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#dcfce7",
    alignItems: "center",
    justifyContent: "center"
  },
  itemIconText: {
    color: "#047857",
    fontSize: 13,
    fontWeight: "900"
  },
  itemTitle: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 15
  },
  itemMeta: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "700",
    lineHeight: 12
  },
  itemSide: {
    alignItems: "flex-end",
    gap: 5,
    minWidth: 118
  },
  itemTotal: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "900"
  },
  quantityControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 5
  },
  qtyButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center"
  },
  qtyButtonText: {
    color: "#047857",
    fontSize: 16,
    fontWeight: "900"
  },
  qtyText: {
    minWidth: 16,
    color: "#111827",
    textAlign: "center",
    fontSize: 12,
    fontWeight: "900"
  },
  editActionButton: {
    width: 26,
    height: 26,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row"
  },
  editGlyphBox: {
    width: 12,
    height: 12,
    borderWidth: 1.5,
    borderColor: "#1d4ed8",
    borderRadius: 3,
    justifyContent: "center",
    alignItems: "center"
  },
  editGlyphLine: {
    width: 7,
    height: 1.5,
    borderRadius: 2,
    backgroundColor: "#1d4ed8",
    transform: [{ rotate: "-25deg" }]
  },
  deleteIconButton: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: "#fee2e2",
    alignItems: "center",
    justifyContent: "center"
  },
  trashGlyph: {
    width: 14,
    height: 16,
    alignItems: "center",
    justifyContent: "flex-end"
  },
  trashLid: {
    width: 12,
    height: 2,
    borderRadius: 2,
    backgroundColor: "#991b1b",
    marginBottom: 1
  },
  trashBody: {
    width: 11,
    height: 12,
    borderWidth: 2,
    borderTopWidth: 1,
    borderColor: "#991b1b",
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    flexDirection: "row",
    justifyContent: "center",
    gap: 2,
    paddingTop: 2
  },
  trashLine: {
    width: 1,
    height: 7,
    borderRadius: 1,
    backgroundColor: "#991b1b"
  }
});
