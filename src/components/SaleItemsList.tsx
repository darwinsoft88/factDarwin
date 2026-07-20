import React, { useCallback, useEffect, useRef } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { money, calculateLineDiscount, calculateLineSubtotal, calculateLineTax, calculateLineTotal } from "../sri";
import { SaleItem } from "../types";
import { catalogItemBadge, catalogItemIcon, isServiceItem } from "../utils/catalogItems";
import { formatQuantity } from "../utils/sales";

type SaleItemsListProps = {
  items: SaleItem[];
  onAdjustQuantity: (index: number, amount: number) => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
};

export function SaleItemsList({ items, onAdjustQuantity, onEdit, onDelete }: SaleItemsListProps) {
  const totalUnits = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  if (items.length === 0) {
    return (
      <View style={styles.cartBox}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Detalle de venta</Text>
          <Text style={styles.headerCount}>0 lineas | 0 unid.</Text>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Aun no hay productos o servicios. Busca uno arriba para agregarlo.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.cartBox}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Detalle de venta</Text>
        <Text style={styles.headerCount}>{items.length} linea{items.length === 1 ? "" : "s"} | {formatQuantity(totalUnits)} unid.</Text>
      </View>
      <View style={styles.gestureHint}>
        <MaterialCommunityIcons name="gesture-swipe-left" size={14} color="#0f766e" />
        <Text style={styles.gestureHintText}>Toque un item para editar. Deslice fuerte a la izquierda para eliminar.</Text>
      </View>
      {items.map((item, index) => {
        const rowKey = `${item.sourceLineKey || item.productId}-${item.code}-${index}`;
        return (
          <SaleItemRow
            key={rowKey}
            item={item}
            index={index}
            isLast={index === items.length - 1}
            onAdjustQuantity={onAdjustQuantity}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        );
      })}
    </View>
  );
}

type SwipeSaleItemRowProps = {
  item: SaleItem;
  index: number;
  isLast: boolean;
  onAdjustQuantity: (index: number, amount: number) => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
};

function SaleItemRow(props: SwipeSaleItemRowProps) {
  return <SwipeSaleItemRow {...props} />;
}

function SwipeSaleItemRow({ item, index, isLast, onAdjustQuantity, onEdit, onDelete }: SwipeSaleItemRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const rowWidthRef = useRef(0);

  const closeRow = useCallback((animated = true) => {
    if (animated) {
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 8, tension: 80 }).start();
      return;
    }
    translateX.setValue(0);
  }, [translateX]);

  useEffect(() => {
    closeRow(false);
  }, [closeRow, item.productId, item.code, item.quantity]);

  const deleteWithSlide = () => {
    const rowWidth = Math.max(rowWidthRef.current, 320);
    Animated.timing(translateX, { toValue: -rowWidth, duration: 180, useNativeDriver: true }).start(() => {
      translateX.setValue(0);
      onDelete(index);
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderMove: (_event, gesture) => {
        const rowWidth = Math.max(rowWidthRef.current, 320);
        const nextValue = Math.max(-rowWidth, Math.min(0, gesture.dx));
        translateX.setValue(nextValue);
      },
      onPanResponderRelease: (_event, gesture) => {
        const rowWidth = Math.max(rowWidthRef.current, 320);
        const shouldDelete = gesture.dx <= -(rowWidth * 0.45);
        if (shouldDelete) deleteWithSlide();
        else closeRow();
      },
      onPanResponderTerminate: () => closeRow()
    })
  ).current;
  const isService = isServiceItem(item);

  return (
    <View style={[styles.swipeRow, isLast && styles.lastRow]} onLayout={(event) => { rowWidthRef.current = event.nativeEvent.layout.width; }}>
      <View style={styles.deleteReveal} pointerEvents="none">
        <MaterialCommunityIcons name="trash-can-outline" size={20} color="#ffffff" />
        <Text style={styles.deleteRevealText}>Eliminar</Text>
      </View>
      <Animated.View style={[styles.row, { transform: [{ translateX }] }]} {...panResponder.panHandlers}>
        <Pressable accessibilityLabel={`Editar ${item.name}`} style={styles.itemTapArea} onPress={() => onEdit(index)}>
          <View style={[styles.itemIcon, isService && styles.serviceItemIcon]}>
            <MaterialCommunityIcons name={catalogItemIcon(item)} size={14} color={isService ? "#6d28d9" : "#047857"} />
          </View>
          <View style={styles.itemInfo}>
            <Text style={styles.itemTitle} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.itemMeta} numberOfLines={1}>
              {catalogItemBadge(item)} | Base ${money(calculateLineSubtotal(item))} | Desc. ${money(calculateLineDiscount(item))} | IVA ${money(calculateLineTax(item))}
            </Text>
          </View>
        </Pressable>
        <View style={styles.itemSide}>
          <View style={styles.quantityControls}>
            <Pressable accessibilityLabel="Disminuir cantidad" style={styles.qtyButton} onPress={() => onAdjustQuantity(index, -1)}>
              <MaterialCommunityIcons name="minus" size={15} color="#047857" />
            </Pressable>
            <Text style={styles.qtyText}>{item.quantity}</Text>
            <Pressable accessibilityLabel="Aumentar cantidad" style={styles.qtyButton} onPress={() => onAdjustQuantity(index, 1)}>
              <MaterialCommunityIcons name="plus" size={15} color="#047857" />
            </Pressable>
          </View>
          <Text style={styles.itemTotal}>${money(calculateLineTotal(item))}</Text>
        </View>
      </Animated.View>
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
  gestureHint: {
    marginHorizontal: 8,
    marginTop: 8,
    marginBottom: 3,
    borderRadius: 8,
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 9,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  gestureHintText: {
    flex: 1,
    color: "#0f766e",
    fontSize: 9,
    fontWeight: "800",
    lineHeight: 12
  },
  emptyState: {
    marginHorizontal: 10,
    marginVertical: 12,
    minHeight: 74,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#cbd5e1",
    borderRadius: 14,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 18
  },
  emptyText: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    textAlign: "center"
  },
  swipeRow: {
    position: "relative",
    overflow: "hidden",
    borderBottomWidth: 1,
    borderBottomColor: "#edf2f7",
    backgroundColor: "#dc2626"
  },
  row: {
    backgroundColor: "#ffffff",
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  simpleRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#edf2f7"
  },
  lastRow: {
    borderBottomWidth: 0
  },
  itemIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#dcfce7",
    alignItems: "center",
    justifyContent: "center"
  },
  serviceItemIcon: {
    backgroundColor: "#f5f3ff"
  },
  itemInfo: {
    flex: 1,
    minWidth: 0
  },
  itemTapArea: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  itemTitle: {
    color: "#111827",
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 14
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
    minWidth: 120,
    flexShrink: 0
  },
  quantityControls: {
    minHeight: 32,
    borderRadius: 999,
    backgroundColor: "#f8fafc",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 3
  },
  simpleActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4
  },
  qtyButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center"
  },
  qtyText: {
    minWidth: 22,
    color: "#111827",
    textAlign: "center",
    fontSize: 13,
    fontWeight: "900"
  },
  deleteReveal: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingLeft: "82%"
  },
  deleteRevealText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900"
  },
  webDeleteReveal: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingLeft: "82%"
  },
  webDeleteButton: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "#fee2e2",
    alignItems: "center",
    justifyContent: "center"
  },
  itemTotal: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "900"
  }
});
